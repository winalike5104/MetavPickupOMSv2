import React from 'react';
import { WAREHOUSE_NAMES } from '../constants';

interface WarehouseSelectorProps {
  allowedWarehouses: string[];
  onSelect: (warehouseId: string) => void;
}

export const WarehouseSelector: React.FC<WarehouseSelectorProps> = ({ allowedWarehouses, onSelect }) => {
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl animate-in zoom-in duration-300">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-7h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Select Warehouse</h2>
          <p className="text-slate-500 mt-2">Please select the warehouse you are currently working at.</p>
        </div>

        <div className="grid gap-4">
          {allowedWarehouses.map((id) => (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className="group flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-all text-left"
            >
              <div>
                <span className="block font-bold text-slate-900 group-hover:text-indigo-700">{WAREHOUSE_NAMES[id] || id}</span>
                <span className="text-sm text-slate-500">{id}</span>
              </div>
              <svg className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
