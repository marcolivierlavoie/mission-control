'use strict';
const { execSync, exec } = require('child_process');
const fs = require('fs');
const os = require('os');

const BOT_PID_FILE = `${os.homedir()}/.claude/channels/telegram/bot.pid`;
const TMUX_SESSION = 'claude-telegram';

function isBotAlive() {
  try {
    if (!fs.existsSync(BOT_PID_FILE)) return false;
    const pid = fs.readFileSync(BOT_PID_FILE, 'utf8').trim();
    if (!pid || !/^\d+$/.test(pid)) return false;
    // kill -0 checks if process exists without sending a signal
    execSync(`kill -0 ${pid}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getTmuxOutput() {
  try {
    // Capture last 30 lines of the tmux pane
    const raw = execSync(
      `tmux capture-pane -t ${TMUX_SESSION} -p -S -30 2>/dev/null`,
      { encoding: 'utf8', timeout: 5000 }
    );
    return raw;
  } catch {
    return null;
  }
}

function parseActivity(lines) {
  // Determine current activity state from the last few meaningful lines
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  if (!nonEmpty.length) return 'idle';

  const last = nonEmpty[nonEmpty.length - 1];
  const recent = nonEmpty.slice(-5).join('\n');

  // Thinking/processing indicators
  if (/[✻✢⏺]/.test(recent) || /Cooked|thinking|synthesizing/i.test(recent)) {
    return 'thinking';
  }

  // Tool call indicators
  if (/─+$/.test(last) || /Tool:/.test(recent) || /\bBash\b|\bRead\b|\bEdit\b|\bWrite\b|\bGrep\b|\bGlob\b/.test(recent)) {
    return 'working';
  }

  // Idle at shell prompt
  if (/❯\s*$/.test(last) || /\$\s*$/.test(last)) {
    return 'idle';
  }

  // If last line looks like active output, treat as working
  if (last.trim().length > 0 && !/❯/.test(last)) {
    return 'working';
  }

  return 'idle';
}

function extractLastMessage(lines) {
  // Find the most recent "← telegram · ..." line
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (/←\s*telegram\s*·/.test(line) || /←\s*telegram/.test(line)) {
      return line.trim();
    }
  }
  return null;
}

function extractLastTaskSummary(lines) {
  // Return the last few non-empty, non-prompt lines as a summary of recent work
  const nonEmpty = lines.filter(l => {
    const t = l.trim();
    return t.length > 0 && !/^❯\s*$/.test(t);
  });
  const tail = nonEmpty.slice(-5);
  return tail.length ? tail.join('\n') : null;
}

async function getActivity() {
  const alive = isBotAlive();
  const tmuxOutput = getTmuxOutput();

  if (!tmuxOutput) {
    return {
      botStatus: alive ? 'alive' : 'dead',
      tmuxAvailable: false,
      currentActivity: 'unknown',
      lastMessage: null,
      lastTaskSummary: null,
      rawLines: [],
      checkedAt: Date.now()
    };
  }

  const lines = tmuxOutput.split('\n');
  const currentActivity = parseActivity(lines);
  const lastMessage = extractLastMessage(lines);
  const lastTaskSummary = extractLastTaskSummary(lines);

  return {
    botStatus: alive ? 'alive' : 'dead',
    tmuxAvailable: true,
    currentActivity,
    lastMessage,
    lastTaskSummary,
    rawLines: lines.slice(-30),
    checkedAt: Date.now()
  };
}

module.exports = { getActivity };
