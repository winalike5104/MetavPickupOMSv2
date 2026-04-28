import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, Clock, Users, Mail, LogOut, Warehouse, Home } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { APP_VERSION } from '../constants';
import { hasPermission, isAdmin } from '../utils';

export const CnPortalLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Portal Home', path: '/cn', icon: Home, visible: true },
    { name: 'Order List', path: '/cn/orders', icon: ClipboardList, visible: hasPermission(profile, 'View Orders', profile?.email) },
    { name: 'Overdue Orders', path: '/cn/overdue', icon: Clock, visible: hasPermission(profile, 'Audit Overdue Orders', profile?.email) || hasPermission(profile, 'View Orders', profile?.email) },
    { name: 'User Management', path: '/cn/users', icon: Users, visible: isAdmin(profile, profile?.email) || hasPermission(profile, 'Manage Users', profile?.email) },
    { name: 'Mail Center', path: '/cn/orders', icon: Mail, visible: hasPermission(profile, 'View Orders', profile?.email) }
  ];

  return (
    <div className="h-screen w-full bg-slate-50 flex flex-col overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between flex-shrink-0 z-30 shadow-sm">
        <Link to="/cn" className="flex items-center gap-2">
          <Warehouse className="w-7 h-7 text-indigo-600" />
          <div className="flex items-end gap-2">
            <span className="text-lg font-bold text-slate-900 tracking-tight">WMS CN Portal</span>
            <span className="text-[10px] font-semibold text-slate-400 mb-0.5">v{APP_VERSION}</span>
          </div>
        </Link>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col items-end">
            <p className="text-sm font-bold text-slate-900">{profile?.name}</p>
            <p className="text-[10px] text-slate-500 font-medium">{profile?.username}</p>
          </div>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </header>

      <div className="flex flex-1 w-full overflow-hidden">
        <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-100 flex-shrink-0">
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {navItems.filter(i => i.visible).map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={[
                    'flex items-center gap-3 px-4 py-2 rounded-xl transition-colors text-sm font-medium',
                    isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                  ].join(' ')}
                >
                  <item.icon className="w-4 h-4" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="flex-1 h-full w-full overflow-hidden flex flex-col min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
};

