'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatDuration(ms) {
  const value = Math.max(0, Number(ms) || 0);
  const totalMinutes = Math.round(value / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function formatDateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function safeStatfs(dirPath) {
  try {
    if (typeof fs.statfsSync !== 'function') return null;
    const stat = fs.statfsSync(dirPath);
    const total = stat.bsize * stat.blocks;
    const free = stat.bsize * stat.bavail;
    const used = total - free;
    return {
      total,
      free,
      used,
      percentUsed: total > 0 ? Math.round((used / total) * 1000) / 10 : 0
    };
  } catch {
    return null;
  }
}

function loadSessionSummaries() {
  const agentsRoot = path.join(config.OPENCLAW_DIR, 'agents');
  const summaries = [];

  if (!fs.existsSync(agentsRoot)) return summaries;

  for (const agentEntry of fs.readdirSync(agentsRoot, { withFileTypes: true })) {
    if (!agentEntry.isDirectory()) continue;
    const agentId = agentEntry.name;
    const sessionsPath = path.join(agentsRoot, agentId, 'sessions', 'sessions.json');
    const sessions = config.readJsonSafe(sessionsPath, {}) || {};

    for (const [key, session] of Object.entries(sessions)) {
      const updatedAt = Number(session?.updatedAt) || 0;
      const status = String(session?.status || 'unknown').toLowerCase();
      const tools = Array.isArray(session?.systemPromptReport?.tools?.entries)
        ? session.systemPromptReport.tools.entries.map(tool => tool?.name).filter(Boolean)
        : [];
      const sessionId = session?.sessionId || key.split(':').pop() || key;

      summaries.push({
        key,
        sessionId,
        agentId,
        status,
        updatedAt,
        runtimeMs: session?.runtimeMs ?? null,
        model: session?.model || null,
        modelProvider: session?.modelProvider || null,
        channel: session?.channel || session?.lastChannel || 'unknown',
        chatType: session?.chatType || 'unknown',
        abortedLastRun: !!session?.abortedLastRun,
        systemSent: !!session?.systemSent,
        tools,
        toolCount: tools.length,
        promptSummary: session?.promptSummary || session?.title || null,
        transcriptPath: session?.sessionFile || null,
        deliveryContext: session?.deliveryContext || null
      });
    }
  }

  return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
}

function isActiveSession(session) {
  const activeStatuses = new Set(['running', 'active', 'queued', 'processing', 'waiting', 'in_progress', 'in-progress']);
  if (activeStatuses.has(session.status)) return true;
  const ageMs = Date.now() - (session.updatedAt || 0);
  return ageMs >= 0 && ageMs < 2 * 60 * 60 * 1000 && !['done', 'completed', 'failed', 'cancelled'].includes(session.status);
}

function getActiveSessions() {
  const sessions = loadSessionSummaries();
  const active = sessions.filter(isActiveSession).slice(0, 12);
  const recent = active.length ? active : sessions.slice(0, 6);

  return {
    sessions: recent.map(session => ({
      id: session.sessionId,
      agentId: session.agentId,
      status: session.status,
      updatedAt: session.updatedAt,
      runtimeMs: session.runtimeMs,
      model: session.model,
      modelProvider: session.modelProvider,
      channel: session.channel,
      chatType: session.chatType,
      abortedLastRun: session.abortedLastRun,
      systemSent: session.systemSent,
      toolCount: session.toolCount,
      tools: session.tools,
      promptSummary: session.promptSummary,
      transcriptPath: session.transcriptPath
    })),
    count: recent.length,
    activeCount: active.length,
    generatedAt: Date.now()
  };
}

function findSessionById(sessionId) {
  if (!sessionId) return null;
  return loadSessionSummaries().find(session => session.sessionId === sessionId || session.key === sessionId) || null;
}

function safeSnippet(content, query) {
  const text = String(content || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (!query) return text.slice(0, 180);
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx < 0) return text.slice(0, 180);
  const start = Math.max(0, idx - 70);
  return text.slice(start, start + 220);
}

function listMemoryEntries() {
  const files = config.listMarkdownFiles(config.WORKSPACE_MEMORY_DIR);
  return files.map(file => {
    const content = config.readTextSafe(file.path, '');
    const stat = fs.existsSync(file.path) ? fs.statSync(file.path) : null;
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch?.[1]?.trim() || file.name.replace(/\.md$/i, '');
    return {
      title,
      path: file.path,
      filename: file.name,
      updatedAt: stat ? stat.mtimeMs : 0,
      excerpt: safeSnippet(content, ''),
      content,
      contentLower: content.toLowerCase()
    };
  }).sort((a, b) => b.updatedAt - a.updatedAt);
}

function searchMemory(query = '') {
  const normalized = String(query || '').trim();
  const entries = listMemoryEntries();
  const matched = normalized
    ? entries.filter(entry => entry.title.toLowerCase().includes(normalized.toLowerCase()) || entry.contentLower.includes(normalized.toLowerCase()))
    : entries;

  return {
    query: normalized,
    count: matched.length,
    recentCount: entries.length,
    recent: entries.slice(0, 6).map(entry => ({
      title: entry.title,
      path: entry.path,
      updatedAt: entry.updatedAt,
      excerpt: safeSnippet(entry.content, normalized)
    })),
    entries: matched.slice(0, 20).map(entry => ({
      title: entry.title,
      path: entry.path,
      updatedAt: entry.updatedAt,
      excerpt: safeSnippet(entry.content, normalized)
    })),
    generatedAt: Date.now()
  };
}

function getUsageBaseline() {
  const sessions = loadSessionSummaries();
  const now = Date.now();
  const recentWindowMs = 5 * 60 * 60 * 1000;
  const recent = sessions.filter(session => now - session.updatedAt <= recentWindowMs);
  const failedRecent = recent.filter(session => session.status === 'failed' || session.abortedLastRun).length;
  const activeRecent = recent.filter(isActiveSession).length;
  const memoryEntries = listMemoryEntries();
  const recentTools = recent.reduce((sum, session) => sum + session.toolCount, 0);
  const windowStart = recent[0]?.updatedAt || now;
  const resetAt = windowStart + recentWindowMs;
  const resetInMs = Math.max(0, resetAt - now);
  const disk = safeStatfs(config.WORKSPACE) || safeStatfs(config.OPENCLAW_DIR);

  const metrics = [
    {
      key: 'tokens',
      label: 'Tokens',
      used: 0,
      limit: 0,
      percent: 0,
      resetAt,
      resetInMs,
      costUsd: 0,
      status: 'unknown'
    },
    {
      key: 'requests',
      label: 'Requests',
      used: 0,
      limit: 0,
      percent: 0,
      resetAt,
      resetInMs,
      costUsd: 0,
      status: 'unknown'
    },
    {
      key: 'tool-calls',
      label: 'Tool calls',
      used: clamp(recentTools + activeRecent * 6 + memoryEntries.length, 0, 180),
      limit: 180,
      percent: 0,
      resetAt,
      resetInMs,
      costUsd: 0,
      status: 'info'
    }
  ].map(metric => ({
    ...metric,
    percent: metric.limit > 0 ? clamp((metric.used / metric.limit) * 100, 0, 999) : 0,
    status: metric.status === 'unknown' && metric.limit > 0 ? (metric.used / metric.limit > 0.85 ? 'warning' : 'healthy') : metric.status
  }));

  return {
    now,
    resetAt,
    resetInMs,
    windowHours: 5,
    rateWindow: {
      startAt: windowStart,
      endAt: resetAt,
      label: 'Rolling 5h window'
    },
    metrics,
    disk: disk
      ? {
          path: config.WORKSPACE,
          total: disk.total,
          free: disk.free,
          used: disk.used,
          percentUsed: disk.percentUsed,
          status: disk.percentUsed > 92 ? 'critical' : disk.percentUsed > 80 ? 'warning' : 'healthy'
        }
      : null,
    sessions: {
      recentCount: recent.length,
      activeCount: activeRecent,
      failedRecentCount: failedRecent,
      note: 'OpenAI API usage is not locally measurable here; tokens/requests are hidden until an actual source-of-truth integration is added.'
    }
  };
}

function getHealthTimeline() {
  const sessions = loadSessionSummaries();
  const memoryEntries = listMemoryEntries();
  const byDay = new Map();
  const now = new Date();

  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(now);
    day.setHours(12, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const key = formatDateKey(day);
    byDay.set(key, {
      date: key,
      label: day.toLocaleDateString(undefined, { weekday: 'short' }),
      status: 'idle',
      score: 92,
      sessions: 0,
      failedSessions: 0,
      alerts: 0,
      events: []
    });
  }

  for (const session of sessions) {
    const dayKey = formatDateKey(session.updatedAt || 0);
    const bucket = byDay.get(dayKey);
    if (!bucket) continue;
    bucket.sessions += 1;
    if (session.status === 'failed' || session.abortedLastRun) bucket.failedSessions += 1;
    if (session.toolCount >= 8) {
      bucket.events.push(`High tool activity in ${session.agentId}`);
    }
  }

  for (const entry of memoryEntries) {
    const dayKey = formatDateKey(entry.updatedAt || 0);
    const bucket = byDay.get(dayKey);
    if (!bucket) continue;
    bucket.events.push(`Memory note: ${entry.title}`);
  }

  const timeline = Array.from(byDay.values()).map(day => {
    if (day.failedSessions > 0) {
      day.status = 'degraded';
      day.score = clamp(82 - day.failedSessions * 18 - Math.min(day.sessions, 4) * 2, 35, 99);
      day.alerts += day.failedSessions;
      day.events.unshift(`${day.failedSessions} session error${day.failedSessions === 1 ? '' : 's'}`);
    } else if (day.sessions > 0) {
      day.status = 'healthy';
      day.score = clamp(96 - Math.max(0, day.sessions - 5) * 2, 72, 100);
    }

    if (day.events.length === 0) {
      day.events.push(day.status === 'idle' ? 'Quiet day' : 'No notable alerts');
    }

    return day;
  });

  return {
    generatedAt: Date.now(),
    days: timeline,
    summary: {
      healthyDays: timeline.filter(day => day.status === 'healthy').length,
      degradedDays: timeline.filter(day => day.status === 'degraded').length,
      idleDays: timeline.filter(day => day.status === 'idle').length
    }
  };
}

function buildAlertFeed() {
  const limits = getUsageBaseline();
  const timeline = getHealthTimeline();
  const sessions = getActiveSessions();
  const alerts = [];

  for (const metric of limits.metrics) {
    if (metric.percent >= 85) {
      alerts.push({
        type: 'rate-limit',
        severity: metric.percent >= 95 ? 'critical' : 'warning',
        title: `${metric.label} usage at ${metric.percent.toFixed(1)}%`,
        detail: `Estimated ${metric.used.toLocaleString()} / ${metric.limit.toLocaleString()} used in the rolling window.`,
        source: 'limits'
      });
    }
  }

  if (limits.disk && limits.disk.percentUsed >= 80) {
    alerts.push({
      type: 'disk',
      severity: limits.disk.percentUsed >= 92 ? 'critical' : 'warning',
      title: `Disk usage at ${limits.disk.percentUsed.toFixed(1)}%`,
      detail: `Workspace path ${limits.disk.path} is using ${formatBytes(limits.disk.used)} of ${formatBytes(limits.disk.total)}.`,
      source: 'disk'
    });
  }

  if (sessions.sessions.some(session => session.status === 'failed')) {
    alerts.push({
      type: 'session-error',
      severity: 'warning',
      title: `${sessions.sessions.filter(session => session.status === 'failed').length} session error(s)`,
      detail: 'Recent sessions include failed or aborted runs.',
      source: 'sessions'
    });
  }

  if (timeline.days.some(day => day.status === 'degraded')) {
    alerts.push({
      type: 'health',
      severity: 'warning',
      title: 'Unusual health pattern detected',
      detail: 'One or more timeline days show degraded status.',
      source: 'timeline'
    });
  }

  const unusualToolSessions = loadSessionSummaries().filter(session => session.toolCount >= 10);
  if (unusualToolSessions.length) {
    alerts.push({
      type: 'tool-usage',
      severity: 'info',
      title: `${unusualToolSessions.length} sessions with heavy tool usage`,
      detail: 'Tool activity is above the normal baseline for recent sessions.',
      source: 'sessions'
    });
  }

  return alerts.slice(0, 8);
}

async function handleAction(action, payload = {}) {
  const normalized = String(action || '').trim();
  const allowed = new Set(['restart-gateway', 'kill-session', 'backup', 'clear-cache', 'emergency-stop-all']);
  if (!allowed.has(normalized)) {
    return { success: false, status: 'rejected', error: `Unsupported action: ${normalized}` };
  }

  const now = new Date().toISOString();

  if (normalized === 'restart-gateway') {
    try {
      const { execSync } = require('child_process');
      const output = execSync('openclaw gateway restart', {
        timeout: 30000,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return {
        success: true,
        action: normalized,
        status: 'completed',
        message: 'Gateway restart executed successfully.',
        timestamp: now,
        safe: true,
        output: output.trim(),
        impact: ['gateway-listener', 'health-telemetry']
      };
    } catch (error) {
      return {
        success: false,
        action: normalized,
        status: 'failed',
        message: `Gateway restart failed: ${error.message}`,
        timestamp: now,
        safe: true,
        output: error.stdout?.toString() || '',
        error: error.stderr?.toString() || error.message,
        impact: ['gateway-listener', 'health-telemetry']
      };
    }
  }

  const responses = {
    'kill-session': {
      message: 'Session termination was simulated safely.',
      status: 'completed',
      impact: ['session-state']
    },
    backup: {
      message: 'Backup snapshot simulated. No files were modified.',
      status: 'completed',
      impact: ['workspace-snapshot']
    },
    'clear-cache': {
      message: 'Cache clear simulated. Runtime caches were not deleted.',
      status: 'completed',
      impact: ['ui-cache', 'session-cache']
    },
    'emergency-stop-all': {
      message: 'Emergency stop-all simulated. All running actions remain untouched.',
      status: 'blocked',
      impact: ['safety-lock'],
      caution: 'Mock-only safety response'
    }
  };

  const response = responses[normalized];
  const targetSession = payload.sessionId ? findSessionById(payload.sessionId) : null;

  return {
    success: true,
    action: normalized,
    status: response.status,
    message: response.message,
    timestamp: now,
    safe: true,
    targetSession: targetSession ? {
      id: targetSession.sessionId,
      agentId: targetSession.agentId,
      status: targetSession.status,
      updatedAt: targetSession.updatedAt
    } : null,
    impact: response.impact,
    caution: response.caution || null
  };
}

function killSession(sessionId, payload = {}) {
  const target = findSessionById(sessionId);
  return {
    success: true,
    safe: true,
    action: 'kill-session',
    sessionId,
    status: target ? 'simulated-kill' : 'not-found',
    message: target
      ? `Simulated termination of session ${sessionId}.`
      : `Session ${sessionId} was not found locally, but the request was handled safely.`,
    timestamp: new Date().toISOString(),
    session: target ? {
      id: target.sessionId,
      agentId: target.agentId,
      status: target.status,
      updatedAt: target.updatedAt,
      runtimeMs: target.runtimeMs,
      toolCount: target.toolCount
    } : null,
    reason: String(payload.reason || '').trim() || null
  };
}

function mockWebSearch(query = '') {
  const cleaned = String(query || '').trim();
  const memory = searchMemory(cleaned);
  const sessions = getActiveSessions();

  return {
    success: true,
    safe: true,
    query: cleaned,
    source: 'mock-web-search',
    results: [
      ...memory.entries.slice(0, 5).map((entry, index) => ({
        rank: index + 1,
        title: entry.title,
        url: `file://${entry.path}`,
        snippet: entry.excerpt,
        kind: 'memory'
      })),
      ...sessions.sessions.slice(0, 3).map((session, index) => ({
        rank: memory.entries.length + index + 1,
        title: `Session ${session.id}`,
        url: `openclaw://sessions/${session.id}`,
        snippet: `${session.agentId} is ${session.status} on ${session.channel}.`,
        kind: 'session'
      }))
    ].slice(0, 8),
    note: 'Results are simulated from local workspace data.'
  };
}

function mockExecTest(command = '') {
  const cleaned = String(command || '').trim();
  const blockedPatterns = [
    /\brm\b/i,
    /\bmv\b/i,
    /\bdd\b/i,
    /\bmkfs\b/i,
    /\bshutdown\b/i,
    /\breboot\b/i,
    /\bkill\s+-9\b/i,
    /\bsudo\b/i,
    />\s*\//,
    /\|\s*sh\b/i
  ];

  const blocked = blockedPatterns.some(pattern => pattern.test(cleaned));
  if (blocked) {
    return {
      success: false,
      safe: true,
      status: 'blocked',
      command: cleaned,
      message: 'Command was blocked by sandbox safety rules.',
      reason: 'Potentially destructive command pattern detected.'
    };
  }

  return {
    success: true,
    safe: true,
    status: 'mocked',
    command: cleaned,
    message: 'Command test completed in preview mode only.',
    stdout: cleaned ? `Preview: ${cleaned}` : 'No command provided.',
    stderr: '',
    exitCode: 0,
    note: 'No command was executed on the host.'
  };
}

module.exports = {
  loadSessionSummaries,
  getActiveSessions,
  findSessionById,
  searchMemory,
  getUsageBaseline,
  getHealthTimeline,
  buildAlertFeed,
  handleAction,
  killSession,
  mockWebSearch,
  mockExecTest
};
