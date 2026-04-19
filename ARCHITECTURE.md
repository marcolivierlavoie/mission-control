# Mission Control — Architecture

Local dashboard for monitoring the Claude AI agent system (Biff orchestrator + sub-agents).

## Stack
- **Backend:** Node.js + Express (`server.js`), port 3334
- **Frontend:** React 18 + Vite (`frontend/src/`)
- **No external DB** — reads local files only

## Running
```bash
npm install
cd frontend && npm install && npm run build && cd ..
PORT=3334 node server.js
```

Or via the managed start script: `~/.claude/channels/mission-control/start.sh`

## Agent Architecture

### Orchestrator: Biff
Claude Code session running via Telegram plugin. Receives messages and dispatches to sub-agents. Never does implementation work directly.
- Model: `claude-sonnet-4-6`
- Channel: Telegram (tmux session `claude-telegram`)

### Sub-Agent Dispatch: run_agent.sh
Sub-agents are invoked via `~/.claude/agents/run_agent.sh` (fire-and-forget, background).

**Usage:**
```bash
~/.claude/agents/run_agent.sh --agent <name> --task "DETAILED TASK" --model <model> --cwd /path/to/project &
```

**Flags:**
| Flag | Description |
|------|-------------|
| `--agent` | Agent name (matches directory under `~/.claude/agents/`) |
| `--task` | Full task description (sub-agents have no conversation context) |
| `--cwd` | Working directory for the agent |
| `--model` | Claude model ID |
| `--timeout` | Optional timeout in seconds |

The script writes `running` / `done` status to `~/.claude/agents/<name>/last_result.json` and notifies via Telegram on completion.

### Claude Code Sub-Agents (on-demand)

| Agent | Directory | Model | Task Domain |
|-------|-----------|-------|-------------|
| Argus | `home-infra` | claude-sonnet-4-6 | HA control, Proxmox, NAS, UniFi, AdGuard |
| Vesper | `personal-assistant` | claude-sonnet-4-6 | Calendar, Gmail, scheduling |
| Sage | `research` | claude-haiku-4-5-20251001 | Web lookups, article summaries |
| Forge | `dev` | claude-sonnet-4-6 | Code, GitHub, deployments, scripting, file edits |
| Echo | `memory` | claude-haiku-4-5-20251001 | Memory updates, preference extraction |

Each agent's working directory contains a `CLAUDE.md` with role-specific instructions and an `inbox.json` for pending tasks.

## Data Sources
- `~/.claude/projects/**/*.jsonl` — Claude Code token usage logs
- `~/.claude/channels/telegram/model-switch.log` — activity log
- `~/.claude/channels/telegram/model.env` — current model (haiku/sonnet)
- `~/Library/LaunchAgents/*.plist` — scheduled LaunchAgent jobs
- `crontab -l` — cron jobs

## Pages
| Page | Description |
|------|-------------|
| Dashboard | Session status, model, live bot activity, 7-day token usage |
| Activity | Recent Telegram message/activity log |
| Agents | Sub-agent roster with last-result status from `last_result.json` |
| Scheduled | Cron + LaunchAgent jobs |
| Plugins | Installed Claude Code plugins |
| Skills | Skills from installed plugins |

## API Routes
| Route | Description |
|-------|-------------|
| `GET /api/status` | Session running, model, auth status |
| `GET /api/bot-live` | Live tmux capture, current activity |
| `GET /api/activity` | Recent message/activity log |
| `GET /api/crons` | Cron + LaunchAgent jobs |
| `GET /api/plugins` | Installed Claude Code plugins |
| `GET /api/skills` | Skills from installed plugins |
| `GET /api/usage` | 7-day token usage from .jsonl logs |
| `GET /api/agents` | Sub-agent roster and last-result status |
| `POST /api/action` | Restart session or switch model |

## Key Files
- `server.js` — Express server + all API routes
- `start.sh` — managed startup script (installs deps, builds frontend, starts server)
- `frontend/src/App.tsx` — React app root, defines page routes
- `frontend/src/pages/` — Dashboard, Activity, Agents, Scheduled, Plugins, Skills
- `frontend/src/components/` — Shared Card component
