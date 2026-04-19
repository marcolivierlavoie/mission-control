import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, RefreshCw, Loader2, Radio, AlertCircle, CheckCircle } from 'lucide-react'
import Card, { CardHeader } from '../components/Card'

interface Entry { ts: string; text: string }

interface BotLive {
  botAlive: boolean
  tmuxRunning: boolean
  currentActivity: 'idle' | 'thinking' | 'working' | 'unknown'
  lastTelegramMsg: string | null
  recentOutput: string
  checkedAt: number
}

function timeAgo(ts: string) {
  const d = new Date(ts.replace(' ', 'T'))
  const secs = Math.floor((Date.now() - d.getTime()) / 1000)
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function isCommand(text: string) {
  return /^\/(clear|haiku|sonnet|model|login)/.test(text.trim())
}

const ACTIVITY_COLOR: Record<string, string> = {
  idle: 'var(--green)',
  thinking: 'var(--yellow)',
  working: 'var(--blue)',
  unknown: 'var(--text3)',
}

const ACTIVITY_LABEL: Record<string, string> = {
  idle: 'Idle — waiting for messages',
  thinking: 'Thinking…',
  working: 'Working on a task',
  unknown: 'Status unknown',
}

function StatusDot({ color }: { color: string }) {
  const isPulsing = color === 'var(--blue)' || color === 'var(--yellow)'
  return (
    <span style={{
      display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
      background: color, flexShrink: 0,
      boxShadow: isPulsing ? `0 0 0 3px ${color}33` : undefined,
      animation: isPulsing ? 'pulse 1.5s ease-in-out infinite' : undefined,
    }} />
  )
}

export default function Activity() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [live, setLive] = useState<BotLive | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (showSpin = false) => {
    if (showSpin) setRefreshing(true)
    try {
      const [actRes, liveRes] = await Promise.all([
        fetch('/api/activity'),
        fetch('/api/bot-live'),
      ])
      const actData = await actRes.json()
      const liveData = await liveRes.json()
      setEntries(actData.entries || [])
      setLive(liveData)
    } catch {}
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(() => load(), 8000)
    return () => clearInterval(t)
  }, [load])

  const actColor = live ? ACTIVITY_COLOR[live.currentActivity] ?? 'var(--text3)' : 'var(--text3)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Activity</h1>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Bot status & recent messages</p>
        </div>
        <button onClick={() => load(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
          borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
          color: 'var(--text2)', fontSize: 12, cursor: 'pointer',
        }}>
          <RefreshCw size={13} style={{ animation: refreshing ? 'spin 0.5s linear infinite' : undefined }} />
          Refresh
        </button>
      </div>

      {/* Live bot status card */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Radio size={16} style={{ color: 'var(--text3)' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Bot</span>
            {live ? (
              live.botAlive
                ? <CheckCircle size={14} style={{ color: 'var(--green)' }} />
                : <AlertCircle size={14} style={{ color: 'var(--red, #f87171)' }} />
            ) : null}
            <span style={{ fontSize: 12, color: live?.botAlive ? 'var(--green)' : 'var(--text3)' }}>
              {live ? (live.botAlive ? 'alive' : 'dead') : '—'}
            </span>
          </div>

          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusDot color={actColor} />
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>
              {live ? ACTIVITY_LABEL[live.currentActivity] : '—'}
            </span>
          </div>

          {live?.lastTelegramMsg && (
            <>
              <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
              <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 340 }}>
                {live.lastTelegramMsg}
              </span>
            </>
          )}

          {live && (
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)' }}>
              updated {Math.round((Date.now() - live.checkedAt) / 1000)}s ago
            </span>
          )}
        </div>

        {live?.recentOutput && live.currentActivity !== 'idle' && (
          <pre style={{
            marginTop: 14, padding: '10px 12px', borderRadius: 8,
            background: 'var(--surface)', fontSize: 11, color: 'var(--text2)',
            fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            maxHeight: 120, overflowY: 'auto', border: '1px solid var(--border)',
          }}>{live.recentOutput}</pre>
        )}
      </Card>

      {/* Message log */}
      <Card noPad>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <CardHeader title="Message Log" subtitle={`${entries.length} messages`} />
        </div>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--blue)' }} />
          </div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)' }}>
            <MessageSquare size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
            <p style={{ fontSize: 12 }}>No activity yet</p>
          </div>
        ) : (
          <div style={{ maxHeight: 600, overflowY: 'auto' }}>
            {entries.map((e, i) => (
              <div key={i} style={{
                display: 'flex', gap: 12, padding: '12px 20px',
                borderBottom: i < entries.length - 1 ? '1px solid var(--border)' : undefined,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: isCommand(e.text) ? 'rgba(251,191,36,0.12)' : 'rgba(79,156,249,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <MessageSquare size={14} style={{ color: isCommand(e.text) ? 'var(--yellow)' : 'var(--blue)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 13, color: 'var(--text)',
                    fontFamily: isCommand(e.text) ? 'monospace' : undefined,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{e.text}</p>
                  <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{timeAgo(e.ts)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
