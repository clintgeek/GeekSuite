import mongoose from 'mongoose';
import { getAIGeekConnection } from '../config/database.js';
import crypto from 'crypto';

const apiKeySchema = new mongoose.Schema({
  keyId: {
    type: String,
    required: true,
    unique: true,
    default: () => crypto.randomUUID()
  },
  keyHash: {
    type: String,
    required: true,
    unique: true
  },
  keyPrefix: {
    type: String,
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  appName: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  permissions: {
    type: [String],
    default: ['ai:call', 'ai:models', 'ai:providers'],
    validate: {
      validator: function(permissions) {
        const validPermissions = [
          'ai:call',
          'ai:models',
          'ai:providers',
          'ai:stats',
          'ai:director',
          'ai:usage'
        ];
        return permissions.every(perm => validPermissions.includes(perm));
      },
      message: 'Invalid permission specified'
    }
  },
  rateLimit: {
    requestsPerMinute: {
      type: Number,
      default: 60,
      min: 1,
      max: 1000
    },
    requestsPerHour: {
      type: Number,
      default: 1000,
      min: 1,
      max: 10000
    },
    requestsPerDay: {
      type: Number,
      default: 10000,
      min: 1,
      max: 100000
    }
  },
  usage: {
    totalRequests: {
      type: Number,
      default: 0
    },
    lastUsed: {
      type: Date
    },
    requestsToday: {
      type: Number,
      default: 0
    },
    requestsThisHour: {
      type: Number,
      default: 0
    },
    requestsThisMinute: {
      type: Number,
      default: 0
    },
    lastResetDate: {
      type: Date,
      default: Date.now
    },
    lastResetHour: {
      type: Number,
      default: () => new Date().getHours()
    },
    lastResetMinute: {
      type: Number,
      default: () => new Date().getMinutes()
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  expiresAt: {
    type: Date,
    default: null // null means no expiration
  },
  createdBy: {
    type: String,
    required: true
  },
  lastModifiedBy: {
    type: String
  }
}, {
  timestamps: true
});

// Index for efficient lookups
apiKeySchema.index({ keyPrefix: 1, isActive: 1 });
apiKeySchema.index({ appName: 1, isActive: 1 });
apiKeySchema.index({ createdBy: 1 });
apiKeySchema.index({ expiresAt: 1 });

// Static method to generate API key
apiKeySchema.statics.generateAPIKey = function() {
  const prefix = 'bg'; // baseGeek prefix
  const randomPart = crypto.randomBytes(32).toString('hex');
  const apiKey = `${prefix}_${randomPart}`;
  const keyPrefix = `${prefix}_${randomPart.substring(0, 8)}`;
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  return {
    apiKey,
    keyPrefix,
    keyHash
  };
};

// Static method to hash API key for comparison
apiKeySchema.statics.hashAPIKey = function(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
};

// Method to check if API key is expired
apiKeySchema.methods.isExpired = function() {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

// Method to check rate limits
apiKeySchema.methods.checkRateLimit = function() {
  const now = new Date();
  const currentMinute = now.getMinutes();
  const currentHour = now.getHours();
  const currentDate = now.toDateString();

  // Reset counters if needed
  if (this.usage.lastResetDate.toDateString() !== currentDate) {
    this.usage.requestsToday = 0;
    this.usage.requestsThisHour = 0;
    this.usage.requestsThisMinute = 0;
    this.usage.lastResetDate = now;
    this.usage.lastResetHour = currentHour;
    this.usage.lastResetMinute = currentMinute;
  } else if (this.usage.lastResetHour !== currentHour) {
    this.usage.requestsThisHour = 0;
    this.usage.requestsThisMinute = 0;
    this.usage.lastResetHour = currentHour;
    this.usage.lastResetMinute = currentMinute;
  } else if (this.usage.lastResetMinute !== currentMinute) {
    this.usage.requestsThisMinute = 0;
    this.usage.lastResetMinute = currentMinute;
  }

  // Check limits
  if (this.usage.requestsThisMinute >= this.rateLimit.requestsPerMinute) {
    return { allowed: false, reason: 'Rate limit exceeded: requests per minute' };
  }
  if (this.usage.requestsThisHour >= this.rateLimit.requestsPerHour) {
    return { allowed: false, reason: 'Rate limit exceeded: requests per hour' };
  }
  if (this.usage.requestsToday >= this.rateLimit.requestsPerDay) {
    return { allowed: false, reason: 'Rate limit exceeded: requests per day' };
  }

  return { allowed: true };
};

// Method to increment usage counters
apiKeySchema.methods.incrementUsage = function() {
  this.usage.totalRequests += 1;
  this.usage.requestsToday += 1;
  this.usage.requestsThisHour += 1;
  this.usage.requestsThisMinute += 1;
  this.usage.lastUsed = new Date();
};

// Method to check permissions
apiKeySchema.methods.hasPermission = function(permission) {
  return this.permissions.includes(permission);
};

// Use aiGeek database connection
const aiGeekConnection = getAIGeekConnection();
const APIKey = aiGeekConnection.model('APIKey', apiKeySchema);

export default APIKey;