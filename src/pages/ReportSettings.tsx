import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../components/AuthProvider';
import { 
  Mail, 
  Save, 
  CheckCircle2, 
  AlertCircle,
  Play,
  Settings as SettingsIcon,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import { isSystemAdmin, isAdmin } from '../utils';
import { PageHeader } from '../components/PageHeader';

export const ReportSettings = () => {
  const { profile, user, loading: authLoading } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Report Config State
  const [reportConfig, setReportConfig] = useState({
    enabled: false,
    toEmails: '',
    ccEmails: '',
    senderName: 'Acapickup WMS'
  });
  const [reportLoading, setReportLoading] = useState(false);
  const [testingReport, setTestingReport] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [testError, setTestError] = useState('');

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

  // Fetch Report Config
  useEffect(() => {
    if (isAdmin(profile, profile?.email)) {
      fetchReportConfig();
    }
  }, [profile?.email, profile?.roleTemplate]);

  const fetchReportConfig = async () => {
    try {
      setReportLoading(true);
      const token = localStorage.getItem('x-v2-auth-token');
      const response = await fetch('/api/admin/report-config', {
        headers: {
          'x-v2-auth-token': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setReportConfig(data.config);
        }
      }
    } catch (err) {
      console.error("Failed to fetch report config:", err);
    } finally {
      setReportLoading(false);
    }
  };

  const handleSaveReportConfig = async () => {
    try {
      setSubmitting(true);
      setError('');
      const token = localStorage.getItem('x-v2-auth-token');
      const response = await fetch('/api/admin/report-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-v2-auth-token': `Bearer ${token}`
        },
        body: JSON.stringify(reportConfig)
      });
      if (response.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        const data = await response.json();
        throw new Error(data.error || "Failed to save report config");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTestReport = async () => {
    try {
      setTestingReport(true);
      setTestError('');
      setTestSuccess(false);
      
      const token = localStorage.getItem('x-v2-auth-token');
      const response = await fetch('/api/admin/test-report', {
        headers: {
          'x-v2-auth-token': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setTestSuccess(true);
        setTimeout(() => setTestSuccess(false), 5000);
      } else {
        setTestError(data.error || "Failed to send test report");
      }
    } catch (err: any) {
      setTestError(err.message);
    } finally {
      setTestingReport(false);
    }
  };

  if (authLoading || reportLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!isAdmin(profile, profile?.email)) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900">Access Denied</h2>
        <p className="text-slate-500">You do not have permission to access report settings.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 overflow-hidden">
      <PageHeader
        title="Report Settings"
        subtitle="Configure daily business summary reports and automated backups."
        icon={Mail}
        isScrolled={isScrolled}
        actions={
          <div className="flex items-center gap-3">
            {(success || testSuccess) && (
              <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm animate-bounce">
                <CheckCircle2 className="w-5 h-5" /> {testSuccess ? 'Test Sent!' : 'Saved!'}
              </div>
            )}
            <button
              onClick={handleTestReport}
              disabled={testingReport}
              className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-600 px-4 py-2.5 rounded-xl font-bold transition-all hover:bg-indigo-100 disabled:opacity-50"
            >
              <Play className="w-5 h-5" />
              {testingReport ? 'Sending...' : 'Test Now'}
            </button>
            <button 
              onClick={handleSaveReportConfig}
              disabled={submitting}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              {submitting ? 'Saving...' : 'Save Config'}
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div ref={sentinelRef} className="h-px w-full pointer-events-none -mt-8" />
        <div className="max-w-4xl mx-auto space-y-8">
          {(error || testError) && (
            <div className="flex items-center gap-2 text-red-600 font-bold text-sm bg-red-50 p-4 rounded-xl border border-red-100">
              <AlertCircle className="w-5 h-5" /> {testError || error}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-50">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <SettingsIcon className="w-5 h-5 text-indigo-600" />
                Automation Configuration
              </h3>
            </div>
            <div className="p-6 space-y-8">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div>
                  <p className="font-bold text-slate-900">Enable Daily Summary Report</p>
                  <p className="text-sm text-slate-500">Automatically aggregate business data and send at 23:30 (Auckland Time).</p>
                </div>
                <button 
                  onClick={() => setReportConfig({...reportConfig, enabled: !reportConfig.enabled})}
                  className={`w-14 h-7 rounded-full transition-colors relative ${reportConfig.enabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${reportConfig.enabled ? 'left-8' : 'left-1'}`} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Sender Display Name</label>
                  <input
                    type="text"
                    value={reportConfig.senderName}
                    onChange={(e) => setReportConfig({...reportConfig, senderName: e.target.value})}
                    placeholder="e.g. Acapickup WMS"
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all"
                  />
                  <p className="text-[10px] text-slate-400 italic">This name will appear in the "From" field of the email.</p>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Recipient Emails</label>
                  <input
                    type="text"
                    value={reportConfig.toEmails}
                    onChange={(e) => setReportConfig({...reportConfig, toEmails: e.target.value})}
                    placeholder="admin@example.com, boss@example.com"
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all"
                  />
                  <p className="text-[10px] text-slate-400 italic">Separate multiple emails with commas.</p>
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">CC Emails (Optional)</label>
                  <input
                    type="text"
                    value={reportConfig.ccEmails}
                    onChange={(e) => setReportConfig({...reportConfig, ccEmails: e.target.value})}
                    placeholder="manager@example.com"
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl flex gap-4">
            <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-amber-900 mb-1">About Daily Reports</h4>
              <p className="text-sm text-amber-800 leading-relaxed">
                The report includes <strong>New Pickups</strong>, <strong>Confirmed Pickups</strong>, and <strong>14-Day Overdue</strong> orders. 
                A detailed CSV backup is attached to every email. Ensure your Resend API Key is correctly configured in the system secrets.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
