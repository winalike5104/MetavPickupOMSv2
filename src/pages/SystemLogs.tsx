import React, { useState, useEffect, useRef } from 'react';
import { Terminal, RefreshCw, Trash2, ChevronDown, ChevronUp, Search, AlertCircle } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';

export default function SystemLogs() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filter, setFilter] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/logs', {
        headers: {
          'x-custom-auth-token': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setLogs(data.logs);
        setError('');
      } else {
        setError(data.error || 'Failed to fetch logs');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear all system logs?')) return;
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/admin/logs/clear', {
        method: 'POST',
        headers: {
          'x-custom-auth-token': `Bearer ${token}`
        }
      });
      setLogs('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    let interval: any;
    if (autoRefresh) {
      interval = setInterval(fetchLogs, 3000);
    }
    return () => clearInterval(interval);
  }, [autoRefresh]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const filteredLogs = logs
    .split('\n')
    .filter(line => line.toLowerCase().includes(filter.toLowerCase()))
    .join('\n');

  const isAdmin = profile?.roleTemplate === 'Admin' || profile?.allowedWarehouses?.includes('*');

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900">Access Denied</h2>
        <p className="text-slate-500">Only super administrators can view system logs.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* 🚀 Fixed Header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 shadow-sm px-4 md:px-8 py-6 z-20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Terminal className="w-6 h-6 text-indigo-600" />
              System Logs
            </h1>
            <p className="text-slate-500 text-sm">Real-time backend activity and header debugging</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium cursor-pointer hover:bg-slate-50 transition-all">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Auto-refresh (3s)
            </label>
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50"
              title="Refresh now"
            >
              <RefreshCw className={`w-5 h-5 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={clearLogs}
              className="p-2.5 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 transition-all text-red-600"
              title="Clear logs"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* 🚀 Scrollable Content */}
      <div className="flex-1 overflow-hidden p-4 md:p-8">
        <div className="bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-800 flex flex-col h-full">
          <div className="p-4 bg-slate-800 border-b border-slate-700 flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter logs..."
              className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-300 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Live Stream</span>
          </div>
        </div>
        
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 font-mono text-xs leading-relaxed scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
        >
          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          
          {filteredLogs ? (
            <pre className="text-slate-300 whitespace-pre-wrap break-all">
              {filteredLogs.split('\n').map((line, i) => {
                let color = 'text-slate-400';
                if (line.includes('[ERROR]')) color = 'text-red-400 font-bold';
                if (line.includes('[WARN]')) color = 'text-amber-400';
                if (line.includes('[DEBUG]')) color = 'text-indigo-400';
                if (line.includes('[INFO]')) color = 'text-emerald-400';
                
                return (
                  <div key={i} className={`${color} mb-1 hover:bg-white/5 transition-colors p-1 rounded`}>
                    {line}
                  </div>
                );
              })}
            </pre>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2">
              <Terminal className="w-12 h-12 opacity-20" />
              <p>No log entries to display</p>
            </div>
          )}
        </div>
        
        <div className="p-3 bg-slate-800 border-t border-slate-700 flex justify-between items-center px-6">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
            {filteredLogs.split('\n').length} Lines Displayed
          </span>
          <div className="flex gap-4">
             <button onClick={() => scrollRef.current?.scrollTo({top: 0, behavior: 'smooth'})} className="text-slate-500 hover:text-white transition-colors">
               <ChevronUp className="w-4 h-4" />
             </button>
             <button onClick={() => scrollRef.current?.scrollTo({top: scrollRef.current.scrollHeight, behavior: 'smooth'})} className="text-slate-500 hover:text-white transition-colors">
               <ChevronDown className="w-4 h-4" />
             </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
