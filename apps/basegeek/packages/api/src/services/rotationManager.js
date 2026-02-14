import fs from 'fs';
import path from 'path';

const DEFAULT_STATE = {
  providers: {
    groq: { remainingRequests: null, remainingTokens: null, lastUpdated: null },
    cerebras: { remainingRequests: null, remainingTokens: null, lastUpdated: null },
    together: { remainingRequests: null, remainingTokens: null, lastUpdated: null },
    openrouter: { remainingRequests: null, remainingTokens: null, lastUpdated: null },
    cloudflare: { remainingRequests: null, remainingTokens: null, lastUpdated: null },
    ollama: { remainingRequests: null, remainingTokens: null, lastUpdated: null },
    llmgateway: { remainingRequests: null, remainingTokens: null, lastUpdated: null }
  },
  activeProvider: 'groq'
};

const ROTATION_PRIORITY = ['groq', 'cerebras', 'together', 'openrouter', 'cloudflare', 'ollama', 'llmgateway'];

const PROVIDER_LIMITS = {
  groq: { rpm: 30, rpd: 1000, tpm: 6000 },
  cerebras: { rpm: 10, tpm: 150000, tpd: 1000000 },
  together: { rpm: 600, tpm: 180000 },
  openrouter: { rpm: 20, rpd: 50 },
  cloudflare: { rpm: 300, dailyNeurons: 10000 },
  ollama: { hourly: 1000 },
  llmgateway: { rpm: 20 }
};

export default class RotationManager {
  constructor(stateFilePath) {
    this.stateFilePath = stateFilePath || path.join(process.cwd(), 'rotation-state.json');
    this.state = this.loadState();
  }

  loadState() {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_STATE, ...parsed };
      }
    } catch (error) {
      console.error('[RotationManager] Failed to load state:', error.message);
    }
    return { ...DEFAULT_STATE };
  }

  persistState() {
    try {
      fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (error) {
      console.error('[RotationManager] Failed to persist state:', error.message);
    }
  }

  recordUsage(provider, { requests = 1, tokens = 0 } = {}) {
    if (!this.state.providers[provider]) {
      this.state.providers[provider] = { remainingRequests: null, remainingTokens: null, lastUpdated: null };
    }
    const entry = this.state.providers[provider];

    if (entry.remainingRequests !== null) {
      entry.remainingRequests = Math.max(0, entry.remainingRequests - requests);
    }

    if (entry.remainingTokens !== null) {
      entry.remainingTokens = Math.max(0, entry.remainingTokens - tokens);
    }

    entry.lastUpdated = new Date().toISOString();

    if (!entry.requestsUsed) entry.requestsUsed = 0;
    if (!entry.tokensUsed) entry.tokensUsed = 0;
    entry.requestsUsed += requests;
    entry.tokensUsed += tokens;

    this.persistState();
  }

  updateRemaining(provider, { remainingRequests, remainingTokens }) {
    if (!this.state.providers[provider]) {
      this.state.providers[provider] = { remainingRequests: null, remainingTokens: null, lastUpdated: null };
    }

    const entry = this.state.providers[provider];
    if (typeof remainingRequests === 'number') {
      entry.remainingRequests = remainingRequests;
    }
    if (typeof remainingTokens === 'number') {
      entry.remainingTokens = remainingTokens;
    }
    entry.lastUpdated = new Date().toISOString();
    this.persistState();
  }

  markProviderCooling(provider, cooldownMs) {
    if (!this.state.cooldowns) this.state.cooldowns = {};
    this.state.cooldowns[provider] = Date.now() + cooldownMs;
    this.persistState();
  }

  isCooling(provider) {
    if (!this.state.cooldowns || !this.state.cooldowns[provider]) return false;
    if (Date.now() > this.state.cooldowns[provider]) {
      delete this.state.cooldowns[provider];
      this.persistState();
      return false;
    }
    return true;
  }

  selectProvider() {
    for (const provider of ROTATION_PRIORITY) {
      if (this.isCooling(provider)) continue;

      const limits = PROVIDER_LIMITS[provider];
      const entry = this.state.providers[provider];

      if (entry) {
        if (typeof entry.remainingRequests === 'number' && entry.remainingRequests <= 0) {
          continue;
        }
        if (typeof entry.remainingTokens === 'number' && entry.remainingTokens <= 0) {
          continue;
        }
      }

      this.state.activeProvider = provider;
      this.persistState();
      return { provider, limits };
    }

    return { provider: ROTATION_PRIORITY[0], limits: PROVIDER_LIMITS[ROTATION_PRIORITY[0]], fallback: true };
  }

  getState() {
    return this.state;
  }

  getPriorityList() {
    return [...ROTATION_PRIORITY];
  }

  resetProviderUsage(provider) {
    if (this.state.providers[provider]) {
      this.state.providers[provider].requestsUsed = 0;
      this.state.providers[provider].tokensUsed = 0;
      this.persistState();
    }
  }
}
