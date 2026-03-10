import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { 
  Upload, BarChart3, Network, Shield, 
  AlertTriangle, Activity, Menu, X, Zap
} from 'lucide-react'
import UploadPage from './pages/UploadPage'
import DashboardPage from './pages/DashboardPage'
import NetworkPage from './pages/NetworkPage'
import BotDetectionPage from './pages/BotDetectionPage'

const NAV_ITEMS = [
  { to: '/', icon: Upload, label: 'Upload' },
  { to: '/dashboard', icon: BarChart3, label: 'Analytics' },
  { to: '/network', icon: Network, label: 'Network' },
  { to: '/bots', icon: Shield, label: 'Bot Detection' },
]

function Sidebar({ open, onClose }) {
  return (
    <>
      {/* Overlay */}
      {open && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onClose}
        />
      )}
      
      <aside className={`
        fixed left-0 top-0 h-full w-64 z-30 flex flex-col
        transition-transform duration-300 ease-in-out
        lg:translate-x-0 lg:static lg:z-auto
        ${open ? 'translate-x-0' : '-translate-x-full'}
      `} style={{ background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)' }}>
        
        {/* Logo */}
        <div className="p-6 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)' }}>
              <AlertTriangle size={16} color="white" />
            </div>
            <div>
              <div className="font-bold text-sm gradient-text">MisInfo</div>
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Propagation Analyzer</div>
            </div>
          </div>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium
                transition-all duration-200 group
                ${isActive 
                  ? 'text-white' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                }
              `}
              style={({ isActive }) => isActive ? {
                background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(236,72,153,0.1))',
                border: '1px solid rgba(124,58,237,0.3)'
              } : {}}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        
        {/* Footer */}
        <div className="p-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <Activity size={12} />
            <span>ML Pipeline Active</span>
            <div className="ml-auto w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          </div>
        </div>
      </aside>
    </>
  )
}

function TopBar({ onMenuClick }) {
  const location = useLocation()
  
  const titles = {
    '/': 'Dataset Upload',
    '/dashboard': 'Analytics Dashboard',
    '/network': 'Propagation Network',
    '/bots': 'Bot Detection'
  }
  
  return (
    <header className="h-16 flex items-center gap-4 px-6 border-b"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
      <button 
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg hover:bg-white/5"
      >
        <Menu size={20} />
      </button>
      
      <h1 className="text-lg font-semibold">
        {titles[location.pathname] || 'Misinformation Analyzer'}
      </h1>
      
      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
             style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)', color: '#7c3aed' }}>
          <Zap size={12} />
          <span>AI-Powered</span>
        </div>
      </div>
    </header>
  )
}

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        
        <main className="flex-1 overflow-auto p-6" style={{ background: 'var(--color-bg)' }}>
          <Routes>
            <Route path="/" element={<UploadPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/network" element={<NetworkPage />} />
            <Route path="/bots" element={<BotDetectionPage />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  )
}
