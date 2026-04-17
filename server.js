'use strict';
const express = require('express');
const path = require('path');

// Import our config modules
const config = require('./src/config');
const status = require('./src/status');
const ops = require('./src/mission-control-data');

const app = express();
const PORT = process.env.PORT || 3333;
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';

// Middleware
app.use(express.json());
app.use(express.static('public'));

// CORS for local development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// API Routes

// GET /api/status - Main status endpoint
app.get('/api/status', (req, res) => {
  try {
    const statusData = status.buildStatus(config);
    res.json(statusData);
  } catch (e) {
    console.error('[API /status]', e.message);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// GET /api/models - List configured models
app.get('/api/models', (req, res) => {
  try {
    const models = config.getModels();
    res.json(models);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get models' });
  }
});

// GET /api/plugins - List active plugins
app.get('/api/plugins', (req, res) => {
  try {
    const plugins = config.getPlugins();
    res.json(plugins);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get plugins' });
  }
});

// GET /api/skills - List all skills
app.get('/api/skills', (req, res) => {
  try {
    const skills = config.getSkills();
    res.json(skills);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get skills' });
  }
});

// GET /api/cron - List cron jobs
app.get('/api/cron', async (req, res) => {
  try {
    const result = status.getCronJobs();
    // Handle nested response from openclaw cron list: { jobs: [...], total, offset, ... }
    const jobsArray = Array.isArray(result) ? result : (result.jobs || []);
    res.json({ jobs: jobsArray, count: jobsArray.length });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get cron jobs' });
  }
});

app.post('/api/actions/:action', (req, res) => {
  try {
    const result = ops.handleAction(req.params.action, req.body || {});
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to run action', details: e.message });
  }
});

app.get('/api/sessions/active', (req, res) => {
  try {
    res.json(ops.getActiveSessions());
  } catch (e) {
    res.status(500).json({ error: 'Failed to get active sessions' });
  }
});

app.post('/api/sessions/:id/kill', (req, res) => {
  try {
    const result = ops.killSession(req.params.id, req.body || {});
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to kill session', details: e.message });
  }
});

app.get('/api/memory', (req, res) => {
  try {
    res.json(ops.searchMemory(req.query.q || ''));
  } catch (e) {
    res.status(500).json({ error: 'Failed to search memory' });
  }
});

app.get('/api/limits', (req, res) => {
  try {
    const snapshot = ops.getUsageBaseline();
    res.json({
      ...snapshot,
      alerts: ops.buildAlertFeed()
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get limits' });
  }
});

app.get('/api/health/timeline', (req, res) => {
  try {
    res.json({
      ...ops.getHealthTimeline(),
      alerts: ops.buildAlertFeed()
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get health timeline' });
  }
});

app.post('/api/sandbox/web-search', (req, res) => {
  try {
    res.json(ops.mockWebSearch(req.body?.query || req.query?.q || ''));
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to run sandbox web search', details: e.message });
  }
});

app.post('/api/sandbox/exec', (req, res) => {
  try {
    res.json(ops.mockExecTest(req.body?.command || ''));
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to test command', details: e.message });
  }
});

// POST /api/settings/model - Set default model
app.post('/api/settings/model', (req, res) => {
  try {
    const { modelId } = req.body || {};
    if (!modelId || typeof modelId !== 'string') {
      return res.status(400).json({ error: 'modelId is required' });
    }

    const result = config.setDefaultModel(modelId);
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Failed to set default model' });
    }

    res.json({ success: true, modelId });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update default model' });
  }
});

// POST /api/settings/plugin - Toggle plugin enabled state
app.post('/api/settings/plugin', (req, res) => {
  try {
    const { pluginName, enabled } = req.body || {};
    if (!pluginName || typeof pluginName !== 'string') {
      return res.status(400).json({ error: 'pluginName is required' });
    }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    const result = config.togglePlugin(pluginName, enabled);
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Failed to toggle plugin' });
    }

    res.json({ success: true, pluginName, enabled });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update plugin settings' });
  }
});

// GET /api/config - Raw config (sanitized)
app.get('/api/config', (req, res) => {
  try {
    const safeConfig = {
      agentName: config.agentName,
      workspace: config.WORKSPACE,
      gatewayPort: config.GATEWAY_PORT,
      models: config.getModels(),
      plugins: config.getPlugins(),
      skillsCount: config.getSkills().length
    };
    res.json(safeConfig);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get config' });
  }
});

// GET /api/agents - Agent configs, security assessment and health
app.get('/api/agents', (req, res) => {
  try {
    const agents = config.getAgents();
    res.json({ agents, count: agents.length });
  } catch (e) {
    console.error('[API /agents]', e.message);
    res.status(500).json({ error: 'Failed to get agents' });
  }
});

// Serve the main HTML page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server when run directly. Allow `require('./server')` for in-process verification.
if (require.main === module) {
  app.listen(PORT, BIND_HOST, () => {
    console.log(`\n╔═══════════════════════════════════════╗`);
    console.log(`║    Mission Control v2.0 for OpenClaw  ║`);
    console.log(`╠═══════════════════════════════════════╣`);
    console.log(`║  Agent:  ${config.agentName.padEnd(27)} ║`);
    console.log(`║  URL:    http://${BIND_HOST}:${PORT}${' '.repeat(11)} ║`);
    console.log(`╚═══════════════════════════════════════╝\n`);
  });
}

module.exports = app;
