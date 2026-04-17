'use strict';
const fs = require('fs');
const path = require('path');

const HOME_DIR = process.env.HOME || '/home/ubuntu';
const OPENCLAW_DIR = path.join(HOME_DIR, '.openclaw');
const OPENCLAW_CONFIG_PATH = path.join(OPENCLAW_DIR, 'openclaw.json');

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readTextSafe(filePath, fallback = '') {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

function listMarkdownFiles(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
      .map(entry => ({
        name: entry.name,
        path: path.join(dirPath, entry.name)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

// Read OpenClaw configuration
let openclawConfig = {};
try {
  openclawConfig = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
  console.log('[Config] Loaded OpenClaw config successfully');
} catch (e) {
  console.error('[Config] Failed to load openclaw.json:', e.message);
}

// Extract configuration values
const GATEWAY_PORT = openclawConfig.gateway?.port || 18789;
const GATEWAY_TOKEN = openclawConfig.gateway?.auth?.token || '';
const WORKSPACE = openclawConfig.agents?.defaults?.workspace || path.join(OPENCLAW_DIR, 'workspace');
const WORKSPACE_MEMORY_DIR = path.join(WORKSPACE, 'memory');

// Read agent identity
let agentName = 'Agent';
try {
  const identityPath = path.join(WORKSPACE, 'IDENTITY.md');
  const identity = fs.readFileSync(identityPath, 'utf8');
  const nameMatch = identity.match(/\*\*Name:\*\*\s*(.+)/);
  if (nameMatch) {
    agentName = nameMatch[1].trim();
  }
} catch (e) {
  // No identity file - use default
}

// Get models from config
function getModels() {
  const models = openclawConfig.agents?.defaults?.models || {};
  const primary = openclawConfig.agents?.defaults?.model?.primary;
  
  return Object.keys(models).map(id => ({
    id,
    name: id.split('/').pop() || id,
    provider: id.split('/')[0] || 'unknown',
    isDefault: id === primary
  }));
}

// Get active plugins
function getPlugins() {
  const plugins = openclawConfig.plugins?.entries || {};
  return Object.entries(plugins).map(([name, config]) => ({
    name,
    enabled: config.enabled !== false,
    description: `${name} integration`
  }));
}

// Scan for skills in all locations
function getSkills() {
  const skills = [];
  const skillPaths = [
    path.join(HOME_DIR, '.agents/skills'),
    path.join(WORKSPACE, 'skills'),
    '/usr/lib/node_modules/openclaw/skills',
    '/Users/marco/.npm-global/lib/node_modules/openclaw/skills'
  ];

  for (const skillPath of skillPaths) {
    if (!fs.existsSync(skillPath)) continue;
    
    try {
      const dirs = fs.readdirSync(skillPath, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const dir of dirs) {
        // Check if already added
        if (skills.some(s => s.name === dir)) continue;

        const fullPath = path.join(skillPath, dir);
        let description = 'Skill';
        
        // Try to read SKILL.md for description
        try {
          const skillMd = fs.readFileSync(path.join(fullPath, 'SKILL.md'), 'utf8');
          // Extract first paragraph after title
          const lines = skillMd.split('\n').filter(l => l.trim() && !l.startsWith('#'));
          if (lines.length) {
            description = lines[0].trim().substring(0, 100);
          }
        } catch {}

        const category = skillPath.includes('.agents') ? 'Agent' :
                        skillPath.includes('workspace') ? 'Workspace' : 'System';

        skills.push({
          name: dir,
          description,
          path: fullPath,
          category,
          enabled: true
        });
      }
    } catch (e) {
      console.error(`[Config] Error reading skills from ${skillPath}:`, e.message);
    }
  }

  return skills;
}

// Update default model
function setDefaultModel(modelId) {
  if (!openclawConfig.agents?.defaults?.models?.[modelId]) {
    return { success: false, error: 'Model not found in config' };
  }
  
  try {
    openclawConfig.agents.defaults.model.primary = modelId;
    fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(openclawConfig, null, 2));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Toggle plugin
function togglePlugin(pluginName, enabled) {
  if (!openclawConfig.plugins?.entries?.[pluginName]) {
    return { success: false, error: 'Plugin not found' };
  }
  
  try {
    openclawConfig.plugins.entries[pluginName].enabled = enabled;
    fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(openclawConfig, null, 2));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function buildSecurityAssessment(tools = [], sandboxMode = 'unknown') {
  const highRiskTools = new Set(['exec', 'process', 'browser', 'message', 'cron', 'sessions_send', 'sessions_spawn']);
  const mediumRiskTools = new Set(['write', 'edit', 'apply_patch', 'gateway', 'nodes', 'tts']);

  const hasHighRisk = tools.some(t => highRiskTools.has(t));
  const hasMediumRisk = tools.some(t => mediumRiskTools.has(t));
  const canRequestElevated = tools.includes('exec');
  const canExternalComm = tools.some(t => ['message', 'web_search', 'web_fetch', 'browser', 'tavily_search', 'tavily_extract'].includes(t));

  let level = 'low';
  if (hasHighRisk || sandboxMode === 'off') level = 'high';
  else if (hasMediumRisk) level = 'medium';

  return {
    level,
    sandboxMode,
    canRequestElevated,
    canExternalComm,
    toolCount: tools.length,
    highRiskTools: tools.filter(t => highRiskTools.has(t))
  };
}

function getAgents() {
  const agentsRoot = path.join(OPENCLAW_DIR, 'agents');
  const listedAgents = openclawConfig.agents?.list || [];
  const listedById = Object.fromEntries(listedAgents.map(a => [a.id, a]));

  let agentIds = [];
  try {
    agentIds = fs.readdirSync(agentsRoot, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort();
  } catch {
    agentIds = [];
  }

  // Include agents defined in config even if folder is missing
  for (const a of listedAgents) {
    if (a?.id && !agentIds.includes(a.id)) agentIds.push(a.id);
  }

  const results = [];

  for (const agentId of agentIds) {
    const configured = listedById[agentId] || (agentId === 'main' ? { id: 'main' } : null) || {};
    const agentPath = path.join(agentsRoot, agentId);
    const sessionsPath = path.join(agentPath, 'sessions', 'sessions.json');

    const sessions = readJsonSafe(sessionsPath, {}) || {};
    const relevantSessions = Object.entries(sessions)
      .filter(([key]) => key.startsWith(`agent:${agentId}:`));

    let latestSession = null;
    let latestUpdatedAt = 0;
    let failedCount = 0;

    for (const [, session] of relevantSessions) {
      const updatedAt = Number(session?.updatedAt) || 0;
      if ((session?.status || '').toLowerCase() === 'failed' || session?.abortedLastRun === true) {
        failedCount += 1;
      }
      if (updatedAt >= latestUpdatedAt) {
        latestUpdatedAt = updatedAt;
        latestSession = session;
      }
    }

    const latestToolEntries = latestSession?.systemPromptReport?.tools?.entries || [];
    const tools = latestToolEntries.map(t => t.name).filter(Boolean);
    const sandboxMode = latestSession?.systemPromptReport?.sandbox?.mode || 'unknown';
    const security = buildSecurityAssessment(tools, sandboxMode);

    const status = String(latestSession?.status || 'unknown').toLowerCase();
    const health = status === 'failed' || latestSession?.abortedLastRun
      ? 'degraded'
      : status === 'running'
        ? 'running'
        : status === 'done'
          ? 'healthy'
          : 'unknown';

    const model = configured.model
      || (agentId === 'main' ? openclawConfig.agents?.defaults?.model?.primary : null)
      || (latestSession?.modelProvider && latestSession?.model ? `${latestSession.modelProvider}/${latestSession.model}` : null)
      || 'unknown';

    results.push({
      id: agentId,
      name: configured.name || agentId,
      workspace: configured.workspace || path.join(OPENCLAW_DIR, 'workspace'),
      agentDir: configured.agentDir || path.join(agentPath, 'agent'),
      identity: configured.identity || null,
      configuredModel: configured.model || null,
      model,
      tools,
      security,
      health: {
        status: health,
        lastSessionId: latestSession?.sessionId || null,
        lastSessionAtMs: latestUpdatedAt || null,
        lastRunStatus: latestSession?.status || 'unknown',
        runtimeMs: latestSession?.runtimeMs ?? null,
        errorCount: failedCount,
        abortedLastRun: !!latestSession?.abortedLastRun
      }
    });
  }

  return results;
}

module.exports = {
  HOME_DIR,
  OPENCLAW_DIR,
  OPENCLAW_CONFIG_PATH,
  GATEWAY_PORT,
  GATEWAY_TOKEN,
  WORKSPACE,
  WORKSPACE_MEMORY_DIR,
  agentName,
  openclawConfig,
  readJsonSafe,
  readTextSafe,
  listMarkdownFiles,
  getModels,
  getPlugins,
  getSkills,
  setDefaultModel,
  togglePlugin,
  getAgents
};
