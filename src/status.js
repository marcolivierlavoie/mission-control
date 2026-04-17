'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { OPENCLAW_DIR, WORKSPACE } = require('./config');

// Get latest session model
function getLatestSessionModel() {
  try {
    const sessionsPath = path.join(OPENCLAW_DIR, 'agents/main/sessions/sessions.json');
    if (!fs.existsSync(sessionsPath)) return null;

    const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
    
    let mostRecent = null;
    let latestTime = 0;

    for (const [key, session] of Object.entries(sessions)) {
      if (!session.updatedAt) continue;
      const t = new Date(session.updatedAt).getTime();
      if (t > latestTime) {
        latestTime = t;
        mostRecent = session;
      }
    }

    return mostRecent?.model || null;
  } catch (e) {
    return null;
  }
}

// Get memory stats
function getMemoryStats() {
  try {
    const memoryPath = path.join(WORKSPACE, 'memory');
    if (!fs.existsSync(memoryPath)) return { files: 0, chunks: 0 };

    const files = fs.readdirSync(memoryPath)
      .filter(f => f.endsWith('.md'))
      .length;

    return { files, chunks: files }; // Simplified
  } catch (e) {
    return { files: 0, chunks: 0 };
  }
}

// Get cron jobs
function getCronJobs() {
  try {
    const output = execSync('openclaw cron list --json 2>/dev/null', { 
      encoding: 'utf8',
      timeout: 5000 
    });
    return JSON.parse(output);
  } catch (e) {
    return [];
  }
}

// Build status response
function buildStatus(config) {
  const latestModel = getLatestSessionModel();
  const memoryStats = getMemoryStats();
  const cronJobs = getCronJobs();

  return {
    agent: {
      name: `${config.agentName} Control`,
      status: 'active',
      model: latestModel || config.openclawConfig.agents?.defaults?.model?.primary || 'unknown',
      defaultModel: config.openclawConfig.agents?.defaults?.model?.primary,
      workspace: config.WORKSPACE,
      totalAgents: config.openclawConfig.agents?.list?.length || 1,
      memoryFiles: memoryStats.files,
      memoryChunks: memoryStats.chunks
    },
    system: {
      openclawVersion: '2026.4.14',
      gatewayPort: config.GATEWAY_PORT,
      gatewayConnected: true,
      cronJobs: cronJobs.length
    },
    config: {
      models: config.getModels(),
      plugins: config.getPlugins(),
      skills: config.getSkills()
    }
  };
}

module.exports = {
  buildStatus,
  getLatestSessionModel,
  getMemoryStats,
  getCronJobs
};