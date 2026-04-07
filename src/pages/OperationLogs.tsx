import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { collection, query, getDocs, orderBy, limit, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/AuthProvider';
import { OperationLog } from '../types';
import { logAction, hasPermission, isAdmin, isSystemAdmin, formatDate, cn } from '../utils';
import { FileText, Search, User, Clock, Activity, Filter, ArrowUpDown, Calendar, ShieldAlert, Terminal, RefreshCw, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

export default function OperationLogs() {
  const { profile, user } = useAuth();
  const location = useLocation();
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [actionFilter, setActionFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const cat = params.get('category');
    if (cat) setCategoryFilter(cat);
    const action = params.get('action');
    if (action) setActionFilter(action);
  }, [location.search]);
  
  const canView = isAdmin(profile, profile?.email) || isSystemAdmin(profile?.email);
  const isSysAdmin = isSystemAdmin(profile?.email);
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
      const q = query(collection(db, 'logs'), orderBy('timestamp', sortOrder), limit(200));
      const snap = await getDocs(q);
      setLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as OperationLog)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = async () => {
    if (!isSysAdmin) return;
    if (!window.confirm('Are you sure you want to clear all operation logs? This will delete all log documents from Firestore.')) return;
    
    setClearing(true);
    try {
      const q = query(collection(db, 'logs'), limit(500));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        alert('No logs to clear.');
        return;
      }

      const batch = writeBatch(db);
      snap.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      await logAction(profile!, 'Clear Logs', 'System Admin cleared operation logs', null, 'System');
      fetchLogs();
      alert('Successfully cleared up to 500 logs.');
    } catch (err) {
      console.error(err);
      alert('Failed to clear logs.');
    } finally {
      setClearing(false);
    }
  };

  const filteredLogs = useMemo(() => {
    try {
      return logs.filter(log => {
        const matchesSearch = 
          (log.userName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (log.action || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (log.details || "").toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesAction = actionFilter === 'All' || log.action === actionFilter;
        const matchesCategory = categoryFilter === 'All' || 
                               log.category === categoryFilter || 
                               (!log.category && categoryFilter === 'System');
        
        const logDate = new Date(log.timestamp).toISOString().split('T')[0];
        const matchesStart = !dateFilter.start || logDate >= dateFilter.start;
        const matchesEnd = !dateFilter.end || logDate <= dateFilter.end;

        return matchesSearch && matchesAction && matchesCategory && matchesStart && matchesEnd;
      });
    } catch (error) {
      console.error("Error filtering logs:", error);
      return [];
    }
  }, [logs, searchTerm, actionFilter, categoryFilter, dateFilter]);

  const actionTypes = useMemo(() => {
    const filteredByCat = logs.filter(log => 
      categoryFilter === 'All' || 
      (log.category === categoryFilter) || 
      (!log.category && categoryFilter === 'System')
    );
    return ['All', ...new Set(filteredByCat.map(l => l.action))];
  }, [logs, categoryFilter]);

  const categories = ['All', 'Audit', 'Picking', 'System', 'Order', 'User', 'SKU', 'Store', 'Payment'];

  useEffect(() => {
    setActionFilter('All');
  }, [categoryFilter]);

  if (!canView && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <ShieldAlert className="w-16 h-16 mb-4 opacity-20" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
        <p>You do not have permission to view operation logs.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 overflow-hidden">
      {/* 🚀 Collapsible Header */}
      <div className={cn(
        "flex-shrink-0 bg-white/80 backdrop-blur-md border-b border-slate-200 z-30 transition-all duration-300 ease-in-out group",
        isScrolled ? "py-3 shadow-md" : "py-6 shadow-sm",
        "hover:py-6 hover:shadow-lg"
      )}>
        <div className="px-4 md:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="transition-all duration-300">
              <h1 className={cn(
                "font-bold text-slate-900 flex items-center gap-2 transition-all duration-300",
                isScrolled ? "text-lg md:text-xl" : "text-2xl",
                "group-hover:text-2xl"
              )}>
                <Terminal className={cn("text-indigo-600 transition-all", isScrolled ? "w-5 h-5" : "w-6 h-6", "group-hover:w-6 group-hover:h-6")} />
                Operation Logs
              </h1>
              <p className={cn(
                "text-slate-500 text-sm transition-all duration-300 overflow-hidden",
                isScrolled ? "max-h-0 opacity-0" : "max-h-10 opacity-100",
                "group-hover:max-h-10 group-hover:opacity-100"
              )}>
                Audit trail of all system activities
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchLogs}
                disabled={loading}
                className={cn(
                  "bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50",
                  isScrolled ? "p-1.5" : "p-2.5",
                  "group-hover:p-2.5"
                )}
                title="Refresh now"
              >
                <RefreshCw className={cn("text-slate-600 transition-all", isScrolled ? "w-4 h-4" : "w-5 h-5", loading ? 'animate-spin' : '', "group-hover:w-5 group-hover:h-5")} />
              </button>
              {isSysAdmin && (
                <button
                  onClick={clearLogs}
                  disabled={clearing}
                  className={cn(
                    "bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 transition-all text-red-600 disabled:opacity-50",
                    isScrolled ? "p-1.5" : "p-2.5",
                    "group-hover:p-2.5"
                  )}
                  title="Clear logs"
                >
                  <Trash2 className={cn("transition-all", isScrolled ? "w-4 h-4" : "w-5 h-5", clearing ? 'animate-pulse' : '', "group-hover:w-5 group-hover:h-5")} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 🚀 Scrollable Content */}
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

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                <Filter className="w-3 h-3" /> Category
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

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
                  <th className="px-6 py-4">Category</th>
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
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">No logs found.</td>
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
                          <Filter className="w-4 h-4 text-slate-400" />
                          <span className={cn(
                            "text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider",
                            log.category === 'Audit' ? "bg-amber-100 text-amber-600" :
                            log.category === 'Picking' ? "bg-blue-100 text-blue-600" :
                            "bg-slate-100 text-slate-600"
                          )}>
                            {log.category || 'System'}
                          </span>
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
