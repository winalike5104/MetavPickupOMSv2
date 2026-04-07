import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, getDocs, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/AuthProvider';
import { OperationLog } from '../types';
import { logAction, isAdmin, isSystemAdmin, formatDate, cn } from '../utils';
import { 
  FileText, 
  Search, 
  User, 
  Clock, 
  Activity, 
  Filter, 
  ArrowUpDown, 
  Calendar, 
  ShieldAlert, 
  Terminal, 
  RefreshCw, 
  ChevronLeft,
  Database
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '../components/PageHeader';

export default function SKULogs() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [actionFilter, setActionFilter] = useState('All');
  
  const canView = isAdmin(profile, profile?.email) || isSystemAdmin(profile?.email);
  const [isScrolled, setIsScrolled] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (canView) {
      fetchLogs();
    } else {
      setLoading(false);
    }
  }, [sortOrder, canView]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      // Filter for SKU related actions
      const skuActions = [
        'Data Health Fix',
        'Add SKU',
        'Edit SKU',
        'Delete SKU',
        'Bulk Delete SKU',
        'Clear Database',
        'Upload SKU'
      ];
      
      const q = query(
        collection(db, 'logs'), 
        where('category', '==', 'SKU'),
        orderBy('timestamp', sortOrder), 
        limit(200)
      );
      
      const snap = await getDocs(q);
      setLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as OperationLog)));
    } catch (err) {
      console.error("Error fetching SKU logs:", err);
      // Fallback: fetch all and filter in memory if category field is missing in old logs
      try {
        const qFallback = query(collection(db, 'logs'), orderBy('timestamp', sortOrder), limit(500));
        const snapFallback = await getDocs(qFallback);
        const skuActions = [
          'Data Health Fix',
          'Add SKU',
          'Edit SKU',
          'Delete SKU',
          'Bulk Delete SKU',
          'Clear Database',
          'Upload SKU'
        ];
        setLogs(snapFallback.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as OperationLog))
          .filter(log => log.category === 'SKU' || skuActions.includes(log.action))
        );
      } catch (fallbackErr) {
        console.error("Fallback fetch failed:", fallbackErr);
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch = 
        (log.userName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.action || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.details || "").toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesAction = actionFilter === 'All' || log.action === actionFilter;
      
      const logDate = new Date(log.timestamp).toISOString().split('T')[0];
      const matchesStart = !dateFilter.start || logDate >= dateFilter.start;
      const matchesEnd = !dateFilter.end || logDate <= dateFilter.end;

      return matchesSearch && matchesAction && matchesStart && matchesEnd;
    });
  }, [logs, searchTerm, actionFilter, dateFilter]);

  const actionTypes = ['All', ...new Set(logs.map(l => l.action))];

  if (!canView && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <ShieldAlert className="w-16 h-16 mb-4 opacity-20" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
        <p>You do not have permission to view SKU logs.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 overflow-hidden">
      <PageHeader
        title="SKU Database Change Logs"
        subtitle="Audit trail of SKU additions, edits, and deletions"
        icon={Database}
        isScrolled={isScrolled}
        backButton={
          <button 
            onClick={() => navigate('/skus')}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        }
        actions={
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50"
            title="Refresh logs"
          >
            <RefreshCw className={cn("w-5 h-5 text-slate-600", loading ? 'animate-spin' : '')} />
          </button>
        }
      />

      {/* 🚀 Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
        <div ref={sentinelRef} className="h-px w-full pointer-events-none -mt-8" />
        
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="Search logs by user, action, or details..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                <Activity className="w-3 h-3" /> Action Type
              </label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              >
                {actionTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3" /> Sort Order
              </label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              >
                <option value="desc">Newest First</option>
                <option value="asc">Oldest First</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Start Date
              </label>
              <input
                type="date"
                value={dateFilter.start}
                onChange={(e) => setDateFilter({ ...dateFilter, start: e.target.value })}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> End Date
              </label>
              <input
                type="date"
                value={dateFilter.end}
                onChange={(e) => setDateFilter({ ...dateFilter, end: e.target.value })}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Action</th>
                  <th className="px-6 py-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  [1,2,3,4,5].map(i => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={4} className="px-6 py-4"><div className="h-12 bg-slate-50 rounded-lg"></div></td>
                    </tr>
                  ))
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">No SKU logs found.</td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-slate-500 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          {formatDate(log.timestamp, 'MMM d, HH:mm:ss')}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-indigo-600" />
                          <span className="font-semibold text-slate-900">{log.userName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Activity className="w-4 h-4 text-slate-400" />
                          <span className="text-sm font-medium px-2 py-1 bg-slate-100 rounded text-slate-700">
                            {log.action}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {log.details}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
