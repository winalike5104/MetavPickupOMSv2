import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { z } from 'zod';
import { 
  collection, 
  doc, 
  runTransaction, 
  serverTimestamp, 
  query, 
  where, 
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/AuthProvider';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ArrowLeft, 
  Trash2, 
  Save, 
  Play, 
  Info,
  ChevronRight,
  Database,
  History,
  AlertTriangle
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Order, OrderItem, OrderStatus, PaymentStatus, PaymentMethod } from '../types';
import { cn } from '../utils';

// 1. Zod Schema for Validation
const orderRowSchema = z.object({
  'booking number': z.string().min(1, "Booking number is required"),
  'Customer Name': z.string().min(1, "Customer name is required"),
  'customer ref': z.string().min(1, "Customer ref is required"),
  'customer id': z.string().optional(),
  'Email': z.string().email("Invalid email format"),
  'scheduled pickup date': z.string().optional().transform(val => {
    if (!val || val.trim() === '' || val.toLowerCase() === 'n/a') {
      return new Date().toISOString().split('T')[0];
    }
    const d = new Date(val);
    if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
    return d.toISOString().split('T')[0];
  }),
  'Store ID': z.string().min(1, "Store ID is required"),
  'payment state': z.string().refine(val => ['paid', 'unpaid'].includes(val.toLowerCase()), {
    message: "Payment state must be Paid or Unpaid"
  }),
  'method': z.string().optional(),
  'SKU 1': z.string().min(1, "SKU 1 is required"),
  'quantity 1': z.string().transform(val => parseInt(val, 10)).refine(val => !isNaN(val) && val > 0, {
    message: "Quantity 1 must be a positive number"
  }),
  'Warehouse': z.string().refine(val => ['AKL', 'CHC'].includes(val), {
    message: "Warehouse must be AKL or CHC"
  })
}).refine(data => {
  if (data['payment state'].toLowerCase() === 'paid') {
    const validMethods = ['Cash', 'EFTPOS', 'Bank Transfer', 'Online Payment'];
    return data.method && validMethods.some(m => data.method?.toLowerCase().includes(m.toLowerCase()));
  }
  return true;
}, {
  message: "Method is required and must be valid if payment state is Paid",
  path: ['method']
});

type OrderRow = z.infer<typeof orderRowSchema>;

interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

interface ProcessedRow {
  id: string;
  data: any;
  errors: string[];
  isDuplicate: boolean;
  status: 'pending' | 'checking' | 'ready' | 'importing' | 'success' | 'failed';
  rowNumber: number;
}

export const BulkOrderUpload = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ProcessedRow[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<'all' | 'valid' | 'invalid' | 'duplicate'>('all');
  const [availableStoreIds, setAvailableStoreIds] = useState<string[]>([]);

  // Scroll state for collapsible header
  const [isScrolled, setIsScrolled] = useState(false);
  const sentinelRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsScrolled(!entry.isIntersecting);
      },
      { threshold: 0 }
    );

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }

    return () => {
      if (sentinelRef.current) {
        observer.unobserve(sentinelRef.current);
      }
    };
  }, []);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [{
      timestamp: new Date().toLocaleTimeString(),
      message,
      type
    }, ...prev].slice(0, 100));
  }, []);

  useEffect(() => {
    const fetchStores = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'stores'));
        const ids = querySnapshot.docs.map(doc => doc.id);
        setAvailableStoreIds(ids);
        addLog(`Loaded ${ids.length} store configurations for validation`, 'info');
      } catch (err) {
        console.error("Error fetching stores:", err);
        addLog("Failed to load store configurations", 'warning');
      }
    };
    fetchStores();
  }, [addLog]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    addLog(`File selected: ${file.name}`, 'info');
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        addLog(`Parsed ${results.data.length} rows from CSV`, 'success');
        
        const processed: ProcessedRow[] = results.data.map((row: any, index: number) => {
          const validation = orderRowSchema.safeParse(row);
          const errors = validation.success ? [] : validation.error.issues.map(e => e.message);
          
          // Additional store validation
          const storeId = row['Store ID']?.toUpperCase().replace(/\s+/g, '_');
          if (storeId && availableStoreIds.length > 0 && !availableStoreIds.includes(storeId)) {
            errors.push(`Store ID "${storeId}" not found in system`);
          }

          return {
            id: Math.random().toString(36).substr(2, 9),
            data: row,
            errors,
            isDuplicate: false,
            status: (validation.success && errors.length === 0) ? 'pending' : 'failed',
            rowNumber: index + 2 // +1 for header, +1 for 1-based index
          };
        });

        setRows(processed);
        checkDuplicates(processed);
      },
      error: (err) => {
        addLog(`CSV Parsing Error: ${err.message}`, 'error');
      }
    });
  }, [addLog]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    multiple: false
  });

  const checkDuplicates = async (dataRows: ProcessedRow[]) => {
    setIsChecking(true);
    addLog('Starting database duplicate pre-check...', 'info');
    
    const validRows = dataRows.filter(r => r.errors.length === 0);
    const bookingNumbers = validRows.map(r => r.data['booking number']);
    const customerRefs = validRows.map(r => r.data['customer ref']);

    const duplicates = new Set<string>();

    // Batch queries in chunks of 30
    const CHUNK_SIZE = 30;
    for (let i = 0; i < bookingNumbers.length; i += CHUNK_SIZE) {
      const bnChunk = bookingNumbers.slice(i, i + CHUNK_SIZE);
      const refChunk = customerRefs.slice(i, i + CHUNK_SIZE);

      const bnQuery = query(collection(db, 'orders'), where('bookingNumber', 'in', bnChunk));
      const refQuery = query(collection(db, 'orders'), where('refNumber', 'in', refChunk));

      const [bnSnap, refSnap] = await Promise.all([getDocs(bnQuery), getDocs(refQuery)]);
      
      bnSnap.docs.forEach(doc => duplicates.add(`bn_${doc.data().bookingNumber}`));
      refSnap.docs.forEach(doc => duplicates.add(`ref_${doc.data().refNumber}`));
      
      setProgress(Math.round(((i + CHUNK_SIZE) / bookingNumbers.length) * 50));
    }

    setRows(prev => prev.map(row => {
      const isBnDup = duplicates.has(`bn_${row.data['booking number']}`);
      const isRefDup = duplicates.has(`ref_${row.data['customer ref']}`);
      const isDuplicate = isBnDup || isRefDup;
      
      return {
        ...row,
        isDuplicate,
        status: row.errors.length > 0 ? 'failed' : (isDuplicate ? 'failed' : 'ready')
      };
    }));

    setIsChecking(false);
    setProgress(0);
    addLog('Duplicate check complete', 'success');
  };

  const handleImport = async () => {
    const readyRows = rows.filter(r => r.status === 'ready');
    if (readyRows.length === 0) {
      addLog('No valid rows to import', 'warning');
      return;
    }

    setIsImporting(true);
    addLog(`Starting import of ${readyRows.length} orders...`, 'info');
    setProgress(0);

    try {
      const token = localStorage.getItem('token');
      const BATCH_SIZE = 50;
      let totalSuccess = 0;
      let totalFailed = 0;

      for (let i = 0; i < readyRows.length; i += BATCH_SIZE) {
        const chunkRows = readyRows.slice(i, i + BATCH_SIZE);
        const ordersToCreate = chunkRows.map(row => {
          const data = row.data;
          return {
            bookingNumber: data['booking number'].trim().toUpperCase(),
            refNumber: data['customer ref'].trim().toUpperCase(),
            customerName: data['Customer Name'],
            customerId: data['customer id'] || '',
            customerEmail: data['Email'],
            storeId: data['Store ID'].toUpperCase().replace(/\s+/g, '_'),
            pickupDateScheduled: data['scheduled pickup date'],
            warehouseId: data['Warehouse'],
            paymentStatus: data['payment state'].toLowerCase() === 'paid' ? 'Paid' : 'Unpaid',
            paymentMethod: data.method || null,
            items: [{
              sku: data['SKU 1'].toUpperCase(),
              qty: parseInt(data['quantity 1'], 10),
              productName: '',
              location: ''
            }],
            sendPickupEmail: false
          };
        });

        try {
          const response = await fetch('/api/orders/bulk-create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-custom-auth-token': `Bearer ${token}`
            },
            body: JSON.stringify({ orders: ordersToCreate })
          });

          const result = await response.json();

          if (response.ok && result.failed === 0) {
            totalSuccess += result.success;
            addLog(`Batch ${Math.floor(i / BATCH_SIZE) + 1} imported successfully (${result.success} orders)`, 'success');
            
            // Mark these rows as success
            setRows(prev => prev.map(r => {
              if (chunkRows.some(c => c.id === r.id)) {
                return { ...r, status: 'success' };
              }
              return r;
            }));
          } else {
            totalFailed += chunkRows.length;
            const errorMsg = result.errors?.[0] || result.error || 'Unknown error';
            addLog(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${errorMsg}`, 'error');
            
            // Mark these rows as failed
            setRows(prev => prev.map(r => {
              if (chunkRows.some(c => c.id === r.id)) {
                return { ...r, status: 'failed', errors: [...r.errors, errorMsg] };
              }
              return r;
            }));
          }
        } catch (err: any) {
          totalFailed += chunkRows.length;
          addLog(`Network error in batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message}`, 'error');
          setRows(prev => prev.map(r => {
            if (chunkRows.some(c => c.id === r.id)) {
              return { ...r, status: 'failed', errors: [...r.errors, err.message] };
            }
            return r;
          }));
        }
        
        setProgress(Math.round(((i + chunkRows.length) / readyRows.length) * 100));
      }

      addLog(`Import process finished. Total Success: ${totalSuccess}, Total Failed: ${totalFailed}`, totalSuccess > 0 ? 'success' : 'error');
    } catch (err: any) {
      addLog(`Import process encountered a critical error: ${err.message}`, 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const updateRow = (id: string, field: string, value: string) => {
    setRows(prev => {
      const newRows = prev.map(row => {
        if (row.id !== id) return row;
        
        const newData = { ...row.data, [field]: value };
        const validation = orderRowSchema.safeParse(newData);
        
        return {
          ...row,
          data: newData,
          errors: validation.success ? [] : validation.error.issues.map(e => e.message),
          status: (validation.success ? 'pending' : 'failed') as ProcessedRow['status']
        };
      });
      
      // Re-trigger duplicate check for the updated row if it's now valid
      const updatedRow = newRows.find(r => r.id === id);
      if (updatedRow && updatedRow.errors.length === 0) {
        // We could optimize this to only check the specific row
        // but for simplicity we'll just mark it as pending and let the user re-check or we can auto-check
      }
      
      return newRows;
    });
  };

  const stats = useMemo(() => {
    const total = rows.length;
    const valid = rows.filter(r => r.errors.length === 0 && !r.isDuplicate).length;
    const invalid = rows.filter(r => r.errors.length > 0).length;
    const duplicates = rows.filter(r => r.isDuplicate).length;
    const success = rows.filter(r => r.status === 'success').length;
    
    return { total, valid, invalid, duplicates, success };
  }, [rows]);

  const filteredRows = useMemo(() => {
    switch (activeTab) {
      case 'valid': return rows.filter(r => r.errors.length === 0 && !r.isDuplicate);
      case 'invalid': return rows.filter(r => r.errors.length > 0);
      case 'duplicate': return rows.filter(r => r.isDuplicate);
      default: return rows;
    }
  }, [rows, activeTab]);

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 overflow-hidden">
      {/* 🚀 Fixed Header */}
      <div className={cn(
        "flex-shrink-0 bg-white border-b border-slate-200 z-20 transition-all duration-300 ease-in-out group",
        isScrolled ? "py-2 shadow-md" : "py-6 shadow-sm"
      )}>
        <div className="max-w-[1600px] mx-auto px-4 md:px-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link to="/orders" className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <ArrowLeft className={cn("transition-all duration-300", isScrolled ? "w-5 h-5" : "w-6 h-6")} />
            </Link>
            <div>
              <h1 className={cn(
                "font-bold text-slate-900 transition-all duration-300",
                isScrolled ? "text-lg" : "text-2xl"
              )}>
                Bulk Order Upload
              </h1>
              <p className={cn(
                "text-slate-500 transition-all duration-300",
                isScrolled ? "text-[10px] opacity-0 h-0 overflow-hidden group-hover:opacity-100 group-hover:h-auto group-hover:text-xs" : "text-sm"
              )}>
                Import orders using CSV with atomic transaction safety
              </p>
            </div>
          </div>
          
          <div className={cn(
            "flex items-center gap-3 transition-all duration-300",
            isScrolled ? "scale-90 origin-right" : "scale-100"
          )}>
            <button
              onClick={() => setRows([])}
              className="px-3 py-1.5 text-slate-600 hover:bg-slate-50 rounded-xl transition-all flex items-center gap-2 text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
            <button
              onClick={handleImport}
              disabled={isImporting || isChecking || stats.valid === 0}
              className="px-5 py-1.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-lg shadow-indigo-200 text-sm"
            >
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Start Import ({stats.valid})
            </button>
          </div>
        </div>
      </div>

      {/* Content Area (Scrolling) */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        {/* Sentinel for Scroll Detection */}
        <div ref={sentinelRef} className="h-px w-full pointer-events-none -mt-8" />
        <div className="max-w-[1600px] mx-auto space-y-6">

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Pane: Health Summary */}
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
              <h2 className="font-bold text-slate-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-600" />
                Data Health
              </h2>

              <div className="space-y-3">
                <button 
                  onClick={() => setActiveTab('all')}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-xl transition-all border",
                    activeTab === 'all' ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-slate-50 border-transparent text-slate-600 hover:bg-white hover:border-slate-200"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Total Rows
                  </span>
                  <span className="font-bold">{stats.total}</span>
                </button>

                <button 
                  onClick={() => setActiveTab('valid')}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-xl transition-all border",
                    activeTab === 'valid' ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-50 border-transparent text-slate-600 hover:bg-white hover:border-slate-200"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Ready to Import
                  </span>
                  <span className="font-bold">{stats.valid}</span>
                </button>

                <button 
                  onClick={() => setActiveTab('duplicate')}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-xl transition-all border",
                    activeTab === 'duplicate' ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-slate-50 border-transparent text-slate-600 hover:bg-white hover:border-slate-200"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Duplicate found
                  </span>
                  <span className="font-bold">{stats.duplicates}</span>
                </button>

                <button 
                  onClick={() => setActiveTab('invalid')}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-xl transition-all border",
                    activeTab === 'invalid' ? "bg-red-50 border-red-200 text-red-700" : "bg-slate-50 border-transparent text-slate-600 hover:bg-white hover:border-slate-200"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Invalid data
                  </span>
                  <span className="font-bold">{stats.invalid}</span>
                </button>
              </div>

              {stats.success > 0 && (
                <div className="pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between text-emerald-600 font-bold">
                    <span>Successfully Imported</span>
                    <span>{stats.success}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Dropzone */}
            <div 
              {...getRootProps()} 
              className={cn(
                "border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer",
                isDragActive ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white hover:border-indigo-400"
              )}
            >
              <input {...getInputProps()} />
              <Upload className="w-10 h-10 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600 font-medium">Drag & drop CSV here</p>
              <p className="text-slate-400 text-sm mt-1">or click to browse files</p>
            </div>
          </div>

          {/* Middle Pane: Interactive Table */}
          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[600px]">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h3 className="font-bold text-slate-900">Data Preview</h3>
                {isChecking && (
                  <div className="flex items-center gap-2 text-indigo-600 text-sm font-medium animate-pulse">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking duplicates...
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-auto">
                {rows.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 p-12">
                    <FileText className="w-16 h-16 mb-4 opacity-20" />
                    <p>No data loaded. Upload a CSV to begin.</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white shadow-sm z-10">
                      <tr className="text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                        <th className="px-4 py-3 w-12">#</th>
                        <th className="px-4 py-3">Booking #</th>
                        <th className="px-4 py-3">Customer</th>
                        <th className="px-4 py-3">Ref #</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredRows.map((row) => (
                        <tr 
                          key={row.id} 
                          className={cn(
                            "group hover:bg-slate-50 transition-colors",
                            row.isDuplicate ? "bg-amber-50/30" : row.errors.length > 0 ? "bg-red-50/30" : ""
                          )}
                        >
                          <td className="px-4 py-3 text-xs text-slate-400">{row.rowNumber}</td>
                          <td className="px-4 py-3">
                            <input 
                              type="text"
                              value={row.data['booking number']}
                              onChange={(e) => updateRow(row.id, 'booking number', e.target.value)}
                              className={cn(
                                "w-full bg-transparent border-none p-0 focus:ring-0 text-sm font-medium",
                                row.isDuplicate ? "text-amber-700" : "text-slate-900"
                              )}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input 
                              type="text"
                              value={row.data['Customer Name']}
                              onChange={(e) => updateRow(row.id, 'Customer Name', e.target.value)}
                              className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm text-slate-600"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input 
                              type="text"
                              value={row.data['customer ref']}
                              onChange={(e) => updateRow(row.id, 'customer ref', e.target.value)}
                              className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm text-slate-600"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input 
                              type="text"
                              value={row.data['Email']}
                              onChange={(e) => updateRow(row.id, 'Email', e.target.value)}
                              className={cn(
                                "w-full bg-transparent border-none p-0 focus:ring-0 text-sm",
                                row.errors.some(e => e.includes('Email')) ? "text-red-600" : "text-slate-600"
                              )}
                            />
                          </td>
                          <td className="px-4 py-3">
                            {row.status === 'success' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase">
                                <CheckCircle2 className="w-3 h-3" />
                                Success
                              </span>
                            ) : row.isDuplicate ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase">
                                <AlertTriangle className="w-3 h-3" />
                                Duplicate
                              </span>
                            ) : row.errors.length > 0 ? (
                              <div className="group relative">
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-bold uppercase cursor-help">
                                  <AlertCircle className="w-3 h-3" />
                                  Error
                                </span>
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-900 text-white text-[10px] rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                                  {row.errors.join(', ')}
                                </div>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase">
                                Ready
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Progress Bar */}
              {(isImporting || isChecking) && (
                <div className="h-1 bg-slate-100 w-full">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    className="h-full bg-indigo-600"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right Pane: Log Window */}
          <div className="lg:col-span-3 space-y-6">
            {(profile?.roleTemplate === 'Admin' || profile?.allowedWarehouses?.includes('*')) ? (
              <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col h-[600px]">
                <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/50 flex items-center justify-between">
                  <h3 className="font-bold text-white flex items-center gap-2">
                    <History className="w-5 h-5 text-indigo-400" />
                    Process Logs
                  </h3>
                  <button 
                    onClick={() => setLogs([])}
                    className="text-slate-400 hover:text-white text-xs"
                  >
                    Clear
                  </button>
                </div>

                <div className="flex-1 overflow-auto p-4 font-mono text-xs space-y-2">
                  {logs.length === 0 ? (
                    <div className="text-slate-600 italic">Waiting for activity...</div>
                  ) : (
                    <AnimatePresence initial={false}>
                      {logs.map((log, i) => (
                        <motion.div 
                          key={i}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={cn(
                            "flex gap-3",
                            log.type === 'error' ? "text-red-400" : 
                            log.type === 'success' ? "text-emerald-400" : 
                            log.type === 'warning' ? "text-amber-400" : "text-slate-300"
                          )}
                        >
                          <span className="text-slate-600 shrink-0">[{log.timestamp}]</span>
                          <span>{log.message}</span>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center h-[600px] flex flex-col items-center justify-center">
                <History className="w-12 h-12 text-slate-200 mb-4" />
                <h3 className="font-bold text-slate-900 mb-2">Process Logs</h3>
                <p className="text-slate-500 text-sm">Only administrators can view real-time process logs.</p>
              </div>
            )}

            {/* Info Card */}
            <div className="bg-indigo-600 rounded-2xl p-6 text-white shadow-lg shadow-indigo-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Info className="w-5 h-5" />
                </div>
                <h3 className="font-bold">Import Tips</h3>
              </div>
              <ul className="text-sm text-indigo-100 space-y-3">
                <li className="flex gap-2">
                  <ChevronRight className="w-4 h-4 shrink-0" />
                  Ensure CSV headers match the required format exactly.
                </li>
                <li className="flex gap-2">
                  <ChevronRight className="w-4 h-4 shrink-0" />
                  Duplicates are checked against both Booking # and Customer Ref.
                </li>
                <li className="flex gap-2">
                  <ChevronRight className="w-4 h-4 shrink-0" />
                  Transactions are processed in batches of 50 for stability.
                </li>
              </ul>
            </div>
          </div>

          </div>
        </div>
      </div>
    </div>
  );
};
