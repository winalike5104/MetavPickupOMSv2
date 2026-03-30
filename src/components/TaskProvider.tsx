import React, { createContext, useContext, useState, useCallback } from 'react';
import { Loader2, CheckCircle, XCircle, Plus } from 'lucide-react';
import { cn } from '../utils';

interface EmailProgress {
  total: number;
  current: number;
  success: number;
  failed: number;
  skipped: number;
  errors: { id: string; booking: string; error: string }[];
  isComplete: boolean;
}

interface TaskContextType {
  emailProgress: EmailProgress | null;
  setEmailProgress: React.Dispatch<React.SetStateAction<EmailProgress | null>>;
  isMinimized: boolean;
  setIsMinimized: (minimized: boolean) => void;
  isTaskRunning: boolean;
  setIsTaskRunning: (running: boolean) => void;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const TaskProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [emailProgress, setEmailProgress] = useState<EmailProgress | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isTaskRunning, setIsTaskRunning] = useState(false);

  return (
    <TaskContext.Provider value={{ 
      emailProgress, 
      setEmailProgress, 
      isMinimized, 
      setIsMinimized,
      isTaskRunning,
      setIsTaskRunning
    }}>
      {children}
      
      {/* Global Task Card */}
      {emailProgress && (
        <div className={cn(
          "fixed bottom-4 right-4 z-[100] bg-white rounded-2xl shadow-2xl border border-slate-200 transition-all duration-300 overflow-hidden",
          isMinimized ? "w-64" : "w-80 md:w-96"
        )}>
          {/* Header */}
          <div className="bg-slate-900 px-4 py-3 flex items-center justify-between text-white">
            <div className="flex items-center gap-2">
              {!emailProgress.isComplete ? (
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              ) : (
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              )}
              <span className="text-sm font-bold">
                {emailProgress.isComplete ? 'Emails Sent' : 'Sending Emails...'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1 hover:bg-white/10 rounded transition-colors"
              >
                {isMinimized ? (
                  <Plus className="w-4 h-4" />
                ) : (
                  <div className="w-4 h-0.5 bg-white rounded-full" />
                )}
              </button>
              {emailProgress.isComplete && (
                <button 
                  onClick={() => {
                    setEmailProgress(null);
                    setIsMinimized(false);
                    setIsTaskRunning(false);
                  }}
                  className="p-1 hover:bg-white/10 rounded transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          {!isMinimized && (
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-500">Progress</span>
                  <span className="text-slate-900">{emailProgress.current} / {emailProgress.total}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className={cn(
                      "h-full transition-all duration-500",
                      emailProgress.isComplete ? "bg-emerald-500" : "bg-indigo-600"
                    )}
                    style={{ width: `${(emailProgress.current / emailProgress.total) * 100}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="bg-emerald-50 p-2 rounded-xl border border-emerald-100">
                  <p className="text-[9px] font-bold text-emerald-600 uppercase mb-0.5">Success</p>
                  <p className="text-lg font-bold text-emerald-700">{emailProgress.success}</p>
                </div>
                <div className="bg-amber-50 p-2 rounded-xl border border-amber-100">
                  <p className="text-[9px] font-bold text-amber-600 uppercase mb-0.5">Skipped</p>
                  <p className="text-lg font-bold text-amber-700">{emailProgress.skipped}</p>
                </div>
                <div className="bg-red-50 p-2 rounded-xl border border-red-100">
                  <p className="text-[9px] font-bold text-red-600 uppercase mb-0.5">Failed</p>
                  <p className="text-lg font-bold text-red-700">{emailProgress.failed}</p>
                </div>
              </div>

              {emailProgress.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Error Details</p>
                  {emailProgress.errors.map((err, idx) => (
                    <div key={idx} className="text-[10px] bg-red-50 text-red-600 p-2 rounded border border-red-100">
                      <span className="font-bold">{err.booking}:</span> {err.error}
                    </div>
                  ))}
                </div>
              )}

              {emailProgress.isComplete && (
                <div className="pt-2">
                  <button
                    onClick={() => {
                      setEmailProgress(null);
                      setIsMinimized(false);
                      setIsTaskRunning(false);
                    }}
                    className="w-full py-2 bg-slate-900 text-white text-sm font-bold rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Minimized Progress Bar */}
          {isMinimized && (
            <div className="h-1 w-full bg-slate-100">
              <div 
                className={cn(
                  "h-full transition-all duration-500",
                  emailProgress.isComplete ? "bg-emerald-500" : "bg-indigo-600"
                )}
                style={{ width: `${(emailProgress.current / emailProgress.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}
    </TaskContext.Provider>
  );
};

export const useTask = () => {
  const context = useContext(TaskContext);
  if (context === undefined) {
    throw new Error('useTask must be used within a TaskProvider');
  }
  return context;
};
