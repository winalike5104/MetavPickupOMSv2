import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const ReloadPrompt = () => {
  const sw = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ', r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  if (!sw) return null;

  const offlineReadyState = sw.offlineReady || [false, () => {}];
  const needUpdateState = sw.needUpdate || [false, () => {}];
  const updateServiceWorker = sw.updateServiceWorker || (() => Promise.resolve());

  const [offlineReady, setOfflineReady] = offlineReadyState;
  const [needUpdate, setNeedUpdate] = needUpdateState;

  const close = () => {
    if (typeof setOfflineReady === 'function') setOfflineReady(false);
    if (typeof setNeedUpdate === 'function') setNeedUpdate(false);
  };

  return (
    <AnimatePresence>
      {(offlineReady || needUpdate) && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          className="fixed bottom-6 right-6 z-[9999] max-w-sm w-full"
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-indigo-100 p-5 flex items-start gap-4 overflow-hidden relative group">
            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600"></div>
            
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <RefreshCw className={`w-5 h-5 ${needUpdate ? 'animate-spin-slow' : ''}`} />
            </div>

            <div className="flex-1">
              <h4 className="text-sm font-bold text-slate-900 mb-1">
                {needUpdate ? 'System Update Available' : 'Ready to work offline'}
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                {needUpdate 
                  ? 'New features have been deployed. Please refresh to update.' 
                  : 'The app is now cached and ready for offline use.'}
              </p>
              
              <div className="mt-4 flex items-center gap-3">
                {needUpdate && (
                  <button
                    onClick={() => updateServiceWorker(true)}
                    className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                  >
                    Refresh Now
                  </button>
                )}
                <button
                  onClick={close}
                  className="px-4 py-2 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Later
                </button>
              </div>
            </div>

            <button 
              onClick={close}
              className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
