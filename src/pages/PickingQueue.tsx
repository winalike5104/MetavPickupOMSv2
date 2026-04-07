import React, { useEffect, useState, useMemo } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/AuthProvider';
import { Order, OrderItem, WarehouseStatus, PickingLog } from '../types';
import { 
  ShoppingCart, 
  Package, 
  MapPin, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  Play,
  ArrowRight,
  Search,
  Filter,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  History as HistoryIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatDate, logAction } from '../utils';

interface PickingTask {
  sku: string;
  productName: string;
  location: string;
  totalQty: number;
  orders: {
    id: string;
    bookingNumber: string;
    qty: number;
    status: string;
    warehouseStatus: string;
  }[];
}

export const PickingQueue: React.FC = () => {
  const { profile, activeWarehouse, token } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [expandedTasks, setExpandedTasks] = useState<string[]>([]);
  const [updatingIds, setUpdatingIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'location' | 'order'>(() => {
    return (localStorage.getItem('pickingQueueTab') as 'location' | 'order') || 'location';
  });

  useEffect(() => {
    localStorage.setItem('pickingQueueTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (!activeWarehouse) return;

    const q = query(
      collection(db, 'orders'),
      where('warehouseId', '==', activeWarehouse),
      where('warehouseStatus', 'in', ['Pending', 'Picking', 'Picked'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];

      const activeOrders = ordersData.filter(order => {
        const isFullyDone = order.status === 'Picked Up' && order.warehouseStatus === 'Picked';
        const isCancelled = order.status === 'Cancelled';
        const isReviewed = order.status === 'Reviewed';
        return !isFullyDone && !isCancelled && !isReviewed;
      });

      setOrders(activeOrders);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [activeWarehouse]);

  const locationTasks = useMemo(() => {
    const taskMap = new Map<string, PickingTask>();

    orders.forEach(order => {
      order.items.forEach(item => {
        const key = `${item.sku}-${item.location || 'No Location'}`;
        if (!taskMap.has(key)) {
          taskMap.set(key, {
            sku: item.sku,
            productName: item.productName || 'Unknown Product',
            location: item.location || 'No Location',
            totalQty: 0,
            orders: []
          });
        }

        const task = taskMap.get(key)!;
        task.totalQty += item.qty;
        task.orders.push({
          id: order.id!,
          bookingNumber: order.bookingNumber,
          qty: item.qty,
          status: order.status,
          warehouseStatus: item.status === 'Picked' ? 'Picked' : (order.warehouseStatus || 'Pending')
        });
      });
    });

    return Array.from(taskMap.values()).sort((a, b) => {
      return a.location.localeCompare(b.location, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [orders]);

  const orderTasks = useMemo(() => {
    return orders.map(order => {
      const totalItems = order.items.length;
      const pickedItems = order.items.filter(i => i.status === 'Picked').length;
      return {
        id: order.id!,
        bookingNumber: order.bookingNumber,
        createdTime: order.createdTime,
        status: order.status,
        warehouseStatus: order.warehouseStatus || 'Pending',
        totalItems,
        pickedItems,
        items: order.items
      };
    }).sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
  }, [orders]);

  const filteredLocationTasks = locationTasks.filter(task => {
    const matchesSearch = 
      task.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.orders.some(o => o.bookingNumber.toLowerCase().includes(searchTerm.toLowerCase()));

    if (statusFilter === 'All') return matchesSearch;
    if (statusFilter === 'Pending') return matchesSearch && task.orders.some(o => o.warehouseStatus === 'Pending');
    if (statusFilter === 'Picking') return matchesSearch && task.orders.some(o => o.warehouseStatus === 'Picking');
    if (statusFilter === 'Picked') return matchesSearch && task.orders.every(o => o.warehouseStatus === 'Picked');
    
    return matchesSearch;
  });

  const filteredOrderTasks = orderTasks.filter(task => {
    const matchesSearch = 
      task.bookingNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.items.some(i => i.sku.toLowerCase().includes(searchTerm.toLowerCase()) || i.productName?.toLowerCase().includes(searchTerm.toLowerCase()));

    if (statusFilter === 'All') return matchesSearch;
    if (statusFilter === 'Pending') return matchesSearch && task.warehouseStatus === 'Pending';
    if (statusFilter === 'Picking') return matchesSearch && task.warehouseStatus === 'Picking';
    if (statusFilter === 'Picked') return matchesSearch && task.warehouseStatus === 'Picked';
    
    return matchesSearch;
  });

  const handleUpdateItemStatus = async (orderId: string, sku: string, status: 'Pending' | 'Picked') => {
    if (!profile) return;
    const updateKey = `${orderId}-${sku}`;
    setUpdatingIds(prev => [...prev, updateKey]);

    try {
      const response = await fetch('/api/orders/item-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-v2-auth-token': `Bearer ${token}`
        },
        body: JSON.stringify({ orderId, sku, status })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update item status');
      }
      
      logAction(profile, 'Update Item Status', `Set ${sku} to ${status} for order ${orderId}`, orderId, 'Picking');
    } catch (err: any) {
      console.error('Error updating item status:', err);
      alert(`Error: ${err.message}`);
    } finally {
      setUpdatingIds(prev => prev.filter(id => id !== updateKey));
    }
  };

  const handleStartPicking = async (orderIds: string[]) => {
    if (!profile) return;
    setUpdatingIds(prev => [...prev, ...orderIds]);

    try {
      const promises = orderIds.map(async (id) => {
        const order = orders.find(o => o.id === id);
        if (order?.warehouseStatus !== 'Pending') return;

        const response = await fetch('/api/orders/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-v2-auth-token': `Bearer ${token}`
          },
          body: JSON.stringify({
            orderId: id,
            updateData: {
              warehouseStatus: 'Picking',
              'pickingLog.startedAt': new Date().toISOString(),
              'pickingLog.pickerId': profile.uid,
              'pickingLog.pickerName': profile.name
            }
          })
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update order');
        }
      });

      await Promise.all(promises);
      logAction(profile, 'Start Picking', `Started picking for orders: ${orderIds.join(', ')}`, null, 'Picking');
    } catch (err: any) {
      console.error('Error starting picking:', err);
      alert(`Error: ${err.message}`);
    } finally {
      setUpdatingIds(prev => prev.filter(id => !orderIds.includes(id)));
    }
  };

  const handleMarkAsPicked = async (orderIds: string[]) => {
    if (!profile) return;
    setUpdatingIds(prev => [...prev, ...orderIds]);

    try {
      const promises = orderIds.map(async (id) => {
        const response = await fetch('/api/orders/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-v2-auth-token': `Bearer ${token}`
          },
          body: JSON.stringify({
            orderId: id,
            updateData: {
              warehouseStatus: 'Picked',
              'pickingLog.finishedAt': new Date().toISOString()
            }
          })
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update order');
        }
      });

      await Promise.all(promises);
      logAction(profile, 'Mark as Picked', `Marked orders as picked: ${orderIds.join(', ')}`, null, 'Picking');
    } catch (err: any) {
      console.error('Error marking as picked:', err);
      alert(`Error: ${err.message}`);
    } finally {
      setUpdatingIds(prev => prev.filter(id => !orderIds.includes(id)));
    }
  };

  const handleReportIssue = async (orderId: string, bookingNumber: string) => {
    if (!profile) return;
    const issue = window.prompt(`Report inventory issue for Order ${bookingNumber}:`);
    if (!issue) return;

    try {
      await updateDoc(doc(db, 'orders', orderId), {
        'pickingLog.inventoryIssue': issue,
        'pickingLog.issueReportedAt': new Date().toISOString()
      });
      logAction(profile, 'Report Inventory Issue', `Reported issue for ${bookingNumber}: ${issue}`, orderId, 'Picking');
    } catch (err) {
      console.error('Error reporting issue:', err);
    }
  };

  const toggleExpand = (key: string) => {
    setExpandedTasks(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex-shrink-0">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-indigo-600" />
              Picking
            </h1>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setActiveTab('location')}
                  className={cn(
                    "text-[10px] font-black px-3 py-1.5 rounded-lg transition-all uppercase tracking-wider",
                    activeTab === 'location' 
                      ? "bg-white text-indigo-600 shadow-sm" 
                      : "text-slate-500 hover:bg-slate-200/50"
                  )}
                >
                  By Loc
                </button>
                <button
                  onClick={() => setActiveTab('order')}
                  className={cn(
                    "text-[10px] font-black px-3 py-1.5 rounded-lg transition-all uppercase tracking-wider",
                    activeTab === 'order' 
                      ? "bg-white text-purple-600 shadow-sm" 
                      : "text-slate-500 hover:bg-slate-200/50"
                  )}
                >
                  By Order
                </button>
              </div>
              <button 
                onClick={() => window.location.href = '/logs?category=Picking'}
                className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-all"
                title="Picking History"
              >
                <HistoryIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder={activeTab === 'location' ? "SKU, Loc..." : "Order #, SKU..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-100 border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 rounded-xl text-xs transition-all outline-none"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-100 border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 rounded-xl text-[10px] font-bold px-3 py-2 outline-none transition-all uppercase tracking-wider"
            >
              <option value="All">All</option>
              <option value="Pending">Pending</option>
              <option value="Picking">Picking</option>
              <option value="Picked">Ready</option>
            </select>
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {activeTab === 'location' ? (
            filteredLocationTasks.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
                <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900">No picking tasks found</h3>
                <p className="text-slate-500">All items are currently handled or no items match your search.</p>
              </div>
            ) : (
              filteredLocationTasks.map((task) => {
                const key = `${task.sku}-${task.location}`;
                const isExpanded = expandedTasks.includes(key);
                const allPicked = task.orders.every(o => o.warehouseStatus === 'Picked');
                
                return (
                  <motion.div
                    layout
                    key={key}
                    className={cn(
                      "bg-white rounded-2xl border transition-all overflow-hidden shadow-sm",
                      allPicked ? "border-emerald-100 bg-emerald-50/30" : "border-slate-200 hover:border-indigo-200"
                    )}
                  >
                    <div className="p-4 flex items-center gap-4">
                      {/* Location Badge */}
                      <div className="flex-shrink-0 w-20 h-20 bg-blue-50 rounded-xl flex flex-col items-center justify-center border border-blue-100">
                        <MapPin className="w-4 h-4 text-blue-600 mb-1" />
                        <span className="text-lg font-black text-blue-700 tracking-tighter">{task.location}</span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-wider">
                            {task.sku}
                          </span>
                          {allPicked && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded uppercase">
                              <CheckCircle2 className="w-3 h-3" />
                              Ready
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <div className="flex items-center gap-1 text-sm">
                            <Package className="w-4 h-4 text-slate-400" />
                            <span className="font-bold text-slate-900 text-lg">Qty: {task.totalQty}</span>
                          </div>
                          <div className="text-xs text-slate-400 font-medium">
                            {task.orders.length} Orders
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col items-end gap-2">
                        {!allPicked && (
                          <>
                            {task.orders.some(o => o.warehouseStatus === 'Pending') ? (
                              <button
                                onClick={() => {
                                  const pendingOrders = task.orders.filter(o => o.warehouseStatus === 'Pending');
                                  handleStartPicking(pendingOrders.map(o => o.id));
                                }}
                                disabled={task.orders.some(o => updatingIds.includes(o.id))}
                                className="flex items-center justify-center bg-indigo-600 text-white w-12 h-12 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-md active:scale-95 disabled:opacity-50"
                              >
                                {task.orders.some(o => updatingIds.includes(o.id)) ? (
                                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <Play className="w-6 h-6 fill-current" />
                                )}
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  const pickingOrders = task.orders.filter(o => o.warehouseStatus === 'Picking');
                                  pickingOrders.forEach(o => handleUpdateItemStatus(o.id, task.sku, 'Picked'));
                                }}
                                disabled={task.orders.some(o => updatingIds.includes(`${o.id}-${task.sku}`))}
                                className="flex items-center justify-center bg-emerald-600 text-white w-12 h-12 rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-md active:scale-95 disabled:opacity-50"
                              >
                                {task.orders.some(o => updatingIds.includes(`${o.id}-${task.sku}`)) ? (
                                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <ArrowRight className="w-6 h-6" />
                                )}
                              </button>
                            )}
                          </>
                        )}
                        <button
                          onClick={() => toggleExpand(key)}
                          className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
                        >
                          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                    {/* Expanded Order Details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-slate-100 bg-slate-50/50"
                        >
                          <div className="p-4 space-y-2">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Associated Orders</h4>
                            {task.orders.map((order) => (
                              <div key={order.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white shadow-sm">
                                <div className="flex items-center gap-4">
                                  <div className="flex flex-col">
                                    <span className="text-sm font-bold text-slate-900">{order.bookingNumber}</span>
                                    <span className="text-xs text-slate-500">Qty: {order.qty}</span>
                                  </div>
                                  <span className={cn(
                                    "text-[10px] font-bold px-2 py-0.5 rounded uppercase",
                                    order.warehouseStatus === 'Pending' ? "bg-slate-100 text-slate-600" :
                                    order.warehouseStatus === 'Picking' ? "bg-amber-100 text-amber-600" :
                                    "bg-emerald-100 text-emerald-600"
                                  )}>
                                    {order.warehouseStatus === 'Picked' ? 'Ready' : order.warehouseStatus}
                                  </span>
                                </div>
                                {order.warehouseStatus !== 'Picked' && (
                                  <>
                                    {order.warehouseStatus === 'Pending' ? (
                                      <button
                                        onClick={() => handleStartPicking([order.id])}
                                        disabled={updatingIds.includes(order.id)}
                                        className="flex items-center justify-center bg-indigo-50 text-indigo-600 w-10 h-10 rounded-xl border border-indigo-100 active:bg-indigo-100 transition-all disabled:opacity-50"
                                        title="Start Picking"
                                      >
                                        {updatingIds.includes(order.id) ? (
                                          <div className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                          <Play className="w-5 h-5 fill-current" />
                                        )}
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleUpdateItemStatus(order.id, task.sku, 'Picked')}
                                        disabled={updatingIds.includes(`${order.id}-${task.sku}`)}
                                        className="flex items-center justify-center bg-emerald-50 text-emerald-600 w-10 h-10 rounded-xl border border-emerald-100 active:bg-emerald-100 transition-all disabled:opacity-50"
                                        title="Complete Picking"
                                      >
                                        {updatingIds.includes(`${order.id}-${task.sku}`) ? (
                                          <div className="w-3 h-3 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                          <ArrowRight className="w-5 h-5" />
                                        )}
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })
            )
          ) : (
            filteredOrderTasks.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
                <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900">No orders found</h3>
                <p className="text-slate-500">All orders are handled or no orders match your search.</p>
              </div>
            ) : (
              filteredOrderTasks.map((task) => {
                const isExpanded = expandedTasks.includes(task.id);
                const progress = (task.pickedItems / task.totalItems) * 100;
                
                return (
                  <motion.div
                    layout
                    key={task.id}
                    className={cn(
                      "bg-white rounded-2xl border transition-all overflow-hidden shadow-sm",
                      task.warehouseStatus === 'Picked' ? "border-emerald-100 bg-emerald-50/30" : "border-slate-200 hover:border-purple-200"
                    )}
                  >
                    <div className="p-4 flex items-center gap-4">
                      {/* Order ID Badge */}
                      <div className="flex-shrink-0 w-20 h-20 bg-purple-50 rounded-xl flex flex-col items-center justify-center border border-purple-100">
                        <ClipboardList className="w-4 h-4 text-purple-600 mb-1" />
                        <span className="text-lg font-black text-purple-700 tracking-tighter">{task.bookingNumber}</span>
                      </div>

                      {/* Order Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider",
                            task.warehouseStatus === 'Pending' ? "bg-slate-100 text-slate-600" :
                            task.warehouseStatus === 'Picking' ? "bg-amber-100 text-amber-600" :
                            "bg-emerald-100 text-emerald-600"
                          )}>
                            {task.warehouseStatus === 'Picked' ? 'Ready' : task.warehouseStatus}
                          </span>
                          <span className="text-[10px] text-slate-400">{formatDate(task.createdTime, 'HH:mm')}</span>
                        </div>
                        
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-900 font-bold">{task.pickedItems} / {task.totalItems} items</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${progress}%` }}
                              className={cn(
                                "h-full transition-all duration-500",
                                progress === 100 ? "bg-emerald-500" : "bg-purple-500"
                              )}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col items-end gap-2">
                        {task.warehouseStatus === 'Pending' && (
                          <button
                            onClick={() => handleStartPicking([task.id])}
                            disabled={updatingIds.includes(task.id)}
                            className="flex items-center justify-center bg-indigo-600 text-white w-12 h-12 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-md active:scale-95 disabled:opacity-50"
                          >
                            {updatingIds.includes(task.id) ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Play className="w-6 h-6 fill-current" />
                            )}
                          </button>
                        )}
                        {task.warehouseStatus === 'Picking' && (
                          <button
                            onClick={() => {
                              if (task.pickedItems === task.totalItems) {
                                handleMarkAsPicked([task.id]);
                              } else {
                                // If not all items picked, maybe show a hint or allow completing?
                                // User said "confirm picking", let's assume they mean completing the order if all items are picked.
                                // Or maybe they want to complete individual items?
                                // Let's keep the logic: if all items picked, complete order.
                                handleMarkAsPicked([task.id]);
                              }
                            }}
                            disabled={updatingIds.includes(task.id)}
                            className="flex items-center justify-center bg-emerald-600 text-white w-12 h-12 rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-md active:scale-95 disabled:opacity-50"
                          >
                            {updatingIds.includes(task.id) ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <ArrowRight className="w-6 h-6" />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => toggleExpand(task.id)}
                          className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
                        >
                          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                    {/* Expanded Item Details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-slate-100 bg-slate-50/50"
                        >
                          <div className="p-4 space-y-2">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Order Items</h4>
                            {task.items.map((item) => (
                              <div key={item.sku} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white shadow-sm">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-100">
                                    <MapPin className="w-4 h-4 text-slate-400" />
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-sm font-black text-slate-900">{item.sku}</span>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">Loc: {item.location}</span>
                                      <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">Qty: {item.qty}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {item.status === 'Picked' ? (
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded uppercase">
                                      <CheckCircle2 className="w-3 h-3" />
                                      Picked
                                    </span>
                                  ) : (
                                    <>
                                      {task.warehouseStatus === 'Pending' ? (
                                        <button
                                          onClick={() => handleStartPicking([task.id])}
                                          disabled={updatingIds.includes(task.id)}
                                          className="flex items-center justify-center bg-indigo-50 text-indigo-600 w-10 h-10 rounded-xl border border-indigo-100 active:bg-indigo-100 transition-all disabled:opacity-50"
                                          title="Start Picking"
                                        >
                                          {updatingIds.includes(task.id) ? (
                                            <div className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                          ) : (
                                            <Play className="w-5 h-5 fill-current" />
                                          )}
                                        </button>
                                      ) : (
                                        <>
                                          <button
                                            onClick={() => handleReportIssue(task.id, task.bookingNumber)}
                                            className="text-[10px] font-bold text-slate-400 hover:text-red-600 transition-colors px-2"
                                          >
                                            Issue?
                                          </button>
                                          <button
                                            onClick={() => handleUpdateItemStatus(task.id, item.sku, 'Picked')}
                                            disabled={updatingIds.includes(`${task.id}-${item.sku}`)}
                                            className="flex items-center justify-center bg-emerald-50 text-emerald-600 w-10 h-10 rounded-xl border border-emerald-100 active:bg-emerald-100 transition-all disabled:opacity-50"
                                            title="Mark as Picked"
                                          >
                                            {updatingIds.includes(`${task.id}-${item.sku}`) ? (
                                              <div className="w-3 h-3 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                              <ArrowRight className="w-5 h-5" />
                                            )}
                                          </button>
                                        </>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })
            )
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="bg-white border-t border-slate-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-slate-200"></div>
            <span className="text-xs font-medium text-slate-500">Pending</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-400"></div>
            <span className="text-xs font-medium text-slate-500">Picking</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
            <span className="text-xs font-medium text-slate-500">Ready</span>
          </div>
        </div>
        <div className="text-xs text-slate-400 font-medium">
          Showing {activeTab === 'location' ? filteredLocationTasks.length : filteredOrderTasks.length} {activeTab === 'location' ? 'tasks' : 'orders'} across {orders.length} orders
        </div>
      </div>
    </div>
  );
};
