const express = require('express')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const app = express()
app.use(express.json())
app.use(require('cors')())

const TELEGRAM_DIR = '/Users/marco/.claude/channels/telegram'
const PLUGINS_DIR = '/Users/marco/.claude/plugins'
const LAUNCHAGENTS = `${process.env.HOME}/Library/LaunchAgents`

// ── Helpers ─────────────────────────────────────────────────────────────────

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', timeout: 5000 }).trim() }
  catch { return '' }
}

function readFile(p) {
  try { return fs.readFileSync(p, 'utf8') } catch { return '' }
}

function sessionRunning() {
  return run('/opt/homebrew/bin/tmux has-session -t claude-telegram 2>/dev/null; echo $?') === '0'
}

function getModel() {
  const content = readFile(`${TELEGRAM_DIR}/model.env`)
  const m = content.match(/MODEL=(\S+)/)
  return m ? m[1] : 'sonnet'
}

function authStatus() {
  const log = readFile(`${TELEGRAM_DIR}/launcher.log`)
  const lines = log.split('\n').filter(Boolean)
  // check last 50 lines for auth errors
  const recent = lines.slice(-50).join('\n')
  if (recent.includes('401') || recent.includes('Please run /login') || recent.includes('authentication')) {
    return 'error'
  }
  return 'ok'
}

function parseActivity() {
  const log = readFile(`${TELEGRAM_DIR}/model-switch.log`)
  const entries = []

  for (const line of log.split('\n').filter(Boolean)) {
    const match = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] text=(.+)$/)
    if (!match) continue
    const [, ts, rawText] = match

    let text = rawText

    // Handle bash $'...' quoting with embedded channel XML
    if (text.startsWith("$'")) {
      const chMatch = text.match(/>\\n(.+?)\\n<\/channel>/)
      if (chMatch) {
        text = chMatch[1].trim()
      } else {
        // simple $'...' unescape
        text = text.slice(2, -1).replace(/\\n/g, ' ').replace(/\\'/g, "'").trim()
      }
      // Skip empty or whitespace
      if (!text) continue
    } else {
      // Unescape backslash-space sequences
      text = text.replace(/\\(.)/g, '$1')
    }

    // Skip lines that are just XML channel tags
    if (text.startsWith('<channel')) continue

    entries.push({ ts, text })
  }

  return entries.reverse().slice(0, 100)
}

const ELI5 = {
  watchdog: 'Checks every minute that your Telegram bot session is still alive. If it crashed, it automatically restarts it so you never miss a message.',
  workflow: 'Sends you 3 reflection questions every weekday morning to help you focus on what matters most for the day.',
  locus: 'Sends you 3 reflection questions every weekday morning to help you focus on what matters most for the day.',
  checkin: 'Sends you a morning check-in to help you plan your day and track your goals.',
  backup: 'Makes a full backup of your workspace every night so nothing is ever lost.',
  restart: 'Restarts the gateway service on a schedule to keep things running smoothly.',
  openclaw: 'Keeps the OpenClaw AI gateway running — restarts it if it goes down.',
  briefing: 'Sends you a daily morning briefing with weather, calendar events, and package deliveries via Telegram.',
  'morning briefing': 'Sends you a daily morning briefing with weather, calendar events, and package deliveries via Telegram.',
  'telegram bot': 'Keeps the Claude Telegram bot running so you can always reach Claude from your phone.',
}

function getEli5(label, command) {
  const text = (label + ' ' + command).toLowerCase()
  for (const [key, desc] of Object.entries(ELI5)) {
    if (text.includes(key)) return desc
  }
  return null
}

function getLastRun(command) {
  const logMatch = command.match(/>>?\s*([^\s]+\.log)/)
  if (!logMatch) return null
  try {
    const stat = fs.statSync(logMatch[1])
    return stat.mtimeMs
  } catch { return null }
}

function getCronJobs() {
  const jobs = []

  // crontab -l
  const crontab = run('crontab -l 2>/dev/null')
  for (const line of crontab.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const parts = trimmed.split(/\s+/)
    if (parts.length < 6) continue
    const schedule = parts.slice(0, 5).join(' ')
    const command = parts.slice(5).join(' ')
    const label = command.includes('watchdog') ? 'Telegram Watchdog'
      : command.includes('workflow') || command.includes('locus') || command.includes('checkin') ? 'Morning Reflection Check-in'
      : command.includes('openclaw') ? 'OpenClaw Gateway Restart'
      : command.split('/').pop().replace(/\.sh.*/, '')

    const eli5 = getEli5(label, command)
    const lastRunMs = getLastRun(command)

    jobs.push({
      id: `cron-${jobs.length}`,
      type: 'crontab',
      schedule,
      command,
      label,
      description: eli5 || describeSchedule(schedule),
      scheduleHuman: describeSchedule(schedule),
      lastRunMs,
    })
  }

  // LaunchAgents — Marco's custom agents only
  const MARCO_LABEL_MAP = {
    'com.marco.morning-briefing': 'Morning Briefing',
    'com.marco.morning-reflection': 'Morning Reflection Check-in',
    'com.marco.telegram-watchdog': 'Telegram Watchdog',
    'com.claude.channels.telegram': 'Telegram Bot',
  }

  function humanizeLabel(raw) {
    if (MARCO_LABEL_MAP[raw]) return MARCO_LABEL_MAP[raw]
    return raw.replace(/^com\.marco\./, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  function parseLaunchdSchedule(content) {
    // StartInterval (repeat every N seconds)
    const intervalMatch = content.match(/<key>StartInterval<\/key>\s*<integer>(\d+)<\/integer>/)
    if (intervalMatch) {
      const secs = parseInt(intervalMatch[1])
      if (secs < 120) return `Every ${secs}s`
      if (secs < 3600) return `Every ${Math.round(secs / 60)} minutes`
      return `Every ${Math.round(secs / 3600)} hours`
    }

    // StartCalendarInterval — handles both single dict and array of dicts
    if (!content.includes('StartCalendarInterval')) return 'Runs on schedule'
    const hours = new Set(), mins = new Set(), weekdays = new Set()
    // Extract the section after StartCalendarInterval key
    const sciIdx = content.indexOf('<key>StartCalendarInterval</key>')
    const sciSection = sciIdx >= 0 ? content.slice(sciIdx, sciIdx + 2000) : ''
    for (const m of sciSection.matchAll(/<key>Hour<\/key>\s*<integer>(\d+)<\/integer>/g)) hours.add(parseInt(m[1]))
    for (const m of sciSection.matchAll(/<key>Minute<\/key>\s*<integer>(\d+)<\/integer>/g)) mins.add(parseInt(m[1]))
    for (const m of sciSection.matchAll(/<key>Weekday<\/key>\s*<integer>(\d+)<\/integer>/g)) weekdays.add(parseInt(m[1]))
    // Convert UTC to EDT (UTC-4)
    const utcHour = hours.size === 1 ? [...hours][0] : null
    const edtHour = utcHour !== null ? ((utcHour - 4 + 24) % 24) : null
    const min = mins.size === 1 ? [...mins][0] : 0
    const timeStr = edtHour !== null
      ? (() => { const h12 = edtHour % 12 || 12; const ap = edtHour >= 12 ? 'pm' : 'am'; return `${h12}:${String(min).padStart(2,'0')}${ap} EDT` })()
      : 'Scheduled time'
    // 5 weekday entries = Mon-Fri
    const isWeekdays = weekdays.size === 5
    const isDaily = weekdays.size === 0
    const dayStr = isWeekdays ? 'Weekdays' : isDaily ? 'Daily' : `${weekdays.size} days/week`
    return `${dayStr} at ${timeStr}`
  }

  function getLaunchdLastRun(content) {
    const logMatch = content.match(/<key>StandardOutPath<\/key>\s*<string>([^<]+)<\/string>/)
    if (!logMatch) return null
    try { return fs.statSync(logMatch[1]).mtimeMs } catch { return null }
  }

  try {
    for (const file of fs.readdirSync(LAUNCHAGENTS)) {
      if (!file.endsWith('.plist')) continue
      const rawLabel = file.replace('.plist', '')
      if (!rawLabel.startsWith('com.marco.') && !rawLabel.startsWith('com.claude.channels.telegram')) continue
      const content = readFile(path.join(LAUNCHAGENTS, file))
      const label = humanizeLabel(rawLabel)
      const progMatch = content.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/)
      const strings = progMatch ? [...progMatch[1].matchAll(/<string>([^<]+)<\/string>/g)].map(m => m[1]) : []
      const command = strings.join(' ').substring(0, 120)
      const scheduleHuman = parseLaunchdSchedule(content)
      const lastRunMs = getLaunchdLastRun(content)
      const eli5 = getEli5(label, command)
      jobs.push({
        id: `launchd-${file}`, type: 'launchd', label, command,
        description: eli5 || `Scheduled via launchd`,
        scheduleHuman,
        lastRunMs,
      })
    }
  } catch {}

  return jobs
}

function describeSchedule(cron) {
  const [min, hour, dom, month, dow] = cron.split(' ')
  if (min.startsWith('*/')) return `Every ${min.slice(2)} minutes`
  const days = dow === '1-5' ? 'Weekdays' : dow === '*' ? 'Every day' : `Day ${dow}`
  const h = parseInt(hour), m = parseInt(min)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return `${days} at ${h12}:${String(m).padStart(2,'0')}${ampm}`
}

function getPlugins() {
  const installed = new Set()
  try {
    const data = JSON.parse(readFile(`${PLUGINS_DIR}/installed_plugins.json`))
    for (const key of Object.keys(data.plugins || {})) {
      installed.add(key.split('@')[0])
    }
  } catch {}

  const available = []
  const marketplaceRoot = `${PLUGINS_DIR}/marketplaces/claude-plugins-official`
  const pluginDirs = ['plugins', 'external_plugins']
  try {
    for (const dir of pluginDirs) {
      const base = path.join(marketplaceRoot, dir)
      if (!fs.existsSync(base)) continue
      for (const name of fs.readdirSync(base)) {
        const pluginJson = path.join(base, name, '.claude-plugin', 'plugin.json')
        if (!fs.existsSync(pluginJson)) continue
        let meta = {}
        try { meta = JSON.parse(readFile(pluginJson)) } catch {}
        available.push({
          name,
          description: meta.description || '',
          version: meta.version || '',
          installed: installed.has(name),
        })
      }
    }
  } catch {}

  return available.sort((a, b) => (b.installed ? 1 : 0) - (a.installed ? 1 : 0) || a.name.localeCompare(b.name))
}

function getBotLive() {
  const pidFile = `${TELEGRAM_DIR}/bot.pid`
  let botAlive = false
  try {
    const pid = fs.readFileSync(pidFile, 'utf8').trim()
    if (pid && /^\d+$/.test(pid)) {
      execSync(`kill -0 ${pid}`, { stdio: 'ignore' })
      botAlive = true
    }
  } catch {}

  const tmuxRunning = sessionRunning()
  let tmuxLines = []
  let currentActivity = 'unknown'
  let lastTelegramMsg = null

  if (tmuxRunning) {
    try {
      const raw = execSync(
        '/opt/homebrew/bin/tmux capture-pane -t claude-telegram -p -S -40 2>/dev/null',
        { encoding: 'utf8', timeout: 5000 }
      )
      tmuxLines = raw.split('\n')
      const nonEmpty = tmuxLines.filter(l => l.trim().length > 0)
      const recent = nonEmpty.slice(-5).join('\n')
      const last = nonEmpty[nonEmpty.length - 1] || ''

      if (/[✻✢⏺]/.test(recent) || /thinking|synthesizing/i.test(recent)) {
        currentActivity = 'thinking'
      } else if (/─{10}/.test(last) || /Tool:|Bash|Read|Edit|Write|Grep|Glob/.test(recent)) {
        currentActivity = 'working'
      } else if (/❯\s*$/.test(last) || /\$\s*$/.test(last)) {
        currentActivity = 'idle'
      } else if (last.trim().length > 0) {
        currentActivity = 'working'
      } else {
        currentActivity = 'idle'
      }

      for (let i = tmuxLines.length - 1; i >= 0; i--) {
        if (/←\s*telegram/.test(tmuxLines[i])) {
          lastTelegramMsg = tmuxLines[i].trim()
          break
        }
      }
    } catch {}
  }

  const recentOutput = tmuxLines.filter(l => l.trim()).slice(-6).join('\n')

  return { botAlive, tmuxRunning, currentActivity, lastTelegramMsg, recentOutput, checkedAt: Date.now() }
}

// ── API Routes ───────────────────────────────────────────────────────────────

app.get('/api/bot-live', (req, res) => {
  res.json(getBotLive())
})

app.get('/api/status', (req, res) => {
  const running = sessionRunning()
  const model = getModel()
  const auth = running ? authStatus() : 'unknown'
  const uptime = running ? run('/opt/homebrew/bin/tmux display-message -t claude-telegram -p "#{session_created}"') : null

  res.json({ running, model, auth, uptime: uptime ? parseInt(uptime) : null })
})

app.get('/api/activity', (req, res) => {
  res.json({ entries: parseActivity() })
})

app.get('/api/crons', (req, res) => {
  res.json({ jobs: getCronJobs() })
})

app.get('/api/plugins', (req, res) => {
  res.json({ plugins: getPlugins() })
})

app.get('/api/skills', (req, res) => {
  const pluginsData = JSON.parse(readFile(`${PLUGINS_DIR}/installed_plugins.json`) || '{}')
  const installed = pluginsData.plugins || {}
  const result = []

  for (const [pluginKey, installs] of Object.entries(installed)) {
    const install = installs[0]
    if (!install) continue
    const pluginName = pluginKey.split('@')[0]
    const skillsDir = path.join(install.installPath, 'skills')
    const skills = []
    try {
      for (const skillName of fs.readdirSync(skillsDir)) {
        const skillMd = path.join(skillsDir, skillName, 'SKILL.md')
        const content = readFile(skillMd)
        if (!content) continue
        // Parse frontmatter
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
        let name = skillName, description = ''
        if (fmMatch) {
          const nameMatch = fmMatch[1].match(/^name:\s*(.+)$/m)
          const descMatch = fmMatch[1].match(/^description:\s*["']?([\s\S]*?)["']?\s*$/m)
          if (nameMatch) name = nameMatch[1].trim()
          if (descMatch) description = descMatch[1].trim().replace(/^["']|["']$/g, '')
        }
        skills.push({ name, slug: skillName, description })
      }
    } catch {}
    result.push({ plugin: pluginName, version: install.version, skills })
  }

  res.json({ plugins: result })
})

app.get('/api/usage', (req, res) => {
  try {
    const glob = require('child_process').execSync(
      'find /Users/marco/.claude/projects -name "*.jsonl" 2>/dev/null',
      { encoding: 'utf8', timeout: 5000 }
    ).trim().split('\n').filter(Boolean)

    const dayMap = {}
    const today = new Date().toISOString().slice(0, 10)

    for (const file of glob) {
      let lines
      try { lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) } catch { continue }
      for (const line of lines) {
        let obj
        try { obj = JSON.parse(line) } catch { continue }
        const u = (obj.message && obj.message.usage) ? obj.message.usage : obj.usage
        if (!u) continue
        const ts = obj.timestamp || obj.ts || null
        const date = ts ? new Date(ts).toISOString().slice(0, 10) : today
        if (!dayMap[date]) dayMap[date] = { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheCreation: 0, messages: 0 }
        dayMap[date].inputTokens += u.input_tokens || 0
        dayMap[date].outputTokens += u.output_tokens || 0
        dayMap[date].cacheRead += u.cache_read_input_tokens || 0
        dayMap[date].cacheCreation += u.cache_creation_input_tokens || 0
        dayMap[date].messages += 1
      }
    }

    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const date = d.toISOString().slice(0, 10)
      const data = dayMap[date] || { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheCreation: 0, messages: 0 }
      days.push({ date, ...data, total: data.inputTokens + data.outputTokens + data.cacheRead + data.cacheCreation })
    }

    const t = dayMap[today] || { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheCreation: 0, messages: 0 }
    const totalToday = t.inputTokens + t.outputTokens + t.cacheRead + t.cacheCreation
    const cacheHitRate = totalToday > 0 ? Math.round((t.cacheRead / totalToday) * 100) : 0

    // Weekly total
    const weekTotal = days.reduce((sum, d) => sum + d.total, 0)

    // Rolling 5h window: sum real tokens (input+output only) in the last 5 hours.
    // This mirrors how Claude's rate limiter actually works — a sliding window, not period-based.
    const PERIOD_MS = 5 * 60 * 60 * 1000
    const now = Date.now()
    let periodRealTokens = 0
    let periodTokens = 0
    let oldestInWindow = now

    for (const file of glob) {
      let lines
      try { lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) } catch { continue }
      for (const line of lines) {
        let obj
        try { obj = JSON.parse(line) } catch { continue }
        const u = (obj.message && obj.message.usage) ? obj.message.usage : obj.usage
        if (!u) continue
        const ts = obj.timestamp || obj.ts
        if (!ts) continue
        const msTs = new Date(ts).getTime()
        if (msTs >= now - PERIOD_MS) {
          const real = (u.input_tokens || 0) + (u.output_tokens || 0)
          const all = real + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
          periodRealTokens += real
          periodTokens += all
          if (msTs < oldestInWindow) oldestInWindow = msTs
        }
      }
    }

    // resetAt = when the oldest message in the window falls off (i.e. 5h after it was sent)
    const resetAt = periodRealTokens > 0 ? oldestInWindow + PERIOD_MS : now + PERIOD_MS

    res.json({ today: t, days, totalToday, cacheHitRate, weekTotal, periodTokens, periodRealTokens, resetAt })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/action', (req, res) => {
  const { action } = req.body
  try {
    if (action === 'restart' || action === 'clear') {
      execSync('nohup bash /Users/marco/.claude/channels/telegram/restart.sh >/dev/null 2>&1 &')
      return res.json({ ok: true, message: 'Restarting session...' })
    }
    if (action === 'model:haiku' || action === 'model:sonnet') {
      const model = action.split(':')[1]
      fs.writeFileSync(`${TELEGRAM_DIR}/model.env`, `MODEL=${model}\n`)
      execSync('nohup bash /Users/marco/.claude/channels/telegram/restart.sh >/dev/null 2>&1 &')
      return res.json({ ok: true, message: `Switching to ${model}...` })
    }
    res.status(400).json({ ok: false, message: 'Unknown action' })
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message })
  }
})

// ── Serve frontend ───────────────────────────────────────────────────────────

const DIST = path.join(__dirname, 'frontend', 'dist')
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html')))
} else {
  app.get('/', (req, res) => res.send('<h1>Build frontend first: cd frontend && npm install && npm run build</h1>'))
}

const PORT = process.env.PORT || 3334
app.listen(PORT, '0.0.0.0', () => console.log(`Mission Control running on http://0.0.0.0:${PORT}`))
