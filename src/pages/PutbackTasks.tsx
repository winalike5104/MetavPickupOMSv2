import React, { useEffect, useState } from 'react';
import { Archive, CheckCircle2, Clock, MapPin, Package, RotateCcw, Search } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../components/AuthProvider';
import { CounterPickup } from '../types';
import { cn, formatDate } from '../utils';

export const PutbackTasks: React.FC = () => {
  const { token, activeWarehouse } = useAuth();
  const [tasks, setTasks] = useState<CounterPickup[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);
  const sentinelRef = React.useRef<HTMLDivElement>(null);

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

  const loadTasks = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetch('/api/counter-pickups/list?view=active&limit=300', {
        headers: {
          'x-v2-auth-token': `Bearer ${token}`,
          'x-warehouse-id': activeWarehouse || ''
        }
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load putback tasks');
      }
      const pendingPutbacks = ((data.requests || []) as CounterPickup[])
        .filter((item) => item.status === 'PendingPutback')
        .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
      setTasks(pendingPutbacks);
    } catch (err: any) {
      alert(err.message || 'Failed to load putback tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [token, activeWarehouse]);

  const handleCompletePutback = async (requestId: string) => {
    if (!token) return;
    setSubmittingId(requestId);
    try {
      const response = await fetch(`/api/counter-pickups/${requestId}/complete-putback`, {
        method: 'POST',
        headers: {
          'x-v2-auth-token': `Bearer ${token}`,
          'x-warehouse-id': activeWarehouse || ''
        }
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to complete putback');
      }
      await loadTasks();
    } catch (err: any) {
      alert(err.message || 'Failed to complete putback');
    } finally {
      setSubmittingId(null);
    }
  };

  const filteredTasks = tasks.filter((item) => {
    const haystack = `${item.id} ${item.sku} ${item.productName} ${item.location}`.toLowerCase();
    return haystack.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">
      <PageHeader
        title="Putback Tasks"
        subtitle={`Warehouse return-to-shelf tasks for ${activeWarehouse || 'selected warehouse'}.`}
        icon={RotateCcw}
        isScrolled={isScrolled}
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div ref={sentinelRef} className="h-px w-full pointer-events-none -mt-8" />
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search request, SKU, product, location..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
              <Clock className="w-10 h-10 text-slate-300 mx-auto mb-4 animate-pulse" />
              <p className="text-slate-500">Loading putback tasks...</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
              <Archive className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900">No putback tasks</h3>
              <p className="text-slate-500">There are no pending warehouse putback requests right now.</p>
            </div>
          ) : (
            filteredTasks.map((item) => (
              <div key={item.id} className="bg-white border border-amber-200 rounded-2xl shadow-sm p-5">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-700 text-xs font-bold uppercase">
                        Pending Putback
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold uppercase">
                        {item.id}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-400">SKU</p>
                        <p className="text-sm font-bold text-slate-900 mt-1">{item.sku}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-400">Product</p>
                        <p className="text-sm font-semibold text-slate-900 mt-1">{item.productName}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-400">Qty</p>
                        <p className="text-sm font-semibold text-slate-900 mt-1">{item.qty}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-400">Location</p>
                        <p className="text-sm font-semibold text-slate-900 mt-1 inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {item.location}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-400">Warehouse</p>
                        <p className="text-sm font-semibold text-slate-900 mt-1">{item.warehouseId}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-400">Created By</p>
                        <p className="text-sm font-semibold text-slate-900 mt-1">{item.createdBy}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-400">Created At</p>
                        <p className="text-sm font-semibold text-slate-900 mt-1">{formatDate(item.createdAt, 'PPp')}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-400">Updated At</p>
                        <p className="text-sm font-semibold text-slate-900 mt-1">{formatDate(item.updatedAt, 'PPp')}</p>
                      </div>
                    </div>

                    {(item.otherNotes || item.referenceNo) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-amber-50 border border-amber-100 rounded-2xl p-4">
                        <div>
                          <p className="text-xs uppercase tracking-wider text-slate-400">Reference</p>
                          <p className="text-sm font-semibold text-slate-900 mt-1">{item.referenceNo || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wider text-slate-400">Notes</p>
                          <p className="text-sm font-semibold text-slate-900 mt-1">{item.otherNotes || '-'}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="lg:min-w-[220px]">
                    <button
                      onClick={() => handleCompletePutback(item.id)}
                      disabled={submittingId === item.id}
                      className={cn(
                        "w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all",
                        "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                      )}
                    >
                      {submittingId === item.id ? (
                        <Clock className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      Confirm Putback Completed
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}

          {!loading && filteredTasks.length > 0 && (
            <div className="text-xs text-slate-400 font-medium text-right">
              Showing {filteredTasks.length} pending putback tasks
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
