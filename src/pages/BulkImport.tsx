import React, { useState } from 'react';
import Papa from 'papaparse';
import { collection, writeBatch, doc, getDocFromServer, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/AuthProvider';
import { Order, OrderItem, OrderStatus, PaymentStatus, PaymentMethod } from '../types';
import { logAction, handleFirestoreError, OperationType } from '../utils';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  ArrowLeft,
  Info,
  Download
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../constants';

interface CSVRow {
  'booking number': string;
  'Customer Name': string;
  'customer ref': string;
  'customer id': string;
  'Email': string;
  'scheduled pickup date'?: string;
  'Pickup Date'?: string;
  'Store ID': string;
  'payment state': string;
  'method': string;
  'SKU 1': string;
  'quantity 1': string;
  'SKU 2': string;
  'quantity 2': string;
  'SKU 3': string;
  'quantity 3': string;
  'order note': string;
  'Warehouse': string;
}

export const BulkImport = () => {
  const { profile, activeWarehouse } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [error, setError] = useState('');

  const downloadTemplate = () => {
    const headers = [
      'booking number',
      'Customer Name',
      'customer ref',
      'customer id',
      'Email',
      'scheduled pickup date',
      'Store ID',
      'payment state',
      'method',
      'SKU 1',
      'quantity 1',
      'SKU 2',
      'quantity 2',
      'SKU 3',
      'quantity 3',
      'order note',
      'Warehouse'
    ];
    
    const sampleData = [
      'BK-1001',
      'John Doe',
      'REF-999',
      'CUST-123',
      'john@example.com',
      '2024-03-25',
      'SHOPIFY_NZ_01',
      'Paid',
      'Cash',
      'SKU-001',
      '2',
      'SKU-002',
      '1',
      '',
      '',
      'Handle with care',
      'AKL'
    ];

    const csvContent = [headers.join(','), sampleData.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'order_import_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError('');
      setResults(null);
    }
  };

  const processImport = async () => {
    if (!file || !profile || !activeWarehouse) return;

    setImporting(true);
    setError('');
    setResults(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (resultsData) => {
        const rows = resultsData.data as CSVRow[];
        let successCount = 0;
        let failedCount = 0;
        const errors: string[] = [];

        try {
          // 1. Pre-validation: Check for duplicates within the CSV and in Firestore
          const bookingNumbers = rows.map(row => row['booking number']?.toString().trim().toUpperCase()).filter(Boolean);
          const refNumbers = rows.map(row => row['customer ref']?.toString().trim().toUpperCase()).filter(Boolean);

          // Check for duplicates within the CSV itself
          const uniqueBookings = new Set(bookingNumbers);
          if (uniqueBookings.size !== bookingNumbers.length) {
            const duplicates = bookingNumbers.filter((item, index) => bookingNumbers.indexOf(item) !== index);
            throw new Error(`The CSV contains duplicate Booking Numbers: ${[...new Set(duplicates)].join(', ')}`);
          }

          const uniqueRefs = new Set(refNumbers);
          if (uniqueRefs.size !== refNumbers.length) {
            const duplicates = refNumbers.filter((item, index) => refNumbers.indexOf(item) !== index);
            throw new Error(`The CSV contains duplicate Customer References: ${[...new Set(duplicates)].join(', ')}`);
          }

          // Check for duplicates in Firestore
          // We'll check in chunks to avoid hitting limits or being too slow
          const chunkSize = 10;
          for (let i = 0; i < bookingNumbers.length; i += chunkSize) {
            const chunk = bookingNumbers.slice(i, i + chunkSize);
            const promises = chunk.map(async (bn) => {
              const docRef = doc(db, 'orders', bn);
              const snap = await getDocFromServer(docRef);
              if (snap.exists()) {
                const warehouse = snap.data()?.warehouseId || 'another warehouse';
                throw new Error(`Booking Number [${bn}] already exists in ${warehouse}.`);
              }
            });
            await Promise.all(promises);
          }

          for (let i = 0; i < refNumbers.length; i += chunkSize) {
            const chunk = refNumbers.slice(i, i + chunkSize);
            const promises = chunk.map(async (rn) => {
              const q = query(collection(db, 'orders'), where('refNumber', '==', rn));
              const snap = await getDocs(q);
              if (!snap.empty) {
                const warehouse = snap.docs[0].data()?.warehouseId || 'another warehouse';
                throw new Error(`Customer Reference [${rn}] already exists in ${warehouse}.`);
              }
            });
            await Promise.all(promises);
          }

          // 2. Fetch SKU details for auto-completion
          const allSkusInCsv = new Set<string>();
          rows.forEach(row => {
            for (let i = 1; i <= 3; i++) {
              const sku = row[`SKU ${i}` as keyof CSVRow]?.toString().trim().toUpperCase();
              if (sku) allSkusInCsv.add(sku);
            }
          });

          const skuMap = new Map<string, { productName: string; location: string }>();
          const skuList = Array.from(allSkusInCsv);
          
          // Fetch SKUs in chunks of 10 (Firestore 'in' limit is 30, but we'll be safe)
          for (let i = 0; i < skuList.length; i += 10) {
            const chunk = skuList.slice(i, i + 10);
            const q = query(collection(db, 'skus'), where('sku', 'in', chunk));
            const snap = await getDocs(q);
            snap.forEach(doc => {
              const data = doc.data();
              if (data.sku) {
                skuMap.set(data.sku.toUpperCase(), { 
                  productName: data.productName || '', 
                  location: data.location || '' 
                });
              }
            });
          }

          // 3. Group rows into batches of 500
          const BATCH_SIZE = 500;
          const batches: CSVRow[][] = [];
          for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            batches.push(rows.slice(i, i + BATCH_SIZE));
          }

          const allImportedIds: string[] = [];
          for (const batchRows of batches) {
            const batch = writeBatch(db);
            
            for (const row of batchRows) {
              const bookingNumber = row['booking number']?.toString().trim().toUpperCase();
              const customerName = row['Customer Name']?.toString().trim();
              const email = row['Email']?.toString().trim();
              const storeId = row['Store ID']?.toString().trim().toUpperCase().replace(/\s+/g, '_');
              const paymentState = row['payment state']?.toString().trim();
              const sku1 = row['SKU 1']?.toString().trim();
              const qty1 = parseInt(row['quantity 1']?.toString() || '0');
              const warehouse = row['Warehouse']?.toString().trim();
              
              // Try to get pickup date from multiple possible column names
              let pickupDateRaw = (row['scheduled pickup date'] || row['Pickup Date'])?.toString().trim() || '';
              
              // Sanitize date format (e.g., 2026/3/25 -> 2026-03-25)
              if (pickupDateRaw && pickupDateRaw.includes('/')) {
                const parts = pickupDateRaw.split('/');
                if (parts.length === 3) {
                  // Assume YYYY/M/D or M/D/YYYY
                  if (parts[0].length === 4) {
                    // YYYY/M/D
                    const y = parts[0];
                    const m = parts[1].padStart(2, '0');
                    const d = parts[2].padStart(2, '0');
                    pickupDateRaw = `${y}-${m}-${d}`;
                  } else if (parts[2].length === 4) {
                    // M/D/YYYY
                    const m = parts[0].padStart(2, '0');
                    const d = parts[1].padStart(2, '0');
                    const y = parts[2];
                    pickupDateRaw = `${y}-${m}-${d}`;
                  }
                }
              }

              // Validation for required fields
              if (!bookingNumber || !customerName || !email || !storeId || !paymentState || !sku1 || isNaN(qty1) || qty1 <= 0 || !warehouse) {
                failedCount++;
                const missing = [];
                if (!bookingNumber) missing.push('booking number');
                if (!customerName) missing.push('Customer Name');
                if (!email) missing.push('Email');
                if (!storeId) missing.push('Store ID');
                if (!paymentState) missing.push('payment state');
                if (!sku1 || isNaN(qty1) || qty1 <= 0) missing.push('SKU 1/quantity 1');
                if (!warehouse) missing.push('Warehouse');
                
                errors.push(`Row ${successCount + failedCount + 1} missing required fields: ${missing.join(', ')}`);
                continue;
              }

              // SKU Integration: Convert 3 SKU columns to items array, skip empty columns
              const items: OrderItem[] = [];
              for (let i = 1; i <= 3; i++) {
                const sku = row[`SKU ${i}` as keyof CSVRow]?.toString().trim().toUpperCase();
                const qty = parseInt(row[`quantity ${i}` as keyof CSVRow]?.toString() || '0');
                if (sku && !isNaN(qty) && qty > 0) {
                  const skuDetails = skuMap.get(sku);
                  items.push({ 
                    sku, 
                    qty,
                    productName: skuDetails?.productName || '',
                    location: skuDetails?.location || ''
                  });
                }
              }

              // Determine payment status and method
              const paymentStatus: PaymentStatus = paymentState.toLowerCase().includes('paid') ? 'Paid' : 'Unpaid';
              const methodStr = row['method']?.toString().toLowerCase() || '';
              let paymentMethod: PaymentMethod | null = null;
              if (methodStr.includes('cash')) paymentMethod = 'Cash';
              else if (methodStr.includes('eftpos')) paymentMethod = 'EFTPOS';
              else if (methodStr.includes('transfer')) paymentMethod = 'Bank Transfer';
              else if (methodStr.includes('online')) paymentMethod = 'Online Payment';

              const orderData: Order = {
                bookingNumber,
                refNumber: row['customer ref']?.toString().trim().toUpperCase() || '',
                customerName,
                customerId: row['customer id']?.toString().trim() || '',
                customerEmail: email,
                storeId: storeId,
                pickupDateScheduled: pickupDateRaw,
                notes: row['order note']?.toString().trim() || '',
                items,
                warehouseId: warehouse,
                paymentStatus,
                paymentMethod,
                status: 'Created' as OrderStatus,
                createdBy: profile.name,
                creatorEmail: profile.username,
                creatorUid: profile.uid,
                createdTime: new Date().toISOString(),
                sendPickupEmail: false
              };

              const orderRef = doc(db, 'orders', bookingNumber);
              batch.set(orderRef, orderData);
              
              // Add to System Logs for each order
              const logRef = doc(collection(db, 'logs'));
              batch.set(logRef, {
                timestamp: new Date().toISOString(),
                userId: profile.uid,
                userName: profile.name,
                action: 'Bulk Created',
                details: `Order ${bookingNumber} created via bulk import.`,
                orderId: bookingNumber
              });

              allImportedIds.push(bookingNumber);
              successCount++;
            }

            await batch.commit();
          }

          setResults({ success: successCount, failed: failedCount, errors });
          await logAction(profile, 'Bulk Import', `Imported ${successCount} orders from ${file.name}`);
        } catch (err: any) {
          console.error('Import error:', err);
          setError(`Import failed: ${err.message}`);
        } finally {
          setImporting(false);
        }
      },
      error: (err) => {
        console.error('Parse error:', err);
        setError(`Failed to parse CSV: ${err.message}`);
        setImporting(false);
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/orders" className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <ArrowLeft className="w-6 h-6 text-slate-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bulk Order Import</h1>
          <p className="text-slate-500">Upload a CSV file to import multiple orders at once.</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm space-y-8">
        <div className="bg-indigo-50 p-4 rounded-xl flex gap-3 text-indigo-700 text-sm">
          <Info className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1 space-y-1">
            <p className="font-bold">CSV Template Requirements:</p>
            <ul className="list-disc list-inside space-y-1 opacity-90">
              <li>Required columns: <span className="font-mono">booking number, Customer Name, Email, Store ID, payment state, SKU 1, quantity 1, Warehouse</span></li>
              <li>Optional columns: <span className="font-mono">customer ref, customer id, scheduled pickup date, method, SKU 2-3, quantity 2-3, order note</span></li>
              <li>Items: Automatically merges SKU 1-3 into a single order.</li>
            </ul>
          </div>
          <button 
            onClick={downloadTemplate}
            className="flex items-center gap-2 bg-white text-indigo-600 px-4 py-2 rounded-lg font-bold hover:bg-indigo-100 transition-colors shadow-sm h-fit"
          >
            <Download className="w-4 h-4" />
            Download Template
          </button>
        </div>

        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">Select CSV File</label>
          <div className="flex items-center justify-center w-full">
            <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-slate-200 border-dashed rounded-2xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-all">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-12 h-12 text-slate-400 mb-4" />
                <p className="mb-2 text-sm text-slate-500">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-slate-400">CSV files only</p>
                {file && (
                  <div className="mt-4 flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-slate-200 text-indigo-600 font-medium">
                    <FileText className="w-4 h-4" />
                    {file.name}
                  </div>
                )}
              </div>
              <input type="file" className="hidden" accept=".csv" onChange={handleFileChange} />
            </label>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {results && (
          <div className={`p-6 rounded-2xl border ${results.failed === 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
            <div className="flex items-center gap-3 mb-4">
              {results.failed === 0 ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              ) : (
                <AlertCircle className="w-6 h-6 text-amber-600" />
              )}
              <h3 className={`text-lg font-bold ${results.failed === 0 ? 'text-emerald-900' : 'text-amber-900'}`}>
                Import Complete
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-white p-4 rounded-xl border border-black/5">
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Successfully Imported</p>
                <p className="text-2xl font-bold text-emerald-600">{results.success}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-black/5">
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Failed Rows</p>
                <p className="text-2xl font-bold text-rose-600">{results.failed}</p>
              </div>
            </div>
            {results.errors.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-bold text-slate-700">Errors:</p>
                <div className="max-h-40 overflow-y-auto bg-white/50 p-3 rounded-lg text-xs font-mono text-rose-700 space-y-1">
                  {results.errors.map((err, i) => (
                    <p key={i}>{err}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={() => navigate('/orders')}
            className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={processImport}
            disabled={!file || importing}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-indigo-200"
          >
            {importing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                Start Import
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
