import { useState, useEffect, useCallback } from 'react'
import { Activity, Cpu, MessageSquare, RotateCcw, Loader2, CheckCircle, AlertCircle, Zap, TrendingUp, Clock } from 'lucide-react' // Clock used in "This Week" card
import { Badge } from '../components/Card'

interface UsageDay {
  date: string
  inputTokens: number
  outputTokens: number
  cacheRead: number
  cacheCreation: number
  messages: number
  total: number
}

interface Usage {
  today: { inputTokens: number; outputTokens: number; cacheRead: number; cacheCreation: number; messages: number }
  days: UsageDay[]
  totalToday: number
  cacheHitRate: number
  weekTotal: number
  periodTokens: number
  periodRealTokens: number
  resetAt: number
}

interface Status {
  running: boolean
  model: string
  auth: string
  uptime: number | null
}

function useUsage() {
  const [usage, setUsage] = useState<Usage | null>(null)
  useEffect(() => {
    fetch('/api/usage').then(r => r.json()).then(setUsage).catch(() => {})
    const t = setInterval(() => {
      fetch('/api/usage').then(r => r.json()).then(setUsage).catch(() => {})
    }, 60000)
    return () => clearInterval(t)
  }, [])
  return usage
}

function useStatus() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    try { const r = await fetch('/api/status'); setStatus(await r.json()) } catch {}
    setLoading(false)
  }, [])
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [refresh])
  return { status, loading, refresh }
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return Math.round(n / 1_000) + 'K'
  return String(n)
}

function formatUptime(epoch: number) {
  const secs = Math.floor(Date.now() / 1000 - epoch)
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

function formatResetAt(ts: number) {
  const diff = ts - Date.now()
  if (diff <= 0) return 'now'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const timeStr = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (h > 0) return `${timeStr} (${h}h ${m}m)`
  return `${timeStr} (${m}m)`
}

function Sparkline({ data, color = 'var(--accent)' }: { data: number[]; color?: string }) {
  if (data.length < 2) return null
  const w = 400, h = 60
  const max = Math.max(...data, 1)
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - (v / max) * h * 0.88 - 4
    return [x, y] as [number, number]
  })
  const path = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
  const area = path + ` L${w},${h} L0,${h} Z`
  const id = 'spark1'
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 60, overflow: 'visible', display: 'block' }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={3.5} fill={color} />
    </svg>
  )
}

function GaugeRing({ pct, color, size = 72 }: { pct: number; color: string; size?: number }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(pct / 100, 1))
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={7} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
    </svg>
  )
}

function StatCard({ label, value, sub, color, accent }: {
  label: string; value: string; sub?: string; color: string; accent?: string
}) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '18px 20px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${accent || color}, transparent)`,
      }} />
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const { status, loading, refresh } = useStatus()
  const usage = useUsage()
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [acting, setActing] = useState(false)

  const doAction = async (action: string) => {
    if (acting) return
    setActing(true); setActionMsg(null)
    try {
      const r = await fetch('/api/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const d = await r.json()
      setActionMsg({ text: d.message, ok: d.ok })
      setTimeout(() => setActionMsg(null), 6000)
      setTimeout(refresh, 3000)
    } catch (e: unknown) {
      setActionMsg({ text: (e as Error).message, ok: false })
    }
    setActing(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
      <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
    </div>
  )

  const s = status!
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  // Days until next Thursday reset
  const daysUntilThursday = (() => {
    const d = new Date(); const day = d.getDay()
    const diff = (4 - day + 7) % 7 || 7
    return diff
  })()

  // Claude Pro: ~44K real tokens (input+output) per 5h window; overflow uses extra credits
  const WINDOW_LIMIT = 44_000
  const windowPct = usage ? Math.round((usage.periodRealTokens / WINDOW_LIMIT) * 100) : 0
  const windowOverflow = windowPct > 100
  const windowBarPct = Math.min(windowPct, 100)
  const windowColor = windowPct >= 100 ? 'var(--orange)' : windowPct >= 80 ? 'var(--red)' : windowPct >= 60 ? 'var(--yellow)' : 'var(--green)'

  const btnStyle = (color: string, disabled?: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '9px 16px', borderRadius: 9, border: `1px solid ${color}30`,
    background: `${color}12`, color, fontSize: 12, fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    transition: 'all 0.15s',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 960 }} className="fade-in">

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Dashboard</h1>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>System overview · Marco's Claude Hub</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>{dateStr}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 13 }}>
        <StatCard label="Session" accent="var(--accent)"
          value={s.running ? (s.uptime ? formatUptime(s.uptime) : 'Active') : 'Stopped'}
          sub={s.running ? 'Running' : 'Not active'}
          color={s.running ? 'var(--text)' : 'var(--red)'} />
        <StatCard label="Tokens Today" accent="var(--purple)"
          value={usage ? fmt(usage.totalToday) : '—'}
          sub={usage ? `${usage.today.messages} messages` : undefined}
          color="var(--text)" />
        <StatCard label="Week Total" accent="var(--blue)"
          value={usage ? fmt(usage.weekTotal) : '—'}
          sub={usage ? `${Math.round(usage.weekTotal / 7 / 1000)}K avg/day` : undefined}
          color="var(--text)" />
        <StatCard label="Cache Hit Rate" accent="var(--green)"
          value={usage ? `${usage.cacheHitRate}%` : '—'}
          sub="Cache reads / total"
          color={usage && usage.cacheHitRate > 40 ? 'var(--green)' : 'var(--text)'} />
      </div>

      {/* Sparkline + Weekly stats */}
      {usage && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 13 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                <TrendingUp size={13} style={{ color: 'var(--accent)' }} />
                Token Usage · 7 Days
              </div>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>sonnet-4-6</span>
            </div>
            <div style={{ padding: '12px 20px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text3)', marginBottom: 6 }}>
                {usage.days.map(d => <span key={d.date}>{d.date.slice(5)}</span>)}
              </div>
              <Sparkline data={usage.days.map(d => d.total)} />
            </div>
          </div>

          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
            padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            {/* 5h window usage */}
            <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
              <Clock size={13} style={{ color: windowColor }} />
              5h Window
            </div>
            <div style={{ fontSize: 11 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ color: 'var(--text3)' }}>
                  {windowOverflow ? <span style={{ color: 'var(--orange)', fontWeight: 600 }}>OVERFLOW</span> : 'Used'}
                </span>
                <span style={{ fontWeight: 700, color: windowColor }}>{windowPct}%</span>
              </div>
              <div style={{ height: 4, background: 'var(--surface2)', borderRadius: 2, marginBottom: 5 }}>
                <div style={{ height: '100%', width: `${windowBarPct}%`, background: windowColor, borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
              <div style={{ color: 'var(--text3)' }}>
                {fmt(usage.periodRealTokens)} / ~{fmt(WINDOW_LIMIT)} tokens
              </div>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text3)' }}>7-day total</span>
                <span style={{ fontWeight: 600 }}>{fmt(usage.weekTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text3)' }}>Resets</span>
                <span style={{ color: 'var(--purple)', fontWeight: 600 }}>Thu · {daysUntilThursday}d</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status + Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>
            System Status
          </div>
          <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: 'Session', value: s.running ? `Running · ${s.uptime ? formatUptime(s.uptime) : 'active'}` : 'Stopped', icon: Activity, color: s.running ? 'var(--green)' : 'var(--red)' },
              { label: 'Auth', value: s.auth === 'ok' ? 'Claude Pro active' : s.auth === 'error' ? 'Re-auth needed' : 'Unknown', icon: s.auth === 'ok' ? CheckCircle : AlertCircle, color: s.auth === 'ok' ? 'var(--green)' : s.auth === 'error' ? 'var(--red)' : 'var(--text3)' },
              { label: 'Model', value: s.model === 'haiku' ? 'Claude Haiku 4.5' : 'Claude Sonnet 4.6', icon: Cpu, color: 'var(--blue)' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: `${item.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <item.icon size={15} style={{ color: item.color }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginTop: 1 }}>{item.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>
              Quick Actions
            </div>
            <div style={{ padding: '14px 20px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={btnStyle('var(--red)', acting)} onClick={() => doAction('restart')}
                onMouseEnter={e => { if (!acting) (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.2)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.07)' }}>
                {acting ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RotateCcw size={12} />}
                Restart
              </button>
              <button style={btnStyle('var(--blue)', acting)} onClick={() => doAction('model:sonnet')}
                onMouseEnter={e => { if (!acting) (e.currentTarget as HTMLElement).style.background = 'rgba(96,165,250,0.2)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(96,165,250,0.07)' }}>
                <Zap size={12} /> Sonnet
              </button>
              <button style={btnStyle('var(--purple)', acting)} onClick={() => doAction('model:haiku')}
                onMouseEnter={e => { if (!acting) (e.currentTarget as HTMLElement).style.background = 'rgba(167,139,250,0.2)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(167,139,250,0.07)' }}>
                <Cpu size={12} /> Haiku
              </button>
            </div>
            {actionMsg && (
              <div style={{
                margin: '0 14px 14px', padding: '8px 12px', borderRadius: 8, fontSize: 12,
                background: actionMsg.ok ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                border: `1px solid ${actionMsg.ok ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
                color: actionMsg.ok ? 'var(--green)' : 'var(--red)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {actionMsg.ok ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                {actionMsg.text}
              </div>
            )}
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: 'rgba(96,165,250,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MessageSquare size={16} style={{ color: 'var(--blue)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Telegram</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>claude-telegram session</div>
              </div>
              <Badge label={s.running ? 'LIVE' : 'DOWN'} color={s.running ? 'var(--green)' : 'var(--red)'} />
            </div>
          </div>
        </div>
      </div>

      {/* Token breakdown */}
      {usage && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>
            Token Breakdown · Today
          </div>
          <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {[
              { label: 'Input',         value: fmt(usage.today.inputTokens),   color: 'var(--text)' },
              { label: 'Output',        value: fmt(usage.today.outputTokens),  color: 'var(--text)' },
              { label: 'Cache Reads',   value: fmt(usage.today.cacheRead),     color: 'var(--blue)' },
              { label: 'Cache Created', value: fmt(usage.today.cacheCreation), color: 'var(--purple)' },
              { label: 'Total',         value: fmt(usage.totalToday),          color: 'var(--accent)' },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 600, color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
