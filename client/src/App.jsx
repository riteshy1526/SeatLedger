import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SeatMatrix from './pages/SeatMatrix';
import Students from './pages/Students';
import Fees from './pages/Fees';
import FeeSettings from './pages/FeeSettings';
import PaymentSettings from './pages/PaymentSettings';
import Reminders from './pages/Reminders';
import AIDefaulterPredictor from './pages/AIDefaulterPredictor';
import CopilotChat from './pages/CopilotChat';
import StudentPortal from './pages/StudentPortal';
import PublicExplore from './pages/PublicExplore';

export default function App() {
  const { isAuthenticated, loading, isStudent } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showExplore, setShowExplore] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-black text-xl mx-auto shadow-xl animate-pulse">
            SL
          </div>
          <p className="mt-4 text-xs font-semibold text-slate-400">Loading SeatLedger...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (showExplore) {
      return <PublicExplore onSwitchToLogin={() => setShowExplore(false)} />;
    }
    return <Login onSwitchToExplore={() => setShowExplore(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar
        isSidebarOpen={isSidebarOpen}
        toggleSidebar={() => setIsSidebarOpen((open) => !open)}
      />

      <div className="relative flex-1 flex max-w-7xl w-full mx-auto">
        <Sidebar
          activeTab={isStudent ? 'portal' : activeTab}
          setActiveTab={(tab) => {
            setActiveTab(tab);
            setIsSidebarOpen(false);
          }}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        <main className="min-w-0 w-full flex-1 p-3 sm:p-5 md:p-8 overflow-y-auto">
          {isStudent ? (
            <StudentPortal />
          ) : (
            <>
              {activeTab === 'dashboard' && <Dashboard setActiveTab={setActiveTab} />}
              {activeTab === 'seats' && <SeatMatrix />}
              {activeTab === 'students' && <Students />}
              {activeTab === 'fees' && <Fees setActiveTab={setActiveTab} />}
              {activeTab === 'fee-settings' && <FeeSettings />}
              {activeTab === 'payment-settings' && <PaymentSettings />}
              {activeTab === 'reminders' && <Reminders />}
              {activeTab === 'ai' && <AIDefaulterPredictor />}
              {activeTab === 'copilot' && <CopilotChat />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
