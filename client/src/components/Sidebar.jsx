import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Grid3X3,
  Users,
  Receipt,
  SlidersHorizontal,
  BellRing,
  Sparkles,
  MessageCircle,
  UserCheck,
  CreditCard,
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, isOpen, onClose }) {
  const { isStudent, isAdmin } = useAuth();

  const adminNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'seats', label: 'Seat Matrix', icon: Grid3X3 },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'fees', label: 'Fee Ledger', icon: Receipt },
    { id: 'fee-settings', label: 'Slot Fee Settings', icon: SlidersHorizontal },
    { id: 'payment-settings', label: 'Razorpay Payouts', icon: CreditCard },
    { id: 'reminders', label: 'Automated Reminders', icon: BellRing },
    { id: 'ai', label: 'AI Late Fee Predictor', icon: Sparkles, badge: 'AI' },
    { id: 'copilot', label: 'Copilot Chat', icon: MessageCircle, badge: 'AI' },
  ];

  const studentNavItems = [
    { id: 'portal', label: 'My Seat & Fee Portal', icon: UserCheck },
  ];

  const items = isStudent
    ? studentNavItems
    : adminNavItems.filter((item) => (
      !['fee-settings', 'payment-settings'].includes(item.id) || isAdmin
    ));

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation menu"
        tabIndex={isOpen ? 0 : -1}
        onClick={onClose}
        className={`fixed inset-0 top-[65px] z-40 bg-slate-950/40 transition-opacity md:hidden ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        id="primary-navigation"
        aria-label="Primary navigation"
        className={`fixed left-0 top-[65px] bottom-0 z-40 flex w-72 max-w-[85vw] flex-col justify-between border-r border-slate-200 bg-white p-4 pb-6 shadow-xl transition-transform duration-200 md:sticky md:top-[65px] md:z-auto md:min-h-[calc(100vh-65px)] md:w-64 md:max-w-none md:translate-x-0 md:shadow-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="space-y-1.5 overflow-y-auto">
          <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Navigation</p>
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl font-medium text-sm transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      isActive ? 'bg-indigo-500 text-white' : 'bg-indigo-100 text-indigo-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-500">
          <p className="font-semibold text-slate-700">SeatLedger Multi-Tenant</p>
          <p className="mt-0.5 text-[11px]">Library Management</p>
        </div>
      </aside>
    </>
  );
}
