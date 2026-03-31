import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { AuthProvider, useAuth } from '../components/AuthProvider';
import { 
  Order, 
  OrderItem, 
  SKU, 
  Store, 
  OperationLog, 
  PaymentStatus, 
  PaymentMethod,
  OrderStatus
} from '../types';
import { 
  ArrowLeft, 
  Edit, 
  Trash2, 
  Printer, 
  CheckCircle, 
  XCircle, 
  Clock, 
  CreditCard, 
  User, 
  Calendar, 
  FileText, 
  Plus, 
  Search,
  Save,
  X,
  AlertCircle,
  PenTool,
  Monitor,
  Smartphone
} from 'lucide-react';
import { formatDate, hasPermission, cn } from '../utils';
import { motion, AnimatePresence } from 'motion/react';
import SignatureCanvas from 'react-signature-canvas';
import html2canvas from 'html2canvas-pro';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../constants';

export const OrderDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, user, activeWarehouse, token } = useAuth();
  
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [logs, setLogs] = useState<OperationLog[]>([]);
  
  // Signature State
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const signatureRef = React.useRef<SignatureCanvas>(null);
  const [signatureLoading, setSignatureLoading] = useState(false);
  
  // Socket State
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isGuestOnline, setIsGuestOnline] = useState(false);
  const [isProjecting, setIsProjecting] = useState(false);
  const [receivedRemoteSignature, setReceivedRemoteSignature] = useState<string | null>(null);
  
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
  
  // Edit Form State
  const [editForm, setEditForm] = useState<Partial<Order>>({});
  const [skuSearch, setSkuSearch] = useState('');
  const [skuResults, setSkuResults] = useState<SKU[]>([]);
  const [showSkuResults, setShowSkuResults] = useState(false);

  useEffect(() => {
    fetchOrder();
    fetchStores();
    if (id) fetchLogs(id);
  }, [id]);

  // Socket setup for signature projection
  useEffect(() => {
    if (!order) return;

    const newSocket = io(API_BASE_URL);
    setSocket(newSocket);

    const pairingPassword = localStorage.getItem('pairing_password');
    const roomId = pairingPassword ? `pair_${pairingPassword}` : `store_${order.storeId}`;

    newSocket.on('connect', () => {
      newSocket.emit('join-room', roomId);
      // Check if guest is already online
      newSocket.emit('check-guest-presence', roomId);
    });

    newSocket.on('guest-online', () => {
      setIsGuestOnline(true);
    });

    newSocket.on('signature-received', (data: { signatureData: string }) => {
      if (data.signatureData) {
        setReceivedRemoteSignature(data.signatureData);
        setIsProjecting(false);
      }
    });

    newSocket.on('reset-guest-display', () => {
      setIsProjecting(false);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [order?.id]);

  const handleSaveRemoteSignature = async () => {
    if (!id || !profile || !order || !receivedRemoteSignature || !token) return;
    
    try {
      setSignatureLoading(true);
      
      const response = await fetch('/api/orders/confirm-pickup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-custom-auth-token': `Bearer ${token}`,
          'x-warehouse-id': activeWarehouse || ''
        },
        body: JSON.stringify({
          orderId: id,
          signatureData: receivedRemoteSignature
        })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to save remote signature');
      }
      
      setShowSignatureModal(false);
      setReceivedRemoteSignature(null);
      fetchOrder();
      fetchLogs(id);
    } catch (err: any) {
      console.error('Error saving remote signature:', err);
      alert(err.message || 'Failed to save remote signature');
    } finally {
      setSignatureLoading(false);
    }
  };

  const handleClearRemoteSignature = () => {
    setReceivedRemoteSignature(null);
    // Optionally re-project immediately
    handleProjectSignature();
  };

  const handleProjectSignature = () => {
    if (!socket || !order) return;
    
    const pairingPassword = localStorage.getItem('pairing_password');
    const roomId = pairingPassword ? `pair_${pairingPassword}` : `store_${order.storeId}`;

    setIsProjecting(true);
    socket.emit('request-signature', {
      orderId: order.id,
      bookingNumber: order.bookingNumber,
      customerName: order.customerName,
      storeId: roomId
    });
  };

  const handleCancelProjection = () => {
    if (!socket || !order) return;
    const pairingPassword = localStorage.getItem('pairing_password');
    const roomId = pairingPassword ? `pair_${pairingPassword}` : `store_${order.storeId}`;
    socket.emit('cancel-signature', roomId);
    setIsProjecting(false);
  };

  const fetchOrder = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const docRef = doc(db, 'orders', id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const orderData = { id: docSnap.id, ...docSnap.data() } as Order;
        
        // Warehouse Isolation Check
        const isSuper = profile?.allowedWarehouses?.includes('*');
        if (!isSuper && activeWarehouse && orderData.warehouseId !== activeWarehouse) {
          setError('Access Denied: Order belongs to a different warehouse');
          setLoading(false);
          return;
        }

        setOrder(orderData);
        setEditForm(orderData);
      } else {
        setError('Order not found');
      }
    } catch (err) {
      console.error('Error fetching order:', err);
      setError('Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  const fetchStores = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'stores'));
      const storesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Store));
      setStores(storesData);
    } catch (err) {
      console.error('Error fetching stores:', err);
    }
  };

  const fetchLogs = async (orderId: string) => {
    try {
      const q = query(
        collection(db, 'logs'),
        where('orderId', '==', orderId)
      );
      const querySnapshot = await getDocs(q);
      const logsData = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as OperationLog))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setLogs(logsData);
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
  };

  const handleUpdateOrder = async () => {
    if (!id || !profile || !order || !token) return;
    
    try {
      // Handle payment metadata
      const updatedData = { ...editForm };
      if (editForm.paymentStatus === 'Paid' && order.paymentStatus === 'Unpaid') {
        updatedData.paymentTime = new Date().toISOString();
        updatedData.paymentBy = profile.name;
      } else if (editForm.paymentStatus === 'Unpaid' && order.paymentStatus === 'Paid') {
        updatedData.paymentTime = null;
        updatedData.paymentBy = null;
        updatedData.paymentMethod = null;
      }

      const response = await fetch('/api/orders/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-custom-auth-token': `Bearer ${token}`,
          'x-warehouse-id': activeWarehouse || ''
        },
        body: JSON.stringify({
          orderId: id,
          updateData: updatedData
        })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to update order');
      }
      
      setIsEditing(false);
      fetchOrder();
      fetchLogs(id);
    } catch (err: any) {
      console.error('Error updating order:', err);
      alert(err.message || 'Failed to update order');
    }
  };

  const handleDeleteOrder = async () => {
    if (!id || !profile || !order || !token) return;
    if (!window.confirm('Are you sure you want to delete this order? This action cannot be undone.')) return;

    try {
      const response = await fetch('/api/orders/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-custom-auth-token': `Bearer ${token}`,
          'x-warehouse-id': activeWarehouse || ''
        },
        body: JSON.stringify({
          orderId: id
        })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to delete order');
      }

      navigate('/orders');
    } catch (err: any) {
      console.error('Error deleting order:', err);
      alert(err.message || 'Failed to delete order');
    }
  };

  const handleStatusChange = async (newStatus: OrderStatus) => {
    if (!id || !profile || !order) return;
    
    // Rule: Order must be paid before pickup
    if (newStatus === 'Picked Up' && order.paymentStatus !== 'Paid') {
      alert('Order must be paid before it can be confirmed for pickup.');
      return;
    }

    // Rule: Only picked up orders can be reviewed
    if (newStatus === 'Reviewed' && order.status !== 'Picked Up') {
      alert('Only orders that have been picked up can be marked as reviewed.');
      return;
    }

    // Rule: Only unpaid orders can be cancelled
    if (newStatus === 'Cancelled' && order.paymentStatus === 'Paid') {
      alert('Only orders with removed payment (Unpaid) can be cancelled.');
      return;
    }

    // Rule: Confirm pickup requires signature
    if (newStatus === 'Picked Up') {
      setShowSignatureModal(true);
      return;
    }
    
    try {
      const response = await fetch('/api/orders/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-custom-auth-token': `Bearer ${token}`,
          'x-warehouse-id': activeWarehouse || ''
        },
        body: JSON.stringify({
          orderId: id,
          updateData: { status: newStatus }
        })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to update status');
      }

      fetchOrder();
      fetchLogs(id);
    } catch (err: any) {
      console.error('Error updating status:', err);
      alert(err.message || 'Failed to update status');
    }
  };

  const signatureAreaRef = React.useRef<HTMLDivElement>(null);

  const handleConfirmPickup = async () => {
    if (!id || !profile || !order || !signatureRef.current || !token) return;
    
    if (signatureRef.current.isEmpty()) {
      alert('Please provide a signature to confirm pickup.');
      return;
    }

    try {
      setSignatureLoading(true);
      
      let signatureData = '';
      if (signatureAreaRef.current) {
        const canvas = await html2canvas(signatureAreaRef.current, {
          backgroundColor: '#ffffff',
          scale: 2,
          logging: false
        });
        signatureData = canvas.toDataURL('image/png');
      } else {
        signatureData = signatureRef.current.toDataURL();
      }
      
      const response = await fetch('/api/orders/confirm-pickup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-custom-auth-token': `Bearer ${token}`,
          'x-warehouse-id': activeWarehouse || ''
        },
        body: JSON.stringify({
          orderId: id,
          signatureData: signatureData
        })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to confirm pickup');
      }

      setShowSignatureModal(false);
      fetchOrder();
      fetchLogs(id);
    } catch (err: any) {
      console.error('Error confirming pickup:', err);
      alert(err.message || 'Failed to confirm pickup');
    } finally {
      setSignatureLoading(false);
    }
  };

  const handlePrint = async () => {
    if (!id || !profile || !order || !token) return;
    
    try {
      const response = await fetch('/api/orders/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-custom-auth-token': `Bearer ${token}`,
          'x-warehouse-id': activeWarehouse || ''
        },
        body: JSON.stringify({
          orderId: id,
          updateData: {
            printedTime: new Date().toISOString(),
            printedBy: profile.name
          }
        })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to update print status');
      }
      
      fetchOrder();
      fetchLogs(id);
      
      window.print();
    } catch (err) {
      console.error('Error updating print status:', err);
    }
  };

  const searchSKU = async (term: string) => {
    setSkuSearch(term);
    if (term.length < 2) {
      setSkuResults([]);
      setShowSkuResults(false);
      return;
    }

    try {
      const q = query(
        collection(db, 'skus'),
        where('sku', '>=', term.toUpperCase()),
        where('sku', '<=', term.toUpperCase() + '\uf8ff')
      );
      const querySnapshot = await getDocs(q);
      const results = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SKU));
      setSkuResults(results);
      setShowSkuResults(true);
    } catch (err) {
      console.error('Error searching SKU:', err);
    }
  };

  const addItem = (sku: SKU) => {
    const newItem: OrderItem = {
      sku: sku.sku,
      productName: sku.productName,
      location: sku.location,
      qty: 1
    };
    
    setEditForm(prev => ({
      ...prev,
      items: [...(prev.items || []), newItem]
    }));
    setSkuSearch('');
    setShowSkuResults(false);
  };

  const removeItem = (index: number) => {
    setEditForm(prev => ({
      ...prev,
      items: prev.items?.filter((_, i) => i !== index)
    }));
  };

  const updateItemQty = (index: number, qty: number) => {
    setEditForm(prev => ({
      ...prev,
      items: prev.items?.map((item, i) => i === index ? { ...item, qty: Math.max(1, qty) } : item)
    }));
  };

  const renderStatusBadge = (status: OrderStatus) => {
    const colors = {
      'Created': 'bg-indigo-50 text-indigo-700 border-indigo-100',
      'Picked Up': 'bg-emerald-50 text-emerald-700 border-emerald-100',
      'Reviewed': 'bg-purple-50 text-purple-700 border-purple-100',
      'Cancelled': 'bg-red-50 text-red-700 border-red-100'
    };
    return (
      <span className={cn('px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border', colors[status])}>
        {status}
      </span>
    );
  };

  const renderPaymentBadge = (status: PaymentStatus) => {
    const colors = {
      'Paid': 'bg-emerald-50 text-emerald-700 border-emerald-100',
      'Unpaid': 'bg-amber-50 text-amber-700 border-amber-100'
    };
    return (
      <span className={cn('px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border', colors[status])}>
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="p-6 text-center bg-slate-50 min-h-screen flex flex-col items-center justify-center">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">{error || 'Order not found'}</h2>
        <button
          onClick={() => navigate('/orders')}
          className="text-indigo-600 hover:text-indigo-700 font-bold inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Orders
        </button>
      </div>
    );
  }

  const store = stores.find(s => s.storeId === order.storeId);

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 overflow-hidden">
      {/* 🚀 Fixed Header */}
      <div className={cn(
        "flex-shrink-0 bg-white border-b border-slate-200 z-20 transition-all duration-300 ease-in-out group print:hidden",
        isScrolled ? "py-2 shadow-md" : "py-6 shadow-sm"
      )}>
        <div className="max-w-5xl mx-auto px-4 md:px-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/orders')}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className={cn("transition-all duration-300", isScrolled ? "w-5 h-5" : "w-6 h-6")} />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className={cn(
                  "font-bold text-gray-900 transition-all duration-300",
                  isScrolled ? "text-lg" : "text-2xl"
                )}>
                  {order.bookingNumber}
                </h1>
                {renderStatusBadge(order.status)}
              </div>
              <p className={cn(
                "text-gray-500 transition-all duration-300",
                isScrolled ? "text-[10px] opacity-0 h-0 overflow-hidden group-hover:opacity-100 group-hover:h-auto group-hover:text-xs" : "text-sm"
              )}>
                Ref: {order.refNumber}
              </p>
            </div>
          </div>

          <div className={cn(
            "flex flex-wrap items-center gap-2 transition-all duration-300",
            isScrolled ? "scale-90 origin-right" : "scale-100"
          )}>
            {hasPermission(profile, 'Edit Order', profile?.email) && order.status !== 'Cancelled' && (
              <button
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Edit className="w-3.5 h-3.5 mr-1.5" />
                Edit
              </button>
            )}
            
            {hasPermission(profile, 'Print Pick List', profile?.email) && (
              <button
                onClick={handlePrint}
                className="inline-flex items-center px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Printer className="w-3.5 h-3.5 mr-1.5" />
                Print
              </button>
            )}

            {hasPermission(profile, 'Confirm Pickup', profile?.email) && order.status === 'Created' && (
              <button
                onClick={() => handleStatusChange('Picked Up')}
                className="inline-flex items-center px-3 py-1.5 bg-green-600 rounded-lg text-xs font-medium text-white hover:bg-green-700 transition-colors"
              >
                <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                Confirm Pickup
              </button>
            )}

            {hasPermission(profile, 'Review Orders', profile?.email) && order.status === 'Picked Up' && (
              <button
                onClick={() => handleStatusChange('Reviewed')}
                className="inline-flex items-center px-3 py-1.5 bg-purple-600 rounded-lg text-xs font-medium text-white hover:bg-purple-700 transition-colors"
              >
                <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                Mark Reviewed
              </button>
            )}

            {hasPermission(profile, 'Cancel Orders', profile?.email) && order.status !== 'Cancelled' && (
              <button
                onClick={() => handleStatusChange('Cancelled')}
                className="inline-flex items-center px-3 py-1.5 bg-red-50 rounded-lg text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5 mr-1.5" />
                Cancel
              </button>
            )}

            {hasPermission(profile, 'Manage Users', profile?.email) && (
              <button
                onClick={handleDeleteOrder}
                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content Area (Scrolling) */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 print:hidden">
        {/* Sentinel for Scroll Detection */}
        <div ref={sentinelRef} className="h-px w-full pointer-events-none -mt-8" />
        <div className="max-w-5xl mx-auto space-y-6">

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Order Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Details Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-semibold text-gray-900">Order Information</h3>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <User className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</p>
                    <p className="text-gray-900 font-medium">{order.customerName}</p>
                    <p className="text-sm text-gray-500">ID: {order.customerId}</p>
                    {order.customerEmail && <p className="text-sm text-gray-500">{order.customerEmail}</p>}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Pickup Date</p>
                    <p className="text-gray-900">{formatDate(order.pickupDateScheduled, 'PPP')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Store</p>
                    <p className="text-gray-900">{store?.name || order.storeId}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CreditCard className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Payment Status</p>
                    <div className="flex items-center gap-2 mt-1">
                      {renderPaymentBadge(order.paymentStatus)}
                      {order.paymentMethod && (
                        <span className="text-sm text-gray-600">via {order.paymentMethod}</span>
                      )}
                    </div>
                    {order.paymentTime && (
                      <p className="text-xs text-gray-500 mt-1">
                        Paid on {formatDate(order.paymentTime, 'PPp')} by {order.paymentBy}
                      </p>
                    )}
                  </div>
                </div>
                {order.customerSignature && (
                  <div className="flex items-start gap-3">
                    <PenTool className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Customer Signature</p>
                      <img 
                        src={order.customerSignature} 
                        alt="Customer Signature" 
                        className="h-16 border border-gray-200 rounded mt-1 bg-white"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Created</p>
                    <p className="text-gray-900">{formatDate(order.createdTime, 'PPp')}</p>
                    <p className="text-sm text-gray-500">by {order.createdBy}</p>
                  </div>
                </div>
                {order.actualPickupTime && (
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Actual Pickup</p>
                      <p className="text-gray-900">{formatDate(order.actualPickupTime, 'PPp')}</p>
                      <p className="text-sm text-gray-500">by {order.pickedUpBy}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {order.notes && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Notes</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{order.notes}</p>
              </div>
            )}
          </div>

          {/* Items Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-semibold text-gray-900">Order Items</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3">SKU</th>
                    <th className="px-6 py-3">Product Name</th>
                    <th className="px-6 py-3">Location</th>
                    <th className="px-6 py-3 text-right">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(order.items || []).map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-mono font-medium text-gray-900">{item.sku}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{item.productName || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium">
                          {item.location || 'N/A'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 text-right font-semibold">{item.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Logs & Metadata */}
        <div className="space-y-6">
          {/* Operation Logs */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Operation Logs</h3>
              <Clock className="w-4 h-4 text-gray-400" />
            </div>
            <div className="p-4 max-h-[500px] overflow-y-auto">
              <div className="space-y-4">
                {logs.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No logs found</p>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="flex gap-3 text-sm">
                      <div className="flex-shrink-0 w-1 bg-gray-200 rounded-full" />
                      <div>
                        <p className="font-medium text-gray-900">{log.action}</p>
                        <p className="text-gray-600 text-xs mt-0.5">{log.details}</p>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400 uppercase tracking-wider">
                          <span>{log.userName}</span>
                          <span>•</span>
                          <span>{formatDate(log.timestamp, 'MMM d, HH:mm')}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Email Status */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Email Status</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Notification</span>
                <span className={cn(
                  'px-2 py-0.5 rounded text-xs font-medium',
                  order.emailStatus === 'sent' ? 'bg-green-100 text-green-800' : 
                  order.emailStatus === 'failed' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                )}>
                  {order.emailStatus || 'Not Sent'}
                </span>
              </div>
              {order.lastEmailSentAt && (
                <div className="text-xs text-gray-400 text-right">
                  Last sent: {formatDate(order.lastEmailSentAt, 'PPp')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Signature Modal */}
      {showSignatureModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h2 className="text-lg font-bold text-gray-900">Confirm Pickup Signature</h2>
              <button 
                onClick={() => {
                  setShowSignatureModal(false);
                  setReceivedRemoteSignature(null);
                  setIsProjecting(false);
                }} 
                className="p-2 hover:bg-gray-200 rounded-full"
                disabled={signatureLoading}
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Please ask the customer to sign below to confirm they have picked up order <span className="font-bold">{order.bookingNumber}</span>.
              </p>
              
              {receivedRemoteSignature ? (
                <div className="space-y-4">
                  <div className="border-2 border-emerald-100 rounded-2xl bg-white p-4 flex flex-col items-center justify-center text-center">
                    <p className="text-xs font-bold text-emerald-600 uppercase mb-2">Signature Received from Tablet</p>
                    <img 
                      src={receivedRemoteSignature} 
                      alt="Remote Signature" 
                      className="max-h-48 object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleClearRemoteSignature}
                      className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-sm transition-all"
                      disabled={signatureLoading}
                    >
                      Clear & Resign
                    </button>
                    <button
                      onClick={handleSaveRemoteSignature}
                      className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2"
                      disabled={signatureLoading}
                    >
                      {signatureLoading ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      Confirm & Save Signature
                    </button>
                  </div>
                </div>
              ) : isProjecting ? (
                <div className="border-2 border-indigo-100 rounded-2xl bg-indigo-50/50 p-8 flex flex-col items-center justify-center text-center space-y-4 min-h-[192px]">
                  <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center animate-pulse">
                    <Smartphone className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="font-bold text-indigo-900">Projecting to Tablet</h4>
                    <p className="text-sm text-indigo-600">Waiting for customer signature on the paired device...</p>
                  </div>
                  <button
                    onClick={handleCancelProjection}
                    className="px-4 py-2 bg-white border border-indigo-200 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all"
                  >
                    Cancel Projection
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div ref={signatureAreaRef} className="border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 overflow-hidden">
                    <SignatureCanvas
                      ref={signatureRef}
                      penColor="black"
                      canvasProps={{
                        className: "w-full h-48 cursor-crosshair",
                        style: { width: '100%', height: '192px' }
                      }}
                    />
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <div className="flex gap-4">
                      <button
                        onClick={() => signatureRef.current?.clear()}
                        className="text-sm text-gray-500 hover:text-gray-700 font-medium"
                        disabled={signatureLoading}
                      >
                        Clear Signature
                      </button>
                      {isGuestOnline && (
                        <button
                          onClick={handleProjectSignature}
                          className="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-700 font-bold gap-2"
                          disabled={signatureLoading}
                        >
                          <Monitor className="w-4 h-4" />
                          Project to Tablet
                        </button>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setShowSignatureModal(false);
                          setReceivedRemoteSignature(null);
                          setIsProjecting(false);
                        }}
                        className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        disabled={signatureLoading}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleConfirmPickup}
                        disabled={signatureLoading}
                        className="inline-flex items-center px-6 py-2 bg-green-600 rounded-lg text-sm font-medium text-white hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50"
                      >
                        {signatureLoading ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        ) : (
                          <CheckCircle className="w-4 h-4 mr-2" />
                        )}
                        Confirm & Save
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h2 className="text-xl font-bold text-gray-900">Edit Order</h2>
              <button onClick={() => setIsEditing(false)} className="p-2 hover:bg-gray-200 rounded-full">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
                      <input
                        type="text"
                        value={editForm.customerName || ''}
                        onChange={e => setEditForm({ ...editForm, customerName: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Customer Email</label>
                      <input
                        type="email"
                        value={editForm.customerEmail || ''}
                        onChange={e => setEditForm({ ...editForm, customerEmail: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Store</label>
                      <select
                        value={editForm.storeId || ''}
                        onChange={e => setEditForm({ ...editForm, storeId: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        {stores.map(s => (
                          <option key={s.id} value={s.storeId}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Pickup Date</label>
                      <input
                        type="date"
                        value={editForm.pickupDateScheduled?.split('T')[0] || ''}
                        onChange={e => setEditForm({ ...editForm, pickupDateScheduled: new Date(e.target.value).toISOString() })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
                        <select
                          value={editForm.paymentStatus || 'Unpaid'}
                          onChange={e => setEditForm({ ...editForm, paymentStatus: e.target.value as PaymentStatus })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="Unpaid">Unpaid</option>
                          <option value="Paid">Paid</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                        <select
                          value={editForm.paymentMethod || ''}
                          onChange={e => setEditForm({ ...editForm, paymentMethod: e.target.value as PaymentMethod })}
                          disabled={editForm.paymentStatus !== 'Paid'}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
                        >
                          <option value="">Select Method</option>
                          <option value="Cash">Cash</option>
                          <option value="EFTPOS">EFTPOS</option>
                          <option value="Bank Transfer">Bank Transfer</option>
                          <option value="Online Payment">Online Payment</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                      <textarea
                        value={editForm.notes || ''}
                        onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                        rows={2}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Items Management */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Order Items</h3>
                    <div className="relative w-64">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        placeholder="Search SKU to add..."
                        value={skuSearch}
                        onChange={e => searchSKU(e.target.value)}
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      
                      {showSkuResults && skuResults.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                          {skuResults.map(sku => (
                            <button
                              key={sku.id}
                              onClick={() => addItem(sku)}
                              className="w-full text-left px-4 py-2 hover:bg-gray-50 flex flex-col border-b border-gray-100 last:border-0"
                            >
                              <span className="font-mono font-bold text-blue-600">{sku.sku}</span>
                              <span className="text-xs text-gray-500 truncate">{sku.productName}</span>
                              <span className="text-[10px] text-gray-400">Loc: {sku.location}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-gray-50 text-xs font-medium text-gray-500 uppercase">
                        <tr>
                          <th className="px-4 py-3">SKU</th>
                          <th className="px-4 py-3">Product</th>
                          <th className="px-4 py-3 w-24 text-center">Qty</th>
                          <th className="px-4 py-3 w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {editForm.items?.map((item, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-3 font-mono text-sm">{item.sku}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{item.productName}</td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min="1"
                                value={item.qty}
                                onChange={e => updateItemQty(idx, parseInt(e.target.value))}
                                className="w-full text-center px-2 py-1 border border-gray-300 rounded"
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {(!editForm.items || editForm.items.length === 0) && (
                          <tr>
                            <td colSpan={4} className="px-4 py-8 text-center text-gray-500 text-sm">
                              No items added to this order.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateOrder}
                  className="inline-flex items-center px-6 py-2 bg-blue-600 rounded-lg text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        </div>
      </div>

      {/* Print View (Hidden) */}
      <div className="hidden print:block p-8 bg-white text-black">
        <div className="flex justify-between items-start mb-8 border-b-2 border-black pb-4">
          <div>
            <h1 className="text-3xl font-bold uppercase tracking-tighter">Pick List</h1>
            <p className="text-lg font-mono mt-1">{order.bookingNumber}</p>
            <p className="text-sm text-gray-600">Ref: {order.refNumber}</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold">{store?.name || order.storeId}</h2>
            <p className="text-sm">Warehouse: {activeWarehouse}</p>
            <p className="text-sm">Date: {formatDate(new Date().toISOString(), 'PPP')}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-8">
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase text-gray-500">Customer Details</h3>
            <p className="text-lg font-bold">{order.customerName}</p>
            <p className="text-sm">ID: {order.customerId}</p>
            <p className="text-sm">Pickup Scheduled: {formatDate(order.pickupDateScheduled, 'PPP')}</p>
          </div>
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase text-gray-500">Payment Info</h3>
            <p className="text-lg font-bold">{order.paymentStatus}</p>
            {order.paymentMethod && <p className="text-sm">Method: {order.paymentMethod}</p>}
            {order.paymentTime && <p className="text-sm">Paid at: {formatDate(order.paymentTime, 'PPp')}</p>}
          </div>
        </div>

        <table className="w-full mb-8 border-collapse">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="py-2 text-left text-sm font-bold uppercase">SKU</th>
              <th className="py-2 text-left text-sm font-bold uppercase">Product Name</th>
              <th className="py-2 text-left text-sm font-bold uppercase">Location</th>
              <th className="py-2 text-right text-sm font-bold uppercase">Qty</th>
              <th className="py-2 text-center text-sm font-bold uppercase w-12">Pick</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-300">
            {order.items.map((item, idx) => (
              <tr key={idx}>
                <td className="py-4 font-mono font-bold">{item.sku}</td>
                <td className="py-4 text-sm">{item.productName}</td>
                <td className="py-4">
                  <span className="px-2 py-1 border border-black rounded text-xs font-bold">
                    {item.location || 'N/A'}
                  </span>
                </td>
                <td className="py-4 text-right font-bold text-lg">{item.qty}</td>
                <td className="py-4">
                  <div className="w-6 h-6 border-2 border-black mx-auto rounded" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {order.notes && (
          <div className="mb-8 p-4 border-2 border-dashed border-gray-300 rounded">
            <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">Special Notes</h3>
            <p className="text-sm italic">{order.notes}</p>
          </div>
        )}

        <div className="mt-20 grid grid-cols-2 gap-12">
          <div className="border-t border-black pt-2">
            <p className="text-xs font-bold uppercase">Picker Signature</p>
            <p className="text-xs text-gray-400 mt-8">Name: ________________________</p>
          </div>
          <div className="border-t border-black pt-2">
            <p className="text-xs font-bold uppercase">Customer Signature</p>
            <p className="text-xs text-gray-400 mt-8">Date: ________________________</p>
          </div>
        </div>
        
        <div className="mt-8 text-[10px] text-gray-400 text-center">
          Printed by {profile?.name} at {formatDate(new Date().toISOString(), 'PPp')}
        </div>
      </div>
    </div>
  );
};

// export default OrderDetail;
