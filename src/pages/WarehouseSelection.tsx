import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { Package, ChevronRight } from 'lucide-react';
import { WAREHOUSE_NAMES } from '../constants';

export const WarehouseSelection = () => {
  const { user, profile, activeWarehouse, setActiveWarehouse, logout, loading } = useAuth();
  const navigate = useNavigate();

  const allowedWarehouses = profile?.allowedWarehouses || [];
  const isSuper = allowedWarehouses.includes('*');
  const displayWarehouses = isSuper ? Object.keys(WAREHOUSE_NAMES) : allowedWarehouses;

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
      return;
    }

    if (activeWarehouse) {
      navigate('/');
      return;
    }

    // Auto-select if only one warehouse is allowed (and not super admin)
    if (!isSuper && displayWarehouses.length === 1) {
      setActiveWarehouse(displayWarehouses[0]);
      navigate('/');
    }
  }, [user, profile, activeWarehouse, navigate, setActiveWarehouse, loading, isSuper, displayWarehouses]);

  const handleSelect = (id: string) => {
    setActiveWarehouse(id);
    navigate('/');
  };

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8 border border-slate-200">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-100 rounded-lg mb-4 flex items-center justify-center mx-auto">
            <Package className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Select Warehouse</h2>
          <p className="text-slate-500 mt-2">Please select the warehouse for this session.</p>
          {isSuper && <p className="text-xs text-indigo-600 font-bold mt-1 uppercase tracking-wider">Super Admin Mode</p>}
        </div>
        
        <div className="grid gap-4">
          {displayWarehouses.map((id) => (
            <button
              key={id}
              onClick={() => handleSelect(id)}
              className="group flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-all text-left"
            >
              <div>
                <span className="block font-bold text-slate-900 group-hover:text-indigo-700">
                  {WAREHOUSE_NAMES[id] || id}
                </span>
                <span className="text-sm text-slate-500">{id}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 transition-colors" />
            </button>
          ))}
        </div>
        
        <button 
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className="w-full mt-8 text-slate-400 hover:text-slate-600 text-sm font-medium"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
};
