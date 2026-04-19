import { useState } from 'react'
import { LayoutDashboard, Clock, Puzzle, Menu, X, Activity as ActivityIcon, Wand2, Zap, Bot } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Crons from './pages/Crons'
import Plugins from './pages/Plugins'
import Activity from './pages/Activity'
import Skills from './pages/Skills'
import Agents from './pages/Agents'

const PAGES = [
  { id: 'dashboard', label: 'Dashboard',  icon: LayoutDashboard },
  { id: 'activity',  label: 'Activity',   icon: ActivityIcon },
  { id: 'agents',    label: 'Agents',     icon: Bot },
  { id: 'crons',     label: 'Scheduled',  icon: Clock },
  { id: 'plugins',   label: 'Plugins',    icon: Puzzle },
  { id: 'skills',    label: 'Skills',     icon: Wand2 },
]

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [open, setOpen] = useState(false)
  const isMobile = window.innerWidth < 768

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          zIndex: 99, backdropFilter: 'blur(4px)',
        }} />
      )}

      {/* Sidebar */}
      <nav style={{
        width: 220, flexShrink: 0,
        background: 'var(--bg2)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        zIndex: 100,
        position: isMobile ? 'fixed' : 'relative',
        left: 0, top: 0, height: '100%',
        transform: isMobile ? (open ? 'translateX(0)' : 'translateX(-100%)') : 'none',
        transition: 'transform 0.2s ease',
      }}>
        <div style={{
          padding: '20px 20px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 10,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
            background: 'linear-gradient(135deg, var(--accent), var(--purple))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={14} color="white" fill="white" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2 }}>Mission Control</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Claude Agent Hub</div>
          </div>
        </div>

        <div style={{ flex: 1, padding: '0 10px' }}>
          {PAGES.map(p => {
            const active = page === p.id
            return (
              <button key={p.id} onClick={() => { setPage(p.id); setOpen(false) }} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 10px', borderRadius: 8, border: 'none', width: '100%',
                background: active ? 'rgba(217,119,87,0.12)' : 'transparent',
                color: active ? 'var(--accent2)' : 'var(--text2)',
                fontSize: 13, fontWeight: active ? 500 : 400,
                textAlign: 'left', cursor: 'pointer', marginBottom: 2,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <p.icon size={15} style={{ opacity: active ? 1 : 0.65 }} />
                {p.label}
                {active && (
                  <div style={{
                    marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--green)', boxShadow: '0 0 6px var(--green)',
                  }} />
                )}
              </button>
            )
          })}
        </div>

        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 7,
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--green)', boxShadow: '0 0 6px var(--green)',
          }} />
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>Biff · sonnet-4-6</span>
        </div>
      </nav>

      {isMobile && (
        <button onClick={() => setOpen(!open)} style={{
          position: 'fixed', top: 12, left: 12, zIndex: 101,
          width: 40, height: 40, border: '1px solid var(--border)',
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)',
          borderRadius: 8, color: 'var(--text)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      )}

      <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', maxWidth: '100%', background: 'var(--bg)' }}>
        {page === 'dashboard' && <Dashboard />}
        {page === 'activity'  && <Activity />}
        {page === 'crons'     && <Crons />}
        {page === 'agents'    && <Agents />}
        {page === 'plugins'   && <Plugins />}
        {page === 'skills'    && <Skills />}
      </main>
    </div>
  )
}
