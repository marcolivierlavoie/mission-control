import { CSSProperties, ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  style?: CSSProperties
  noPad?: boolean
}

export default function Card({ children, style, noPad }: CardProps) {
  return (
    <div className="fade-in" style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: noPad ? 0 : 20,
      backdropFilter: 'blur(12px)',
      ...style,
    }}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
      <div>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{subtitle}</p>}
      </div>
      {right && <div>{right}</div>}
    </div>
  )
}

export function Dot({ color = 'var(--green)', pulse }: { color?: string; pulse?: boolean }) {
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: color,
      animation: pulse ? 'pulse-dot 2s ease-in-out infinite' : undefined,
      flexShrink: 0,
    }} />
  )
}

export function Badge({ label, color = 'var(--blue)' }: { label: string; color?: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '3px 8px',
      borderRadius: 6, border: `1px solid ${color}30`,
      background: `${color}15`, color,
      letterSpacing: '0.3px',
    }}>
      {label}
    </span>
  )
}
