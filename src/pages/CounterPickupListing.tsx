import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  Archive,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Loader2,
  Package,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShoppingBag
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../components/AuthProvider';
import { useClickOutside } from '../hooks/useClickOutside';
import { CounterPickup, CounterPickupQueueStatus, CounterPickupStatus, SKU } from '../types';
import { cn, formatDate, hasPermission } from '../utils';

type ListingView = 'active' | 'history';
type StatusFilter = 'All' | CounterPickupStatus;
type QueueFilter = 'All' | CounterPickupQueueStatus;
type FinalizeFormState = {
  destination: '' | 'Returned' | 'Sold' | 'Other';
  referenceNo: string;
  otherNotes: string;
};

type CounterPickupItem = {
  sku: string;
  qty: number;
  productName: string;
  location: string;
};

type CounterPickupItemDraft = {
  skuQuery: string;
  sku: string;
  qty: number;
  productName: string;
  location: string;
  skuResults: SKU[];
  showSkuResults: boolean;
  skuMetaLoading: boolean;
  skuMeta: { productName: string; location: string } | null;
  skuLookupMiss: boolean;
  manualProductName: string;
  manualLocation: string;
};

const PAGE_SIZE = 50;

const emptyFinalizeForm: FinalizeFormState = {
  destination: '',
  referenceNo: '',
  otherNotes: ''
};

const createEmptyDraft = (): CounterPickupItemDraft => ({
  skuQuery: '',
  sku: '',
  qty: 1,
  productName: '',
  location: 'NOT_ASSIGNED',
  skuResults: [],
  showSkuResults: false,
  skuMetaLoading: false,
  skuMeta: null,
  skuLookupMiss: false,
  manualProductName: '',
  manualLocation: 'NOT_ASSIGNED'
});

const CN_TEXT = {
  pageTitle: '申请提货列表',
  pageSubtitle: '前台临时提货、仓库送达与后续结案处理。',
  active: '待处理',
  history: '历史记录',
  createRequest: '新建申请',
  createHint: '像创建订单一样搜索 SKU，自动带出产品和库位。特殊 SKU 也可以手动填写。',
  showCreate: '展开申请表单',
  hideCreate: '收起申请表单',
  skuLabel: 'SKU / 产品搜索',
  skuPlaceholder: '搜索 SKU 或产品名称...',
  skuHelp: '系统会自动带出产品名称和主库位。若为特殊 SKU，可手动补充产品信息。',
  qty: '数量',
  submit: '提交申请',
  productName: '产品名称',
  productNamePlaceholder: '请输入特殊 SKU 的产品名称',
  location: '库位',
  locationPlaceholder: '请输入库位，或保留 NOT_ASSIGNED',
  manualSku: '使用自定义 SKU',
  searchPlaceholder: '搜索申请号、SKU、产品名、库位、创建人...',
  statusFilter: '状态筛选',
  queueFilter: '队列筛选',
  dateFilter: '日期筛选',
  loading: '正在加载申请提货数据...',
  empty: '当前视图下没有符合条件的申请提货记录。',
  counterPickup: '申请提货',
  requestNo: '申请单号',
  warehouse: '仓库',
  createdBy: '创建人',
  createdAt: '创建时间',
  destination: '去向',
  referenceNo: '关联单号',
  otherNotes: '备注说明',
  startPicking: '开始拣货',
  markPicked: '确认送达',
  finalize: '完成结案',
  completePutback: '确认回库',
  finalizeTitle: '完成结案',
  selectOne: '请选择',
  returned: '回库',
  sold: '已售出',
  other: '其他',
  cancel: '取消',
  productNameRequired: '特殊 SKU 或未匹配 SKU 必须填写产品名称。',
  loadError: '加载申请提货失败',
  searchSkuError: 'SKU 查询失败',
  createError: '创建申请提货失败',
  startPickingError: '开始拣货失败',
  markPickedError: '确认送达失败',
  finalizeError: '结案失败',
  completePutbackError: '确认回库失败',
  noWarehouse: '未分配',
  allStatuses: '全部状态',
  allQueues: '全部队列',
  pendingPick: '待拣货',
  picked: '已送达前台',
  pendingPutback: '等待回库',
  finalized: '已结案',
  queuePending: '待领取',
  queuePicking: '拣货中',
  queuePicked: '已完成拣货',
  pickedAlert: '已送达前台，等待补充去向',
  putbackAlert: '等待仓库回库确认',
  noResults: '没有匹配结果，可直接使用自定义 SKU。',
  showing: '显示',
  of: '/',
  prev: '上一页',
  next: '下一页',
  actions: '操作'
} as const;

const EN_TEXT = {
  pageTitle: 'Counter Pickup Listing',
  pageSubtitle: 'Reception urgent pickup requests, warehouse delivery, and closure workflow.',
  active: 'Active',
  history: 'History',
  createRequest: 'Create Request',
  createHint: 'Search SKU like Order Create, auto-fill product and location, or enter a special SKU manually.',
  showCreate: 'Show Request Form',
  hideCreate: 'Hide Request Form',
  skuLabel: 'SKU / Product Search',
  skuPlaceholder: 'Search SKU or product name...',
  skuHelp: 'The system will auto-fill product name and primary location. If this is a special SKU, you can enter product details manually.',
  qty: 'Qty',
  submit: 'Submit',
  productName: 'Product Name',
  productNamePlaceholder: 'Enter product name for special SKU',
  location: 'Location',
  locationPlaceholder: 'Enter location or keep NOT_ASSIGNED',
  manualSku: 'Use Custom SKU',
  searchPlaceholder: 'Search request no., SKU, product, location, creator...',
  statusFilter: 'Status Filter',
  queueFilter: 'Queue Filter',
  dateFilter: 'Date Filter',
  loading: 'Loading counter pickup requests...',
  empty: 'No counter pickup requests match the current view.',
  counterPickup: 'Counter Pickup',
  requestNo: 'Request No.',
  warehouse: 'Warehouse',
  createdBy: 'Created By',
  createdAt: 'Created At',
  destination: 'Destination',
  referenceNo: 'Reference No.',
  otherNotes: 'Other Notes',
  startPicking: 'Start Picking',
  markPicked: 'Mark Picked',
  finalize: 'Finalize',
  completePutback: 'Complete Putback',
  finalizeTitle: 'Finalize',
  selectOne: 'Select one',
  returned: 'Returned to warehouse',
  sold: 'Sold',
  other: 'Other',
  cancel: 'Cancel',
  productNameRequired: 'Product name is required for unmatched or special SKU.',
  loadError: 'Failed to load counter pickup requests',
  searchSkuError: 'Failed to search SKU',
  createError: 'Failed to create counter pickup',
  startPickingError: 'Failed to start picking',
  markPickedError: 'Failed to mark picked',
  finalizeError: 'Failed to finalize counter pickup',
  completePutbackError: 'Failed to complete putback',
  noWarehouse: 'Unassigned',
  allStatuses: 'All Statuses',
  allQueues: 'All Queues',
  pendingPick: 'Pending Pick',
  picked: 'Picked',
  pendingPutback: 'Pending Putback',
  finalized: 'Finalized',
  queuePending: 'Pending',
  queuePicking: 'Picking',
  queuePicked: 'Picked',
  pickedAlert: 'Picked to reception, waiting for closure',
  putbackAlert: 'Waiting for warehouse putback confirmation',
  noResults: 'No matching results. You can use a custom SKU.',
  showing: 'Showing',
  of: 'of',
  prev: 'Prev',
  next: 'Next',
  actions: 'Actions'
} as const;

const getStatusBadgeClass = (status: CounterPickupStatus) => {
  if (status === 'PendingPick') return 'bg-amber-100 text-amber-700';
  if (status === 'Picked') return 'bg-red-100 text-red-700';
  if (status === 'PendingPutback') return 'bg-orange-100 text-orange-700';
  return 'bg-emerald-100 text-emerald-700';
};

const getQueueBadgeClass = (status: CounterPickupQueueStatus) => {
  if (status === 'Pending') return 'bg-slate-100 text-slate-700';
  if (status === 'Picking') return 'bg-sky-100 text-sky-700';
  return 'bg-emerald-100 text-emerald-700';
};

export const CounterPickupListing: React.FC = () => {
  const { token, activeWarehouse, profile } = useAuth();
  const location = useLocation();
  const isCnRoute = location.pathname.startsWith('/cn');
  const text = isCnRoute ? CN_TEXT : EN_TEXT;

  const [view, setView] = useState<ListingView>('active');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<CounterPickup[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('All');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [showCreateForm, setShowCreateForm] = useState(true);
  const [draft, setDraft] = useState<CounterPickupItemDraft>(createEmptyDraft);
  const [itemsDraft, setItemsDraft] = useState<CounterPickupItem[]>([]);
  const [comment, setComment] = useState('');

  const [finalizeTarget, setFinalizeTarget] = useState<CounterPickup | null>(null);
  const [finalizeForm, setFinalizeForm] = useState<FinalizeFormState>(emptyFinalizeForm);
  const [isScrolled, setIsScrolled] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const skuRef = useRef<HTMLDivElement>(null);
  useClickOutside(skuRef, () => setDraft((prev) => ({ ...prev, showSkuResults: false })));

  const canCreate = profile?.roleTemplate === 'Reception' || profile?.roleTemplate === 'Admin';
  const canManageWarehouse =
    profile?.roleTemplate === 'Warehouse' ||
    profile?.roleTemplate === 'Admin' ||
    hasPermission(profile, 'Manage Picking', profile?.username || profile?.email);
  const canViewPage = canCreate || canManageWarehouse;

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setIsScrolled(!entry.isIntersecting), { threshold: 0 });
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => {
      if (sentinelRef.current) observer.unobserve(sentinelRef.current);
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, queueFilter, dateRange.start, dateRange.end, view]);

  const resetCreateForm = () => {
    setDraft(createEmptyDraft());
    setItemsDraft([]);
    setComment('');
  };
  const loadRequests = async (nextView = view) => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/counter-pickups/list?view=${nextView}&limit=500`, {
        headers: {
          'x-v2-auth-token': `Bearer ${token}`,
          'x-warehouse-id': activeWarehouse || ''
        }
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || text.loadError);
      setRequests((data.requests || []) as CounterPickup[]);
    } catch (err: any) {
      alert(err.message || text.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests(view);
  }, [token, activeWarehouse, view]);

  useEffect(() => {
    if (!token || draft.skuQuery.trim().length < 2) {
      setDraft((prev) => ({ ...prev, skuResults: [], showSkuResults: false }));
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setDraft((prev) => ({ ...prev, skuMetaLoading: true }));
      try {
        const params = new URLSearchParams({ q: draft.skuQuery.trim().toUpperCase(), limit: '20' });
        const response = await fetch(`/api/skus/search?${params.toString()}`, {
          headers: {
            'x-v2-auth-token': `Bearer ${token}`,
            'x-warehouse-id': activeWarehouse || ''
          }
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || text.searchSkuError);
        if (!cancelled) {
          setDraft((prev) => ({
            ...prev,
            skuResults: (data.skus || []) as SKU[],
            showSkuResults: true,
            skuLookupMiss: (data.skus || []).length === 0,
            skuMetaLoading: false
          }));
        }
      } catch {
        if (!cancelled) {
          setDraft((prev) => ({
            ...prev,
            skuResults: [],
            showSkuResults: true,
            skuLookupMiss: true,
            skuMetaLoading: false
          }));
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft.skuQuery, token, activeWarehouse, text.searchSkuError]);

  const applySelectedSku = (selected: SKU) => {
    setDraft((prev) => ({
      ...prev,
      sku: selected.sku,
      skuQuery: selected.sku,
      skuMeta: {
        productName: selected.productName || selected.sku,
        location: selected.location || 'NOT_ASSIGNED'
      },
      manualProductName: selected.productName || '',
      manualLocation: selected.location || 'NOT_ASSIGNED',
      skuLookupMiss: false,
      showSkuResults: false
    }));
  };

  const useCustomSku = () => {
    const normalized = draft.skuQuery.trim().toUpperCase();
    setDraft((prev) => ({
      ...prev,
      sku: normalized,
      skuQuery: normalized,
      skuMeta: null,
      skuLookupMiss: true,
      manualLocation: prev.manualLocation || 'NOT_ASSIGNED',
      showSkuResults: false
    }));
  };

  const currentItem = (): CounterPickupItem => {
    const finalSku = (draft.sku || draft.skuQuery).trim().toUpperCase();
    const resolvedProductName = (draft.skuMeta?.productName || draft.manualProductName).trim();
    const resolvedLocation = (draft.skuMeta?.location || draft.manualLocation || 'NOT_ASSIGNED').trim().toUpperCase();
    return {
      sku: finalSku,
      qty: draft.qty,
      productName: resolvedProductName,
      location: resolvedLocation || 'NOT_ASSIGNED'
    };
  };

  const canAddDraftItem = () => {
    const item = currentItem();
    return !!item.sku && !!item.productName && Number.isInteger(item.qty) && item.qty > 0;
  };

  const addDraftItem = () => {
    const item = currentItem();
    if (!item.sku) return;
    if (!item.productName) {
      alert(text.productNameRequired);
      return;
    }
    if (!Number.isInteger(item.qty) || item.qty <= 0) return;
    setItemsDraft((prev) => [...prev, item]);
    setDraft(createEmptyDraft());
  };

  const handleCreate = async () => {
    if (!token) return;
    const combinedItems = [...itemsDraft];
    const pending = currentItem();
    if (pending.sku) combinedItems.push(pending);
    if (combinedItems.length === 0) return;
    if (combinedItems.some((item) => !item.productName)) {
      alert(text.productNameRequired);
      return;
    }

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
          items: combinedItems,
          comment
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || text.createError);
      setView('active');
      resetCreateForm();
      await loadRequests('active');
    } catch (err: any) {
      alert(err.message || text.createError);
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
      if (!response.ok || !data.success) throw new Error(data.error || text.startPickingError);
      await loadRequests(view);
    } catch (err: any) {
      alert(err.message || text.startPickingError);
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
      if (!response.ok || !data.success) throw new Error(data.error || text.markPickedError);
      await loadRequests(view);
    } catch (err: any) {
      alert(err.message || text.markPickedError);
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
      if (!response.ok || !data.success) throw new Error(data.error || text.finalizeError);
      setFinalizeTarget(null);
      setFinalizeForm(emptyFinalizeForm);
      await loadRequests(view);
    } catch (err: any) {
      alert(err.message || text.finalizeError);
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
      if (!response.ok || !data.success) throw new Error(data.error || text.completePutbackError);
      await loadRequests(view);
    } catch (err: any) {
      alert(err.message || text.completePutbackError);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredRequests = useMemo(() => {
    return requests.filter((item) => {
      const haystack = `${item.id} ${item.sku} ${item.productName} ${item.location} ${item.createdBy} ${item.referenceNo || ''} ${item.comment || ''} ${item.otherNotes || ''}`.toLowerCase();
      const matchesSearch = haystack.includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
      const matchesQueue = queueFilter === 'All' || item.queueStatus === queueFilter;
      const itemDate = item.createdAt ? new Date(item.createdAt).toISOString().split('T')[0] : '';
      const matchesDate =
        (!dateRange.start || itemDate >= dateRange.start) &&
        (!dateRange.end || itemDate <= dateRange.end);
      return matchesSearch && matchesStatus && matchesQueue && matchesDate;
    });
  }, [requests, searchTerm, statusFilter, queueFilter, dateRange.start, dateRange.end]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
  const paginatedRequests = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRequests.slice(start, start + PAGE_SIZE);
  }, [filteredRequests, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const statusLabel = (status: CounterPickupStatus) => {
    if (status === 'PendingPick') return text.pendingPick;
    if (status === 'Picked') return text.picked;
    if (status === 'PendingPutback') return text.pendingPutback;
    return text.finalized;
  };

  const queueLabel = (status: CounterPickupQueueStatus) => {
    if (status === 'Pending') return text.queuePending;
    if (status === 'Picking') return text.queuePicking;
    return text.queuePicked;
  };

  const destinationLabel = (destination?: string | null) => {
    if (!destination) return '-';
    if (destination === 'Returned') return text.returned;
    if (destination === 'Sold') return text.sold;
    if (destination === 'Other') return text.other;
    return destination;
  };
  const historyNoteLabel = (item: CounterPickup) => item.comment || item.otherNotes || '-';
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">
      <PageHeader
        title={text.pageTitle}
        subtitle={text.pageSubtitle}
        icon={ClipboardList}
        isScrolled={isScrolled}
        actions={
          canCreate ? (
            <button
              onClick={() => setShowCreateForm((prev) => !prev)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all"
            >
              <Plus className="w-4 h-4" />
              {showCreateForm ? text.hideCreate : text.showCreate}
            </button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div ref={sentinelRef} className="h-px w-full pointer-events-none -mt-8" />
        <div className="max-w-7xl mx-auto space-y-6">
          {!canViewPage ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
              <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">You do not have access to Counter Pickup.</p>
            </div>
          ) : canCreate && showCreateForm && (
            <section className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{text.createRequest}</h2>
                <p className="text-sm text-slate-500 mt-1">{text.createHint}</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-6" ref={skuRef}>
                  <label className="block text-sm font-medium text-slate-700 mb-2">{text.skuLabel}</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      value={draft.skuQuery}
                      onChange={(e) => {
                        const next = e.target.value.toUpperCase();
                        setDraft((prev) => ({ ...prev, skuQuery: next, sku: next, skuMeta: null, skuLookupMiss: false }));
                      }}
                      className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder={text.skuPlaceholder}
                    />
                    {draft.skuMetaLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-400" />}
                  </div>

                  {draft.showSkuResults && (
                    <div className="mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-72 overflow-auto">
                      {draft.skuResults.map((result) => (
                        <button
                          key={result.id || result.sku}
                          type="button"
                          onClick={() => applySelectedSku(result)}
                          className="w-full px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-bold text-slate-900">{result.sku}</p>
                              <p className="text-sm text-slate-500">{result.productName}</p>
                            </div>
                            <span className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-bold">
                              {result.location || 'NOT_ASSIGNED'}
                            </span>
                          </div>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={useCustomSku}
                        className="w-full px-4 py-3 text-left hover:bg-indigo-50 text-indigo-600 font-semibold"
                      >
                        {text.manualSku}: {draft.skuQuery || 'SKU'}
                      </button>
                      {draft.skuResults.length === 0 && (
                        <div className="px-4 py-3 text-sm text-slate-500 border-t border-slate-100">{text.noResults}</div>
                      )}
                    </div>
                  )}

                  <p className="mt-2 text-xs text-slate-500">{text.skuHelp}</p>
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">{text.qty}</label>
                  <input
                    type="number"
                    min={1}
                    value={draft.qty}
                    onChange={(e) => setDraft((prev) => ({ ...prev, qty: Math.max(1, Number(e.target.value) || 1) }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">{text.productName}</label>
                  <input
                    value={draft.skuMeta?.productName || draft.manualProductName}
                    onChange={(e) => setDraft((prev) => ({ ...prev, skuMeta: null, skuLookupMiss: true, manualProductName: e.target.value }))}
                    placeholder={text.productNamePlaceholder}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">{text.location}</label>
                  <input
                    value={draft.skuMeta?.location || draft.manualLocation}
                    onChange={(e) => setDraft((prev) => ({ ...prev, skuMeta: null, skuLookupMiss: true, manualLocation: e.target.value.toUpperCase() }))}
                    placeholder={text.locationPlaceholder}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Comment / Note</label>
                  <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Optional note for this pickup order"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="flex items-end justify-end gap-2">
                  <button
                    onClick={addDraftItem}
                    disabled={!canAddDraftItem()}
                    className="inline-flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition-all disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    Add Product
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={submitting || (itemsDraft.length === 0 && !canAddDraftItem())}
                    className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    {text.submit}
                  </button>
                </div>
              </div>

              {itemsDraft.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Added Products</div>
                  {itemsDraft.map((item, index) => (
                    <div key={`${item.sku}-${index}`} className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 break-words">{item.sku}</div>
                        <div className="text-sm text-slate-500 truncate">{item.productName}</div>
                      </div>
                      <div className="text-sm text-slate-700 font-semibold whitespace-nowrap">{item.qty} x {item.location}</div>
                      <button
                        type="button"
                        onClick={() => setItemsDraft((prev) => prev.filter((_, idx) => idx !== index))}
                        className="text-xs font-semibold text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {canViewPage && (
          <section className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-4 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={text.searchPlaceholder}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="lg:col-span-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="All">{text.statusFilter}: {text.allStatuses}</option>
                  <option value="PendingPick">{text.pendingPick}</option>
                  <option value="Picked">{text.picked}</option>
                  <option value="PendingPutback">{text.pendingPutback}</option>
                  <option value="Finalized">{text.finalized}</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <select
                  value={queueFilter}
                  onChange={(e) => setQueueFilter(e.target.value as QueueFilter)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="All">{text.queueFilter}: {text.allQueues}</option>
                  <option value="Pending">{text.queuePending}</option>
                  <option value="Picking">{text.queuePicking}</option>
                  <option value="Picked">{text.queuePicked}</option>
                </select>
              </div>

              <div className="lg:col-span-2 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <Calendar className="w-5 h-5 text-slate-400" />
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
                  className="bg-transparent outline-none text-xs flex-1 min-w-0"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
                  className="bg-transparent outline-none text-xs flex-1 min-w-0"
                />
              </div>

              <div className="lg:col-span-2 flex items-center justify-start lg:justify-end">
                <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                  <button
                    onClick={() => setView('active')}
                    className={cn('px-3 py-1.5 rounded-lg text-xs font-bold transition-all', view === 'active' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500')}
                  >
                    {text.active}
                  </button>
                  <button
                    onClick={() => setView('history')}
                    className={cn('px-3 py-1.5 rounded-lg text-xs font-bold transition-all', view === 'history' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500')}
                  >
                    {text.history}
                  </button>
                </div>
              </div>
            </div>
          </section>
          )}

          {canViewPage && (loading ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
              <Clock className="w-10 h-10 text-slate-300 mx-auto mb-4 animate-pulse" />
              <p className="text-slate-500">{text.loading}</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
              <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">{text.empty}</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto md:overflow-x-visible">
                <table className="w-full table-fixed text-left">
                  <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase">
                    <tr>
                      <th className="px-3 py-3 w-[14%]">{text.requestNo}</th>
                      <th className="px-3 py-3 w-[10%]">SKU</th>
                      <th className="px-3 py-3 w-[18%]">{view === 'history' ? 'Comment / Note' : text.productName}</th>
                      <th className="px-3 py-3 w-[7%]">{view === 'history' ? '-' : text.location}</th>
                      <th className="px-3 py-3 w-[5%] text-right">{text.qty}</th>
                      <th className="px-3 py-3 w-[12%]">{text.warehouse} / {text.createdBy}</th>
                      <th className="px-3 py-3 w-[10%]">{text.createdAt}</th>
                      <th className="px-3 py-3 w-[8%]">{text.statusFilter}</th>
                      <th className="px-3 py-3 w-[7%]">{text.queueFilter}</th>
                      <th className="px-3 py-3 w-[8%]">{text.referenceNo}</th>
                      <th className="px-3 py-3 w-[7%]">{text.destination}</th>
                      <th className="px-3 py-3 w-[13%] text-right">{text.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {paginatedRequests.map((item) => (
                      <tr key={item.id} className={cn('hover:bg-slate-50 transition-colors', item.status === 'Picked' && 'bg-red-50/40', item.status === 'PendingPutback' && 'bg-amber-50/40')}>
                        <td className="px-3 py-3 font-bold text-slate-900 align-top">
                          <div className="space-y-1">
                            <span className="block text-sm break-words" title={item.id}>{item.id}</span>
                            <span className="inline-flex px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 text-[10px] font-bold uppercase">{text.counterPickup}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-700 align-top break-words text-sm" title={item.sku}>{item.sku}</td>
                        <td className="px-3 py-3 text-slate-700 align-top">
                          {view === 'history' ? (
                            <p className="text-sm font-medium text-slate-700 break-words" title={historyNoteLabel(item)}>{historyNoteLabel(item)}</p>
                          ) : (
                            <div className="space-y-1">
                              <p className="font-medium text-sm truncate" title={item.productName}>{item.productName}</p>
                              {item.status === 'Picked' && (
                                <div className="flex items-center gap-1 text-[11px] text-red-600 font-semibold">
                                  <AlertTriangle className="w-3 h-3" />
                                  {text.pickedAlert}
                                </div>
                              )}
                              {item.status === 'PendingPutback' && (
                                <div className="flex items-center gap-1 text-[11px] text-amber-700 font-semibold">
                                  <RotateCcw className="w-3 h-3" />
                                  {text.putbackAlert}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-slate-500 align-top text-sm break-all">{view === 'history' ? '-' : item.location}</td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-900 align-top text-sm">{item.qty}</td>
                        <td className="px-3 py-3 text-slate-500 align-top">
                          <div className="space-y-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-700 truncate" title={item.warehouseId || text.noWarehouse}>
                              {item.warehouseId || text.noWarehouse}
                            </p>
                            <p className="text-[11px] truncate" title={item.createdBy}>
                              {item.createdBy}
                            </p>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-500 align-top text-sm">
                          <div className="leading-tight">
                            <div className="whitespace-nowrap">{formatDate(item.createdAt, 'yyyy-MM-dd')}</div>
                            <div className="whitespace-nowrap text-[11px] text-slate-400">{formatDate(item.createdAt, 'HH:mm')}</div>
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <span className={cn('inline-flex px-2 py-1 rounded-full text-[11px] font-bold leading-none', getStatusBadgeClass(item.status))}>
                            {statusLabel(item.status)}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <span className={cn('inline-flex px-2 py-1 rounded-full text-[11px] font-bold leading-none', getQueueBadgeClass(item.queueStatus))}>
                            {queueLabel(item.queueStatus)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-500 align-top font-medium text-sm break-all">{item.referenceNo || '-'}</td>
                        <td className="px-3 py-3 text-slate-500 align-top text-sm">{destinationLabel(item.destination)}</td>
                        <td className="px-3 py-3 align-top">
                          <div className="flex justify-end gap-1.5 flex-wrap">
                            {canManageWarehouse && item.status === 'PendingPick' && item.queueStatus === 'Pending' && (
                              <button
                                onClick={() => handleStartPicking(item.id)}
                                disabled={submitting}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-sky-600 text-white rounded-lg text-[11px] font-semibold hover:bg-sky-700 disabled:opacity-50"
                              >
                                <ShoppingBag className="w-3 h-3" />
                                {text.startPicking}
                              </button>
                            )}
                            {canManageWarehouse && item.status === 'PendingPick' && item.queueStatus !== 'Picked' && (
                              <button
                                onClick={() => handleMarkPicked(item.id)}
                                disabled={submitting}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-[11px] font-semibold hover:bg-emerald-700 disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3 h-3" />
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
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-600 text-white rounded-lg text-[11px] font-semibold hover:bg-red-700 disabled:opacity-50"
                              >
                                <Send className="w-3 h-3" />
                                {text.finalize}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {canViewPage && !loading && filteredRequests.length > 0 && (
            <div className="flex items-center justify-between bg-white border border-slate-100 rounded-xl px-4 py-3">
              <p className="text-sm text-slate-500">
                {text.showing} {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filteredRequests.length)} {text.of} {filteredRequests.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  {text.prev}
                </button>
                <span className="text-sm text-slate-600">{currentPage} / {totalPages}</span>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  {text.next}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {finalizeTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{text.finalizeTitle}</h2>
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
                  <option value="">{text.selectOne}</option>
                  <option value="Returned">{text.returned}</option>
                  <option value="Sold">{text.sold}</option>
                  <option value="Other">{text.other}</option>
                </select>
              </div>

              {finalizeForm.destination === 'Sold' && (
                <div>
                  <label className="text-sm font-medium text-slate-700">{text.referenceNo}</label>
                  <input
                    value={finalizeForm.referenceNo}
                    onChange={(e) => setFinalizeForm((prev) => ({ ...prev, referenceNo: e.target.value.toUpperCase() }))}
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
