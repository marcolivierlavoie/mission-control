import { useState, useEffect } from 'react'
import { Puzzle, CheckCircle, Loader2 } from 'lucide-react'
import Card, { CardHeader } from '../components/Card'

interface Plugin {
  name: string
  description: string
  version: string
  installed: boolean
}

export default function Plugins() {
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'installed' | 'available'>('all')

  useEffect(() => {
    fetch('/api/plugins').then(r => r.json()).then(d => {
      setPlugins(d.plugins || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const visible = plugins.filter(p =>
    filter === 'all' ? true : filter === 'installed' ? p.installed : !p.installed
  )
  const installedCount = plugins.filter(p => p.installed).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Plugins</h1>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
          {installedCount} installed · {plugins.length - installedCount} available
        </p>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(['all', 'installed', 'available'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
            background: filter === f ? 'rgba(79,156,249,0.12)' : 'var(--surface)',
            color: filter === f ? 'var(--blue)' : 'var(--text2)',
            fontSize: 12, fontWeight: filter === f ? 500 : 400, cursor: 'pointer',
            textTransform: 'capitalize',
          }}>
            {f}
          </button>
        ))}
      </div>

      <Card noPad>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <CardHeader title="Plugin Library" subtitle={`${visible.length} plugins`} />
        </div>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--blue)' }} />
          </div>
        ) : visible.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)' }}>
            <Puzzle size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
            <p style={{ fontSize: 12 }}>No plugins match this filter</p>
          </div>
        ) : visible.map((plugin, i) => (
          <div key={plugin.name} style={{
            display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 20px',
            borderBottom: i < visible.length - 1 ? '1px solid var(--border)' : undefined,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: plugin.installed ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {plugin.installed
                ? <CheckCircle size={16} style={{ color: 'var(--green)' }} />
                : <Puzzle size={16} style={{ color: 'var(--text3)' }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: plugin.installed ? 'var(--text)' : 'var(--text2)' }}>
                  {plugin.name}
                </p>
                {plugin.version && (
                  <span style={{ fontSize: 10, color: 'var(--text3)' }}>v{plugin.version}</span>
                )}
                {plugin.installed && (
                  <span style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 5,
                    background: 'rgba(52,211,153,0.1)', color: 'var(--green)',
                    fontWeight: 600, letterSpacing: '0.3px',
                  }}>INSTALLED</span>
                )}
              </div>
              {plugin.description ? (
                <p style={{
                  fontSize: 11, color: 'var(--text3)', marginTop: 4, lineHeight: 1.5,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {plugin.description}
                </p>
              ) : (
                <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontStyle: 'italic' }}>No description</p>
              )}
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}
