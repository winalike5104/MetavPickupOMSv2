import React, { useEffect, useState } from 'react';
import { AlertTriangle, Archive, CheckCircle2, Clock, ClipboardList, Package, Plus, RotateCcw, Search, Send, ShoppingBag } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../components/AuthProvider';
import { CounterPickup } from '../types';
import { cn, formatDate, hasPermission } from '../utils';

type ListingView = 'active' | 'history';
type FinalizeFormState = {
  destination: '' | 'Returned' | 'Sold' | 'Other';
  referenceNo: string;
  otherNotes: string;
};

const emptyFinalizeForm: FinalizeFormState = {
  destination: '',
  referenceNo: '',
  otherNotes: ''
};

export const CounterPickupListing: React.FC = () => {
  const { token, activeWarehouse, profile } = useAuth();
  const location = useLocation();
  const isCnRoute = location.pathname.startsWith('/cn');
  const [view, setView] = useState<ListingView>('active');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<CounterPickup[]>([]);
  const [sku, setSku] = useState('');
  const [qty, setQty] = useState(1);
  const [skuMeta, setSkuMeta] = useState<{ productName: string; location: string } | null>(null);
  const [skuMetaLoading, setSkuMetaLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [finalizeTarget, setFinalizeTarget] = useState<CounterPickup | null>(null);
  const [finalizeForm, setFinalizeForm] = useState<FinalizeFormState>(emptyFinalizeForm);
  const [isScrolled, setIsScrolled] = useState(false);
  const sentinelRef = React.useRef<HTMLDivElement>(null);

  const canCreate = profile?.roleTemplate !== 'Warehouse';
  const canManageWarehouse = profile?.roleTemplate === 'Warehouse' || profile?.roleTemplate === 'Admin' || hasPermission(profile, 'Manage Picking', profile?.username || profile?.email);

  const text = {
    title: isCnRoute ? '申请提货 Listing' : 'Counter Pickup Listing',
    subtitle: isCnRoute ? '前台临时提货申请、仓库送达与结案闭环。' : 'Front desk urgent pickup requests, warehouse delivery, and closure workflow.',
    create: isCnRoute ? '提交申请' : 'Create Request',
    active: isCnRoute ? '待办单据' : 'Active',
    history: isCnRoute ? '历史归档' : 'History',
    pickedAlert: isCnRoute ? '已到前台，等待补充动向' : 'Picked to front desk, waiting for closure',
    pendingPutback: isCnRoute ? '待回库确认' : 'Pending putback',
    noData: isCnRoute ? '当前没有符合条件的申请提货单。' : 'No counter pickup requests match the current view.',
    requestNo: isCnRoute ? '申请号' : 'Request No.',
    warehouse: isCnRoute ? '仓库' : 'Warehouse',
    qty: isCnRoute ? '数量' : 'Qty',
    location: isCnRoute ? '库位' : 'Location',
    status: isCnRoute ? '状态' : 'Status',
    destination: isCnRoute ? '去向' : 'Destination',
    markPicked: isCnRoute ? '确认送达前台' : 'Mark Picked',
    startPicking: isCnRoute ? '开始拣货' : 'Start Picking',
    finalize: isCnRoute ? '补充动向' : 'Finalize',
    completePutback: isCnRoute ? '确认回库完成' : 'Complete Putback',
    productName: isCnRoute ? '产品名称' : 'Product Name',
    scanSku: isCnRoute ? '输入或扫码 SKU' : 'Enter or scan SKU',
    lookupHint: isCnRoute ? '系统会自动带出产品名称与主库位。' : 'The system will auto-fill product name and primary location.',
    referenceNo: isCnRoute ? '关联单号' : 'Reference No.',
    otherNotes: isCnRoute ? '其他说明' : 'Other Notes',
    submit: isCnRoute ? '提交' : 'Submit',
    cancel: isCnRoute ? '取消' : 'Cancel'
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setIsScrolled(!entry.isIntersecting),
      { threshold: 0 }
    );
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => {
      if (sentinelRef.current) observer.unobserve(sentinelRef.current);
    };
  }, []);

  const loadRequests = async (nextView = view) => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/counter-pickups/list?view=${nextView}&limit=300`, {
        headers: {
          'x-v2-auth-token': `Bearer ${token}`,
          'x-warehouse-id': activeWarehouse || ''
        }
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load counter pickup requests');
      }
      setRequests((data.requests || []) as CounterPickup[]);
    } catch (err: any) {
      alert(err.message || 'Failed to load counter pickup requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests(view);
  }, [token, activeWarehouse, view]);

  const lookupSku = async () => {
    if (!token || sku.trim().length < 2) {
      setSkuMeta(null);
      return;
    }
    setSkuMetaLoading(true);
    try {
      const params = new URLSearchParams({ q: sku.trim().toUpperCase(), limit: '10' });
      const response = await fetch(`/api/skus/search?${params.toString()}`, {
        headers: {
          'x-v2-auth-token': `Bearer ${token}`,
          'x-warehouse-id': activeWarehouse || ''
        }
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to search SKU');
      }
      const exact = (data.skus || []).find((item: any) => item.sku === sku.trim().toUpperCase()) || data.skus?.[0];
      if (!exact) {
        setSkuMeta(null);
        return;
      }
      setSkuMeta({
        productName: exact.productName || sku.trim().toUpperCase(),
        location: exact.location || 'NOT_ASSIGNED'
      });
    } catch (err: any) {
      setSkuMeta(null);
      alert(err.message || 'Failed to search SKU');
    } finally {
      setSkuMetaLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!token || !skuMeta || !sku.trim()) return;
    setSubmitting(true);
    try {
      const response = await fetch('/api/counter-pickups/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-v2-auth-token': `Bearer ${token}`,
          'x-warehouse-id': activeWarehouse || ''
        },
        body: JSON.stringify({
          sku: sku.trim().toUpperCase(),
          qty
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create counter pickup');
      }
      setSku('');
      setQty(1);
      setSkuMeta(null);
      setView('active');
      await loadRequests('active');
    } catch (err: any) {
      alert(err.message || 'Failed to create counter pickup');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartPicking = async (requestId: string) => {
    if (!token) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/counter-pickups/${requestId}/start-picking`, {
        method: 'POST',
        headers: {
          'x-v2-auth-token': `Bearer ${token}`,
          'x-warehouse-id': activeWarehouse || ''
        }
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to start picking');
      await loadRequests(view);
    } catch (err: any) {
      alert(err.message || 'Failed to start picking');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkPicked = async (requestId: string) => {
    if (!token) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/counter-pickups/${requestId}/mark-picked`, {
        method: 'POST',
        headers: {
          'x-v2-auth-token': `Bearer ${token}`,
          'x-warehouse-id': activeWarehouse || ''
        }
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to mark picked');
      await loadRequests(view);
    } catch (err: any) {
      alert(err.message || 'Failed to mark picked');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinalize = async () => {
    if (!token || !finalizeTarget) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/counter-pickups/${finalizeTarget.id}/finalize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-v2-auth-token': `Bearer ${token}`,
          'x-warehouse-id': activeWarehouse || ''
        },
        body: JSON.stringify(finalizeForm)
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to finalize counter pickup');
      setFinalizeTarget(null);
      setFinalizeForm(emptyFinalizeForm);
      await loadRequests(view);
    } catch (err: any) {
      alert(err.message || 'Failed to finalize counter pickup');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompletePutback = async (requestId: string) => {
    if (!token) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/counter-pickups/${requestId}/complete-putback`, {
        method: 'POST',
        headers: {
          'x-v2-auth-token': `Bearer ${token}`,
          'x-warehouse-id': activeWarehouse || ''
        }
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to complete putback');
      await loadRequests(view);
    } catch (err: any) {
      alert(err.message || 'Failed to complete putback');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredRequests = requests.filter((item) => {
    const haystack = `${item.id} ${item.sku} ${item.productName} ${item.location} ${item.createdBy}`.toLowerCase();
    return haystack.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">
      <PageHeader
        title={text.title}
        subtitle={text.subtitle}
        icon={ClipboardList}
        isScrolled={isScrolled}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setView('active')}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all", view === 'active' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500")}
              >
                {text.active}
              </button>
              <button
                onClick={() => setView('history')}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all", view === 'history' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500")}
              >
                {text.history}
              </button>
            </div>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div ref={sentinelRef} className="h-px w-full pointer-events-none -mt-8" />
        <div className="max-w-6xl mx-auto space-y-6">
          {canCreate && (
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-900">{text.create}</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-slate-700">{text.scanSku}</label>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={sku}
                      onChange={(e) => setSku(e.target.value.toUpperCase())}
                      onBlur={lookupSku}
                      placeholder="SKU"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <button
                      onClick={lookupSku}
                      disabled={skuMetaLoading}
                      className="px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-700 font-semibold"
                    >
                      <Search className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{text.lookupHint}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">{text.qty}</label>
                  <input
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                    className="mt-2 w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleCreate}
                    disabled={submitting || !skuMeta || !sku.trim()}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    {text.submit}
                  </button>
                </div>
              </div>

              {skuMeta && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 border border-slate-100 rounded-2xl p-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-400">{text.productName}</p>
                    <p className="text-sm font-semibold text-slate-900 mt-1">{skuMeta.productName}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-400">{text.location}</p>
                    <p className="text-sm font-semibold text-slate-900 mt-1">{skuMeta.location}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={isCnRoute ? '搜索申请号、SKU、产品名、库位...' : 'Search request no., SKU, product, location...'}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
              <Clock className="w-10 h-10 text-slate-300 mx-auto mb-4 animate-pulse" />
              <p className="text-slate-500">{isCnRoute ? '正在加载申请提货单...' : 'Loading counter pickup requests...'}</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
              <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">{text.noData}</p>
            </div>
          ) : (
            filteredRequests.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "bg-white border rounded-2xl shadow-sm p-5",
                  item.status === 'Picked' ? "border-red-300 ring-2 ring-red-100" : "border-slate-100",
                  item.status === 'PendingPutback' ? "border-amber-200 bg-amber-50/40" : ""
                )}
              >
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-yellow-100 text-yellow-800 text-xs font-bold uppercase">Counter Pickup</span>
                      <span className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold uppercase",
                        item.status === 'PendingPick' ? "bg-slate-100 text-slate-700" :
                        item.status === 'Picked' ? "bg-red-100 text-red-700" :
                        item.status === 'PendingPutback' ? "bg-amber-100 text-amber-700" :
                        "bg-emerald-100 text-emerald-700"
                      )}>
                        {item.status}
                      </span>
                      <span className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold uppercase",
                        item.queueStatus === 'Pending' ? "bg-slate-100 text-slate-700" :
                        item.queueStatus === 'Picking' ? "bg-indigo-100 text-indigo-700" :
                        "bg-emerald-100 text-emerald-700"
                      )}>
                        {item.queueStatus}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-400">{text.requestNo}</p>
                        <p className="text-sm font-bold text-slate-900 mt-1">{item.id}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-400">SKU</p>
                        <p className="text-sm font-bold text-slate-900 mt-1">{item.sku}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-400">{text.productName}</p>
                        <p className="text-sm font-semibold text-slate-900 mt-1">{item.productName}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-400">{text.location}</p>
                        <p className="text-sm font-semibold text-slate-900 mt-1">{item.location}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-400">{text.qty}</p>
                        <p className="text-sm font-semibold text-slate-900 mt-1">{item.qty}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-400">{text.warehouse}</p>
                        <p className="text-sm font-semibold text-slate-900 mt-1">{item.warehouseId}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-400">{isCnRoute ? '创建人' : 'Created By'}</p>
                        <p className="text-sm font-semibold text-slate-900 mt-1">{item.createdBy}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-400">{isCnRoute ? '创建时间' : 'Created At'}</p>
                        <p className="text-sm font-semibold text-slate-900 mt-1">{formatDate(item.createdAt, 'PPp')}</p>
                      </div>
                    </div>

                    {item.status === 'Picked' && (
                      <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 p-3">
                        <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5" />
                        <p className="text-sm font-semibold text-red-700">{text.pickedAlert}</p>
                      </div>
                    )}

                    {item.status === 'PendingPutback' && (
                      <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 p-3">
                        <RotateCcw className="w-4 h-4 text-amber-600 mt-0.5" />
                        <p className="text-sm font-semibold text-amber-700">{text.pendingPutback}</p>
                      </div>
                    )}

                    {(item.destination || item.referenceNo || item.otherNotes) && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-wider text-slate-400">{text.destination}</p>
                          <p className="text-sm font-semibold text-slate-900 mt-1">{item.destination || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wider text-slate-400">{text.referenceNo}</p>
                          <p className="text-sm font-semibold text-slate-900 mt-1">{item.referenceNo || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wider text-slate-400">{text.otherNotes}</p>
                          <p className="text-sm font-semibold text-slate-900 mt-1">{item.otherNotes || '-'}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-row lg:flex-col gap-2 lg:min-w-[180px]">
                    {canManageWarehouse && item.status === 'PendingPick' && item.queueStatus === 'Pending' && (
                      <button
                        onClick={() => handleStartPicking(item.id)}
                        disabled={submitting}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all disabled:opacity-50"
                      >
                        <ShoppingBag className="w-4 h-4" />
                        {text.startPicking}
                      </button>
                    )}

                    {canManageWarehouse && item.status === 'PendingPick' && item.queueStatus !== 'Picked' && (
                      <button
                        onClick={() => handleMarkPicked(item.id)}
                        disabled={submitting}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-all disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {text.markPicked}
                      </button>
                    )}

                    {canCreate && item.status === 'Picked' && (
                      <button
                        onClick={() => {
                          setFinalizeTarget(item);
                          setFinalizeForm(emptyFinalizeForm);
                        }}
                        disabled={submitting}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all disabled:opacity-50"
                      >
                        <Send className="w-4 h-4" />
                        {text.finalize}
                      </button>
                    )}

                    {canManageWarehouse && item.status === 'PendingPutback' && (
                      <button
                        onClick={() => handleCompletePutback(item.id)}
                        disabled={submitting}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 transition-all disabled:opacity-50"
                      >
                        <Archive className="w-4 h-4" />
                        {text.completePutback}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {finalizeTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{text.finalize}</h2>
              <p className="text-sm text-slate-500 mt-1">{finalizeTarget.id} | {finalizeTarget.sku}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700">{text.destination}</label>
                <select
                  value={finalizeForm.destination}
                  onChange={(e) => setFinalizeForm((prev) => ({ ...prev, destination: e.target.value as FinalizeFormState['destination'] }))}
                  className="mt-2 w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">{isCnRoute ? '请选择' : 'Select one'}</option>
                  <option value="Returned">Returned</option>
                  <option value="Sold">Sold</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {finalizeForm.destination === 'Sold' && (
                <div>
                  <label className="text-sm font-medium text-slate-700">{text.referenceNo}</label>
                  <input
                    value={finalizeForm.referenceNo}
                    onChange={(e) => setFinalizeForm((prev) => ({ ...prev, referenceNo: e.target.value }))}
                    className="mt-2 w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              )}

              {finalizeForm.destination === 'Other' && (
                <div>
                  <label className="text-sm font-medium text-slate-700">{text.otherNotes}</label>
                  <textarea
                    value={finalizeForm.otherNotes}
                    onChange={(e) => setFinalizeForm((prev) => ({ ...prev, otherNotes: e.target.value }))}
                    className="mt-2 w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none min-h-[120px]"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setFinalizeTarget(null);
                  setFinalizeForm(emptyFinalizeForm);
                }}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold"
              >
                {text.cancel}
              </button>
              <button
                onClick={handleFinalize}
                disabled={submitting || !finalizeForm.destination}
                className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all disabled:opacity-50"
              >
                {text.submit}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

