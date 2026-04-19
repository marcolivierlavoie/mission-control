import { useState, useEffect } from 'react'
import { Clock, Terminal, Loader2 } from 'lucide-react'
import Card, { CardHeader } from '../components/Card'

interface Job {
  id: string
  type: 'crontab' | 'launchd'
  schedule?: string
  scheduleHuman?: string
  command: string
  label: string
  description?: string
  lastRunMs?: number | null
}

function timeAgo(ms: number | null | undefined) {
  if (!ms) return 'Never'
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function Crons() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/crons').then(r => r.json()).then(d => {
      setJobs(d.jobs || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Scheduled Tasks</h1>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Automated jobs running on your system via launchd</p>
      </div>

      <Card noPad>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <CardHeader title="Scheduled Jobs" subtitle={`${jobs.length} jobs found`} />
        </div>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--blue)' }} />
          </div>
        ) : jobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)' }}>
            <Clock size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
            <p style={{ fontSize: 12 }}>No scheduled jobs found</p>
          </div>
        ) : jobs.map((job, i) => (
          <div key={job.id} style={{
            padding: '16px 20px',
            borderBottom: i < jobs.length - 1 ? '1px solid var(--border)' : undefined,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: 'rgba(52,211,153,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Clock size={16} style={{ color: 'var(--green)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{job.label}</p>
                  <span style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 5,
                    background: 'rgba(52,211,153,0.1)',
                    color: 'var(--green)',
                    fontWeight: 600, letterSpacing: '0.3px',
                  }}>
                    LAUNCHD
                  </span>
                </div>
                {job.description && (
                  <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5 }}>{job.description}</p>
                )}
                <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                  {(job.scheduleHuman || job.schedule) && (
                    <span style={{
                      fontSize: 11, fontFamily: 'monospace', color: 'rgba(251,191,36,0.9)',
                      padding: '2px 8px', borderRadius: 5, background: 'rgba(251,191,36,0.08)',
                    }}>
                      🕐 {job.scheduleHuman || job.schedule}
                    </span>
                  )}
                  <span style={{
                    fontSize: 11, color: job.lastRunMs ? 'var(--green)' : 'var(--text3)',
                    padding: '2px 8px', borderRadius: 5,
                    background: job.lastRunMs ? 'rgba(52,211,153,0.08)' : 'rgba(255,255,255,0.04)',
                  }}>
                    ✓ Last run: {timeAgo(job.lastRunMs)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}
