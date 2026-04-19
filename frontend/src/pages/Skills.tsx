import { useState, useEffect } from 'react'
import { Wand2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import Card, { CardHeader } from '../components/Card'

interface Skill {
  name: string
  slug: string
  description: string
}

interface PluginSkills {
  plugin: string
  version: string
  skills: Skill[]
}

export default function Skills() {
  const [plugins, setPlugins] = useState<PluginSkills[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/skills').then(r => r.json()).then(d => {
      const data: PluginSkills[] = (d.plugins || []).filter((p: PluginSkills) => p.skills.length > 0)
      setPlugins(data)
      // Auto-expand all by default
      setExpanded(new Set(data.map(p => p.plugin)))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const totalSkills = plugins.reduce((n, p) => n + p.skills.length, 0)

  function toggle(name: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Skills</h1>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
          {plugins.length} plugins · {totalSkills} skills installed
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--blue)' }} />
        </div>
      ) : plugins.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)' }}>
            <Wand2 size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
            <p style={{ fontSize: 12 }}>No skills found</p>
          </div>
        </Card>
      ) : plugins.map(pkg => {
        const open = expanded.has(pkg.plugin)
        return (
          <Card noPad key={pkg.plugin}>
            {/* Plugin header */}
            <button onClick={() => toggle(pkg.plugin)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '14px 20px',
              borderBottom: open ? '1px solid var(--border)' : undefined,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: 'rgba(79,156,249,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Wand2 size={15} style={{ color: 'var(--blue)' }} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{pkg.plugin}</p>
                  <p style={{ fontSize: 11, color: 'var(--text3)' }}>v{pkg.version} · {pkg.skills.length} skills</p>
                </div>
              </div>
              {open
                ? <ChevronDown size={14} style={{ color: 'var(--text3)', flexShrink: 0 }} />
                : <ChevronRight size={14} style={{ color: 'var(--text3)', flexShrink: 0 }} />}
            </button>

            {/* Skills list */}
            {open && pkg.skills.map((skill, i) => (
              <div key={skill.slug} style={{
                padding: '12px 20px 12px 64px',
                borderBottom: i < pkg.skills.length - 1 ? '1px solid var(--border)' : undefined,
              }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 3 }}>
                  /{skill.name}
                </p>
                {skill.description && (
                  <p style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
                    {skill.description}
                  </p>
                )}
              </div>
            ))}
          </Card>
        )
      })}
    </div>
  )
}
