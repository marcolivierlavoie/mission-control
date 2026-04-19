import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, CheckCircle, AlertCircle, Clock, Zap } from 'lucide-react'

interface Agent {
  id: string
  name: string
  dir: string
  model: string
  emoji: string
  domain: string
  isRunning: boolean
  lastStatus: 'success' | 'error' | 'never_run' | string
  lastRunAt: string | null
  lastOutput: string | null
}

function timeAgo(ts: string | null) {
  if (!ts) return 'Never'
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function modelShort(model: string) {
  if (model.includes('haiku')) return 'Haiku 4.5'
  if (model.includes('sonnet')) return 'Sonnet 4.6'
  return model.split('/').pop() || model
}

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (showSpin = false) => {
    if (showSpin) setRefreshing(true)
    try {
      const r = await fetch('/api/agents')
      const d = await r.json()
      setAgents(d.agents || [])
    } catch {}
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(() => load(), 10000)
    return () => clearInterval(t)
  }, [load])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
      <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 960 }} className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Agents</h1>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>Sub-agent roster · dispatched by Biff</p>
        </div>
        <button onClick={() => load(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)',
          background: 'transparent', color: 'var(--text2)', fontSize: 12, cursor: 'pointer',
        }}>
          <RefreshCw size={12} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* Biff orchestrator card */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '16px 20px',
        borderLeft: '3px solid var(--accent)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 26 }}>⚡</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Biff</span>
              <span style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 8,
                background: 'rgba(52,211,153,0.12)', color: 'var(--green)',
                border: '1px solid rgba(52,211,153,0.25)', fontWeight: 600, textTransform: 'uppercase',
              }}>Orchestrator</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>
              Telegram session · Claude Sonnet 4.6 · Dispatches all sub-agents
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
            <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 500 }}>Online</span>
          </div>
        </div>
      </div>

      {/* Sub-agent cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 13 }}>
        {agents.map(agent => {
          const statusColor = agent.isRunning
            ? 'var(--blue)'
            : agent.lastStatus === 'success'
              ? 'var(--green)'
              : agent.lastStatus === 'error'
                ? 'var(--red)'
                : 'var(--text3)'
          const statusLabel = agent.isRunning
            ? 'Running'
            : agent.lastStatus === 'success'
              ? 'Idle'
              : agent.lastStatus === 'error'
                ? 'Error'
                : 'Never run'

          return (
            <div key={agent.id} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '16px 18px',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                background: `linear-gradient(90deg, ${statusColor}, transparent)`,
              }} />

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{agent.emoji}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{agent.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>
                      agents/{agent.dir}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: statusColor,
                    boxShadow: agent.isRunning ? `0 0 6px ${statusColor}` : undefined,
                    animation: agent.isRunning ? 'pulse 1.5s ease-in-out infinite' : undefined,
                  }} />
                  <span style={{ fontSize: 11, color: statusColor, fontWeight: 500 }}>{statusLabel}</span>
                </div>
              </div>

              <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5 }}>
                {agent.domain}
              </div>

              <div style={{ marginBottom: 12 }}>
                <span style={{
                  fontSize: 10, padding: '2px 7px', borderRadius: 8,
                  background: 'rgba(96,165,250,0.1)', color: 'var(--blue)',
                  border: '1px solid rgba(96,165,250,0.2)',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <Zap size={9} />
                  {modelShort(agent.model)}
                </span>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                {agent.isRunning ? (
                  <div style={{ fontSize: 11, color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
                    Running a task…
                  </div>
                ) : agent.lastRunAt ? (
                  <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {agent.lastStatus === 'success'
                      ? <CheckCircle size={11} style={{ color: 'var(--green)', flexShrink: 0 }} />
                      : agent.lastStatus === 'error'
                        ? <AlertCircle size={11} style={{ color: 'var(--red)', flexShrink: 0 }} />
                        : <Clock size={11} style={{ flexShrink: 0 }} />
                    }
                    <span>Last run {timeAgo(agent.lastRunAt)}</span>
                    {agent.lastOutput && (
                      <span style={{
                        marginLeft: 2, color: 'var(--text3)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130,
                      }} title={agent.lastOutput}>
                        · {agent.lastOutput}
                      </span>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Never dispatched</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
