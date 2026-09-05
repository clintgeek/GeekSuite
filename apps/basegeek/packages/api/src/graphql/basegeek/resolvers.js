import APIKey from '../../models/APIKey.js';
import AIConfig from '../../models/AIConfig.js';
import { encrypt } from '../../lib/cryptoVault.js';
import AIPricing from '../../models/AIPricing.js';
import AIFreeTier from '../../models/AIFreeTier.js';
import AIAppConfig from '../../models/AIAppConfig.js';
import aiService from '../../services/aiService.js';
import aiDirectorService from '../../services/aiDirectorService.js';
import aiUsageService from '../../services/aiUsageService.js';
import { User } from '../../models/user.js';
import { GraphQLError } from 'graphql';

const requireAuth = (user) => {
  if (!user) {
    throw new GraphQLError('Authentication required', {
      extensions: { code: 'UNAUTHENTICATED' }
    });
  }
};

/**
 * requireAdminUser — the GraphQL half of the admin gate on aiGeek.
 *
 * Same rule and same source of truth as the REST `requireRole('admin')`: the
 * role is read from the userGeek document on every call, never from the JWT,
 * so a promotion or demotion lands without a re-login. The thrown shape
 * mirrors the REST body — `admin role required`, code ADMIN_REQUIRED, and the
 * `admin_required` error tag — so a client can branch on one thing across both
 * transports.
 *
 * API keys are refused before the lookup: a key belongs to an app, carries no
 * user document, and its synthetic `apikey_<id>` id is not an ObjectId.
 */
const requireAdminUser = async (user) => {
  requireAuth(user);

  const deny = () => {
    throw new GraphQLError('admin role required', {
      extensions: { code: 'ADMIN_REQUIRED', error: 'admin_required' }
    });
  };

  if (user.type === 'api_key') deny();

  const record = await User.findById(user.id).select('role').lean();
  if (!record || (record.role || 'user') !== 'admin') deny();
};

/**
 * The providers the AI config query and mutation cover. Kept in step with the
 * REST twin in routes/aiRoutes.js by hand for now — worth hoisting to a shared
 * config module the next time either list changes.
 */
const CONFIG_PROVIDERS = [
  'anthropic', 'groq', 'gemini', 'together', 'cohere', 'openrouter',
  'cerebras', 'cloudflare', 'ollama', 'llm7', 'llmgateway', 'onemin'
];

/** The only part of a provider credential that leaves the server. */
const keyHintFor = (plaintext) => {
  if (typeof plaintext !== 'string' || plaintext.length < 4) return '';
  return `…${plaintext.slice(-4)}`;
};

export const resolvers = {
  Query: {
    // ----------------------------------------------------------------------
    // API Keys
    // ----------------------------------------------------------------------
    apiKeys: async (_, __, { user }) => {
      requireAuth(user);
      const apiKeys = await APIKey.find({
        createdBy: user.id,
        isActive: true
      }).select('-keyHash').sort({ createdAt: -1 });

      return apiKeys.map(key => ({
        id: key.keyId,
        name: key.name,
        appName: key.appName,
        description: key.description,
        keyPrefix: key.keyPrefix,
        permissions: key.permissions,
        rateLimit: key.rateLimit,
        usage: key.usage,
        isActive: key.isActive,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
        isExpired: key.isExpired()
      }));
    },
    
    apiKeysAppsList: async (_, __, { user }) => {
      requireAuth(user);
      const apps = await APIKey.aggregate([
        {
          $match: {
            createdBy: user.id,
            isActive: true
          }
        },
        {
          $group: {
            _id: '$appName',
            keyCount: { $sum: 1 },
            totalRequests: { $sum: '$usage.totalRequests' },
            lastUsed: { $max: '$usage.lastUsed' }
          }
        },
        {
          $project: {
            appName: '$_id',
            keyCount: 1,
            totalRequests: 1,
            lastUsed: 1,
            _id: 0
          }
        },
        {
          $sort: { appName: 1 }
        }
      ]);
      return apps;
    },

    apiKey: async (_, { id }, { user }) => {
      requireAuth(user);
      const key = await APIKey.findOne({
        keyId: id,
        createdBy: user.id,
        isActive: true
      }).select('-keyHash');
      
      if (!key) throw new GraphQLError('API key not found');
      
      return {
        id: key.keyId,
        name: key.name,
        appName: key.appName,
        description: key.description,
        keyPrefix: key.keyPrefix,
        permissions: key.permissions,
        rateLimit: key.rateLimit,
        usage: key.usage,
        isActive: key.isActive,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
        isExpired: key.isExpired()
      };
    },

    // ----------------------------------------------------------------------
    // AI Geek
    // ----------------------------------------------------------------------
    aiConfig: async (_, __, { user }) => {
      await requireAdminUser(user);
      const configs = await AIConfig.find({});

      // Masked, exactly as the REST /api/ai/config does: { hasKey, keyHint,
      // enabled } per provider and never the credential itself.
      const config = {};
      for (const provider of CONFIG_PROVIDERS) {
        config[provider] = { hasKey: false, keyHint: '', enabled: false };
      }
      config.cloudflare.accountId = '';

      for (const dbConfig of configs) {
        if (!config[dbConfig.provider]) continue;
        const key = dbConfig.getDecryptedKey() ?? '';
        config[dbConfig.provider].hasKey = Boolean(key);
        config[dbConfig.provider].keyHint = keyHintFor(key);
        config[dbConfig.provider].enabled = dbConfig.enabled;
        if (dbConfig.provider === 'cloudflare' && dbConfig.accountId) {
          config[dbConfig.provider].accountId = dbConfig.accountId;
        }
      }
      return config;
    },

    aiStats: async (_, __, { user }) => {
      requireAuth(user);
      return aiService.getSessionStats();
    },

    aiDirectorModels: async (_, __, { user }) => {
      requireAuth(user);
      const result = await aiDirectorService.collectModelInformation();
      if (!result.success) throw new GraphQLError(result.error?.message || 'Failed to collect model info');
      return result.data;
    },

    aiUsage: async (_, { provider }, { user }) => {
      requireAuth(user);
      const usageSummary = await aiUsageService.getProviderUsageSummary(provider, 'session');
      if (!usageSummary.success) throw new GraphQLError(usageSummary.error || 'Failed to get usage summary');
      return usageSummary.summary;
    },

    // App Routing
    aiAppConfigs: async (_, __, { user }) => {
      requireAuth(user);
      const configs = await AIAppConfig.find().sort({ appName: 1 });
      const knownApps = new Set(configs.map(c => c.appName));
      const discoveredApps = [];

      // Discover apps from API keys (persistent — survives restarts)
      const apiKeys = await APIKey.find({ isActive: true }).select('appName');
      for (const key of apiKeys) {
        if (key.appName && key.appName !== 'unknown' && !knownApps.has(key.appName)) {
          knownApps.add(key.appName);
          discoveredApps.push(key.appName);
        }
      }

      // Also check session stats for apps that called without API keys (JWT auth)
      const stats = aiService.getSessionStats();
      if (stats?.providerUsage) {
        for (const providerData of Object.values(stats.providerUsage)) {
          if (providerData.appUsage) {
            for (const appName of Object.keys(providerData.appUsage)) {
              if (appName !== 'unknown' && !knownApps.has(appName)) {
                knownApps.add(appName);
                discoveredApps.push(appName);
              }
            }
          }
        }
      }
      return { configs, discoveredApps };
    },

    aiAppConfig: async (_, { appName }, { user }) => {
      requireAuth(user);
      return await AIAppConfig.findOne({ appName });
    }
  },

  Mutation: {
    // ----------------------------------------------------------------------
    // API Keys
    // ----------------------------------------------------------------------
    createAPIKey: async (_, { name, appName, description, permissions = ['ai:call', 'ai:models', 'ai:providers'], rateLimit, expiresAt }, { user }) => {
      requireAuth(user);
      if (!name || !appName) throw new GraphQLError('Name and app name are required');
      if (!/^[a-zA-Z0-9_-]+$/.test(appName)) throw new GraphQLError('App name can only contain letters, numbers, hyphens, and underscores');

      const { apiKey, keyPrefix, keyHash } = APIKey.generateAPIKey();

      const apiKeyDoc = new APIKey({
        keyHash,
        keyPrefix,
        name: name.trim(),
        appName: appName.trim(),
        description: description?.trim(),
        permissions,
        rateLimit: {
          requestsPerMinute: rateLimit?.requestsPerMinute || 60,
          requestsPerHour: rateLimit?.requestsPerHour || 1000,
          requestsPerDay: rateLimit?.requestsPerDay || 10000
        },
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy: user.id
      });

      try {
        await apiKeyDoc.save();
        return {
          apiKey,
          keyInfo: {
            id: apiKeyDoc.keyId,
            name: apiKeyDoc.name,
            appName: apiKeyDoc.appName,
            description: apiKeyDoc.description,
            keyPrefix: apiKeyDoc.keyPrefix,
            permissions: apiKeyDoc.permissions,
            rateLimit: apiKeyDoc.rateLimit,
            expiresAt: apiKeyDoc.expiresAt,
            createdAt: apiKeyDoc.createdAt
          }
        };
      } catch (err) {
        if (err.code === 11000) throw new GraphQLError('An API key with this configuration already exists');
        throw new GraphQLError('Failed to create API key');
      }
    },

    updateAPIKey: async (_, { id, name, description, permissions, rateLimit, expiresAt, isActive }, { user }) => {
      requireAuth(user);
      const apiKeyDoc = await APIKey.findOne({ keyId: id, createdBy: user.id, isActive: true });
      if (!apiKeyDoc) throw new GraphQLError('API key not found');

      if (name !== undefined) apiKeyDoc.name = name.trim();
      if (description !== undefined) apiKeyDoc.description = description?.trim();
      if (permissions !== undefined) apiKeyDoc.permissions = permissions;
      if (rateLimit !== undefined) {
        apiKeyDoc.rateLimit = {
          requestsPerMinute: rateLimit.requestsPerMinute || apiKeyDoc.rateLimit.requestsPerMinute,
          requestsPerHour: rateLimit.requestsPerHour || apiKeyDoc.rateLimit.requestsPerHour,
          requestsPerDay: rateLimit.requestsPerDay || apiKeyDoc.rateLimit.requestsPerDay
        };
      }
      if (expiresAt !== undefined) apiKeyDoc.expiresAt = expiresAt ? new Date(expiresAt) : null;
      if (isActive !== undefined) apiKeyDoc.isActive = isActive;
      
      apiKeyDoc.lastModifiedBy = user.id;
      await apiKeyDoc.save();

      return {
        id: apiKeyDoc.keyId,
        name: apiKeyDoc.name,
        appName: apiKeyDoc.appName,
        description: apiKeyDoc.description,
        keyPrefix: apiKeyDoc.keyPrefix,
        permissions: apiKeyDoc.permissions,
        rateLimit: apiKeyDoc.rateLimit,
        usage: apiKeyDoc.usage,
        isActive: apiKeyDoc.isActive,
        expiresAt: apiKeyDoc.expiresAt,
        createdAt: apiKeyDoc.createdAt,
        updatedAt: apiKeyDoc.updatedAt,
        isExpired: apiKeyDoc.isExpired()
      };
    },

    deleteAPIKey: async (_, { id }, { user }) => {
      requireAuth(user);
      const apiKeyDoc = await APIKey.findOne({ keyId: id, createdBy: user.id, isActive: true });
      if (!apiKeyDoc) throw new GraphQLError('API key not found');

      apiKeyDoc.isActive = false;
      apiKeyDoc.lastModifiedBy = user.id;
      await apiKeyDoc.save();

      return { success: true, message: 'API key deleted successfully' };
    },

    regenerateAPIKey: async (_, { id }, { user }) => {
      requireAuth(user);
      const apiKeyDoc = await APIKey.findOne({ keyId: id, createdBy: user.id, isActive: true });
      if (!apiKeyDoc) throw new GraphQLError('API key not found');

      const { apiKey, keyPrefix, keyHash } = APIKey.generateAPIKey();
      
      apiKeyDoc.keyHash = keyHash;
      apiKeyDoc.keyPrefix = keyPrefix;
      apiKeyDoc.lastModifiedBy = user.id;
      
      apiKeyDoc.usage = {
        totalRequests: 0,
        lastUsed: null,
        requestsToday: 0,
        requestsThisHour: 0,
        requestsThisMinute: 0,
        lastResetDate: new Date(),
        lastResetHour: new Date().getHours(),
        lastResetMinute: new Date().getMinutes()
      };

      await apiKeyDoc.save();

      return {
        apiKey,
        keyInfo: {
          id: apiKeyDoc.keyId,
          name: apiKeyDoc.name,
          appName: apiKeyDoc.appName,
          keyPrefix: apiKeyDoc.keyPrefix,
          updatedAt: apiKeyDoc.updatedAt
        }
      };
    },

    // ----------------------------------------------------------------------
    // AI Geek
    // ----------------------------------------------------------------------
    saveAIConfig: async (_, { config }, { user }) => {
      await requireAdminUser(user);

      // A blank apiKey means "keep the stored one" — the client can no longer
      // read it back to echo it. enabled/accountId are written either way; the
      // old shape skipped the whole entry without a key, so toggling Enabled
      // on a configured provider silently did nothing.
      const providersToUpdate = CONFIG_PROVIDERS
        .filter(provider => config[provider] && typeof config[provider] === 'object')
        .map(provider => ({ provider, ...config[provider] }));

      for (const providerConfig of providersToUpdate) {
        const newKey = typeof providerConfig.apiKey === 'string' ? providerConfig.apiKey.trim() : '';
        const hasNewKey = newKey !== '' && newKey !== '***';

        const updateData = { enabled: providerConfig.enabled || false };
        if (providerConfig.provider === 'cloudflare' && providerConfig.accountId) {
          updateData.accountId = providerConfig.accountId.trim();
        }

        if (hasNewKey) {
          updateData.apiKey = encrypt(newKey); // encrypt before persisting
          await AIConfig.findOneAndUpdate(
            { provider: providerConfig.provider },
            updateData,
            { upsert: true, new: true }
          );
        } else {
          // No upsert without a key: AIConfig.apiKey is required.
          await AIConfig.updateOne({ provider: providerConfig.provider }, { $set: updateData });
        }
      }

      await aiService.loadConfigurations();
      return { success: true };
    },

    testAIProvider: async (_, { provider }, { user }) => {
      await requireAdminUser(user);
      const providerConfig = aiService.providers[provider];
      if (!providerConfig || !providerConfig.apiKey) throw new GraphQLError('Provider not supported or API key not configured');

      const testPrompt = 'Hello, this is a test message. Please respond with "OK" if you receive this.';
      const result = await aiService.callProvider(provider, testPrompt, { maxTokens: 10, appName: 'graphql-test' });

      if (result && result.content && result.content.toLowerCase().includes('ok')) {
        return true;
      }
      return false; // Could also return true since response was received depending on how strict we want to be
    },

    resetAIStats: async (_, __, { user }) => {
      await requireAdminUser(user);
      aiService.resetSessionStats();
      return true;
    },

    seedDirectorPricing: async (_, __, { user }) => {
      await requireAdminUser(user);
      await aiDirectorService.seedInitialPricing();
      return true;
    },

    seedDirectorFreeTier: async (_, __, { user }) => {
      await requireAdminUser(user);
      await aiDirectorService.seedFreeTierInformation();
      return true;
    },

    // Model Management
    syncProviderModels: async (_, { provider }, { user }) => {
      await requireAdminUser(user);
      try {
        const models = await aiService.refreshModels(provider);
        // Also update pricing for any new models
        await aiDirectorService.updatePricingForNewModels();
        return { success: true, provider, modelsFound: models.length, models };
      } catch (error) {
        throw new GraphQLError(`Failed to sync models for ${provider}: ${error.message}`);
      }
    },

    updateModelPricing: async (_, { provider, modelId, inputPrice, outputPrice }, { user }) => {
      await requireAdminUser(user);
      const pricing = await AIPricing.findOneAndUpdate(
        { provider, modelId },
        { inputPrice, outputPrice, lastUpdated: new Date(), isActive: true },
        { upsert: true, new: true }
      );
      return { success: true, pricing: { provider, modelId, inputPrice: pricing.inputPrice, outputPrice: pricing.outputPrice } };
    },

    deleteModelPricing: async (_, { provider, modelId }, { user }) => {
      await requireAdminUser(user);
      await AIPricing.deleteOne({ provider, modelId });
      return true;
    },

    updateModelFreeTier: async (_, { provider, modelId, isFree, freeLimits, notes }, { user }) => {
      await requireAdminUser(user);
      const freeTier = await AIFreeTier.findOneAndUpdate(
        { provider, modelId },
        {
          isFree,
          freeLimits: freeLimits || {},
          notes: notes || '',
          lastUpdated: new Date()
        },
        { upsert: true, new: true }
      );
      return { success: true, freeTier: { provider, modelId, isFree: freeTier.isFree, freeLimits: freeTier.freeLimits, notes: freeTier.notes } };
    },

    deleteModelFreeTier: async (_, { provider, modelId }, { user }) => {
      await requireAdminUser(user);
      await AIFreeTier.deleteOne({ provider, modelId });
      return true;
    },

    resetAllFreeTiers: async (_, __, { user }) => {
      await requireAdminUser(user);
      const result = await AIFreeTier.updateMany({}, { isFree: false, lastUpdated: new Date() });
      return result.modifiedCount;
    },

    bulkUpdateFreeTiers: async (_, { updates }, { user }) => {
      await requireAdminUser(user);
      const results = await Promise.all(
        updates.map(({ provider, modelId, isFree, freeLimits, notes }) =>
          AIFreeTier.findOneAndUpdate(
            { provider, modelId },
            { isFree, freeLimits: freeLimits || {}, notes: notes || '', lastUpdated: new Date() },
            { upsert: true, new: true }
          )
        )
      );
      return results.map(doc => ({
        provider: doc.provider,
        modelId: doc.modelId,
        isFree: doc.isFree,
        freeLimits: doc.freeLimits || null,
        notes: doc.notes || null
      }));
    },

    // App Routing
    saveAIAppConfig: async (_, { appName, config }, { user }) => {
      await requireAdminUser(user);
      if (!appName?.trim()) throw new GraphQLError('appName is required');
      const update = {
        appName: appName.trim(),
        displayName: config.displayName || '',
        tier: config.tier || 'free',
        provider: config.tier === 'specific' ? (config.provider || null) : null,
        model: config.tier === 'specific' ? (config.model || null) : null,
        fallbackOrder: config.fallbackOrder || [],
        maxTokens: config.maxTokens || null,
        temperature: config.temperature != null ? config.temperature : null,
        notes: config.notes || '',
        enabled: config.enabled !== false
      };
      const result = await AIAppConfig.findOneAndUpdate(
        { appName: appName.trim() },
        update,
        { upsert: true, new: true }
      );
      return result;
    },

    deleteAIAppConfig: async (_, { appName }, { user }) => {
      await requireAdminUser(user);
      await AIAppConfig.deleteOne({ appName });
      return true;
    }
  }
};
