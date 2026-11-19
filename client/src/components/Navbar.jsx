import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Building2, LogOut, MapPin, Menu, X } from 'lucide-react';

export default function Navbar({ isSidebarOpen, toggleSidebar }) {
  const { user, library, logout } = useAuth();

  const roleBadgeColor = {
    superadmin: 'bg-purple-100 text-purple-700 border-purple-200',
    admin: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    staff: 'bg-blue-100 text-blue-700 border-blue-200',
    student: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200 px-3 sm:px-6 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={toggleSidebar}
            className="md:hidden inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
            aria-label={isSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isSidebarOpen}
            aria-controls="primary-navigation"
          >
            {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white font-black text-lg shadow-md shadow-indigo-500/20">
            SL
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-slate-800 text-lg leading-tight tracking-tight">SeatLedger</h1>
              <span className="hidden sm:inline-block text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100">
                MERN SaaS
              </span>
            </div>
            {library && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium truncate">
                <Building2 className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
                <span className="truncate">{library.name}</span>
                <span className="hidden sm:inline-flex items-center gap-0.5 text-slate-400 text-[11px]">
                  <MapPin className="w-3 h-3 text-rose-400" />
                  {library.city}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden sm:block text-right">
            <p className="text-sm font-semibold text-slate-800 leading-snug">{user?.name || 'User'}</p>
            <div className="flex items-center justify-end gap-1.5 mt-0.5">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  roleBadgeColor[user?.role] || roleBadgeColor.admin
                }`}
              >
                {user?.role}
              </span>
            </div>
          </div>

          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg transition-all"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
