# Mission Control — Architecture

Local dashboard for monitoring the Claude AI agent system (Biff orchestrator + sub-agents).

## Stack
- **Backend:** Node.js + Express (`server.js`)
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
Claude Code session running via Telegram plugin. Receives messages and dispatches to sub-agents.
- Model: `claude-sonnet-4-6`
- Channel: Telegram (tmux session `claude-telegram`)

### Claude Code Sub-Agents (on-demand)
Invoked via `~/.claude/agents/run_agent.sh`:

| Agent | Directory | Model | Task Domain |
|-------|-----------|-------|-------------|
| Argus | `home-infra` | claude-sonnet-4-6 | HA control, Proxmox, NAS, UniFi, AdGuard |
| Vesper | `personal-assistant` | claude-sonnet-4-6 | Calendar, Gmail, scheduling |
| Sage | `research` | claude-haiku-4-5-20251001 | Web lookups, article summaries |
| Forge | `dev` | claude-sonnet-4-6 | Code, GitHub, deployments |
| Echo | `memory` | claude-haiku-4-5-20251001 | Memory updates, preference extraction |

## Data Sources
- `~/.claude/projects/**/*.jsonl` — Claude Code token usage logs
- `~/.claude/channels/telegram/model-switch.log` — activity log
- `~/.claude/channels/telegram/model.env` — current model (haiku/sonnet)
- `~/Library/LaunchAgents/*.plist` — scheduled LaunchAgent jobs
- `crontab -l` — cron jobs

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
| `POST /api/action` | Restart session or switch model |

## Key Files
- `server.js` — Express server + all API routes
- `start.sh` — managed startup script (installs deps, builds frontend, starts server)
- `frontend/src/App.tsx` — React app root
- `frontend/src/pages/` — Dashboard, Activity, Crons, Plugins, Skills pages
- `frontend/src/components/` — Shared Card component
