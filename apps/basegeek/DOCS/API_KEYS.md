# API Key Authentication System for aiGeek

This document describes the API key authentication system that allows external applications to access the aiGeek AI services without requiring user authentication.

## Overview

The API key system provides:
- **Secure Authentication**: API keys are hashed and stored securely
- **Permission-based Access**: Fine-grained permissions for different AI operations
- **Rate Limiting**: Configurable rate limits per API key
- **Usage Tracking**: Monitor API key usage and statistics
- **Multi-app Support**: Organize API keys by application
- **Web Interface**: Easy management through the BaseGeek UI

## Features

### API Key Management
- Create, edit, and delete API keys
- Regenerate API keys when needed
- Set expiration dates
- Enable/disable API keys
- Organize by application name

### Permissions System
Available permissions:
- `ai:call` - Make AI API calls
- `ai:models` - Access model information
- `ai:providers` - Access provider information
- `ai:stats` - View AI usage statistics
- `ai:director` - Access AI Director features
- `ai:usage` - View usage analytics

### Rate Limiting
Configurable limits per API key:
- Requests per minute (1-1000)
- Requests per hour (1-10000)
- Requests per day (1-100000)

### Usage Tracking
- Total requests made
- Daily, hourly, and minute-level counters
- Last used timestamp
- Automatic counter resets

## Getting Started

### 1. Create an API Key

1. Log into BaseGeek UI
2. Navigate to "API Keys" in the sidebar
3. Click "Create API Key"
4. Fill in the details:
   - **Name**: Descriptive name for the key
   - **App Name**: Application identifier (letters, numbers, hyphens, underscores)
   - **Description**: Optional description
   - **Permissions**: Select required permissions
   - **Rate Limits**: Configure as needed
   - **Expiration**: Optional expiration date

5. Click "Create" and **save the API key securely** (it's only shown once)

### 2. Using API Keys

API keys can be provided in two ways:

#### Option 1: Authorization Header (Recommended)
```bash
curl -H "Authorization: Bearer bg_your_api_key_here" \
     -H "Content-Type: application/json" \
     http://localhost:3000/api/ai/providers
```

#### Option 2: X-API-Key Header
```bash
curl -H "x-api-key: bg_your_api_key_here" \
     -H "Content-Type: application/json" \
     http://localhost:3000/api/ai/providers
```

### 3. API Key Format

API keys follow this format:
- Prefix: `bg_` (baseGeek)
- Length: 67 characters total
- Example: `bg_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef`

## API Endpoints

### AI Services (with API Key Auth)

All AI endpoints support API key authentication:

- `GET /api/ai/providers` - Get available AI providers
- `GET /api/ai/models/:provider` - Get models for a provider
- `POST /api/ai/call` - Make AI calls
- `POST /api/ai/parse-json` - AI calls with JSON parsing
- `GET /api/ai/stats` - Get AI statistics
- `GET /api/ai/director/models` - Get comprehensive model info
- `POST /api/ai/director/analyze-cost` - Analyze costs
- `POST /api/ai/director/recommend` - Get recommendations

### API Key Management (JWT Auth Required)

These endpoints require user login (JWT):

- `GET /api/api-keys` - List your API keys
- `POST /api/api-keys` - Create new API key
- `GET /api/api-keys/:keyId` - Get API key details
- `PUT /api/api-keys/:keyId` - Update API key
- `DELETE /api/api-keys/:keyId` - Delete API key
- `POST /api/api-keys/:keyId/regenerate` - Regenerate API key
- `GET /api/api-keys/apps/list` - List apps with API keys

## Code Examples

### JavaScript/Node.js

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  headers: {
    'Authorization': 'Bearer bg_your_api_key_here',
    'Content-Type': 'application/json'
  }
});

// Make an AI call
const response = await api.post('/ai/call', {
  prompt: 'Hello, world!',
  config: { maxTokens: 100 }
});

console.log(response.data.data.response);
```

### Python

```python
import requests

headers = {
    'Authorization': 'Bearer bg_your_api_key_here',
    'Content-Type': 'application/json'
}

response = requests.post(
    'http://localhost:3000/api/ai/call',
    headers=headers,
    json={
        'prompt': 'Hello, world!',
        'config': {'maxTokens': 100}
    }
)

print(response.json()['data']['response'])
```

### cURL

```bash
curl -X POST http://localhost:3000/api/ai/call \
  -H "Authorization: Bearer bg_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Hello, world!",
    "config": {"maxTokens": 100}
  }'
```

## Testing

Use the provided test script to verify your API key setup:

```bash
node test-api-key.js bg_your_api_key_here
```

This script tests:
- API key authentication
- Provider and model access
- AI calls
- Statistics retrieval
- Rate limiting
- Director features

## Error Handling

### Common Error Responses

#### 401 - API Key Required
```json
{
  "success": false,
  "error": {
    "message": "API key required",
    "code": "API_KEY_REQUIRED"
  }
}
```

#### 401 - Invalid API Key
```json
{
  "success": false,
  "error": {
    "message": "Invalid API key",
    "code": "INVALID_API_KEY"
  }
}
```

#### 403 - Insufficient Permissions
```json
{
  "success": false,
  "error": {
    "message": "Permission 'ai:director' required",
    "code": "INSUFFICIENT_PERMISSIONS"
  }
}
```

#### 429 - Rate Limit Exceeded
```json
{
  "success": false,
  "error": {
    "message": "Rate limit exceeded: requests per minute",
    "code": "RATE_LIMIT_EXCEEDED"
  }
}
```

## Security Best Practices

1. **Store API Keys Securely**: Never commit API keys to version control
2. **Use Environment Variables**: Store keys in environment variables
3. **Rotate Keys Regularly**: Regenerate API keys periodically
4. **Principle of Least Privilege**: Only grant necessary permissions
5. **Monitor Usage**: Regularly check API key usage statistics
6. **Set Appropriate Rate Limits**: Prevent abuse with reasonable limits
7. **Use HTTPS**: Always use HTTPS in production

## Database Schema

API keys are stored in the `aiGeek` database in the `apikeys` collection with the following structure:

```javascript
{
  keyId: String,           // Unique identifier
  keyHash: String,         // SHA-256 hash of the API key
  keyPrefix: String,       // First 11 characters for efficient lookup
  name: String,            // Human-readable name
  appName: String,         // Application identifier
  description: String,     // Optional description
  permissions: [String],   // Array of permissions
  rateLimit: {
    requestsPerMinute: Number,
    requestsPerHour: Number,
    requestsPerDay: Number
  },
  usage: {
    totalRequests: Number,
    lastUsed: Date,
    requestsToday: Number,
    requestsThisHour: Number,
    requestsThisMinute: Number,
    // ... reset tracking fields
  },
  isActive: Boolean,       // Enable/disable key
  expiresAt: Date,         // Optional expiration
  createdBy: String,       // User who created the key
  createdAt: Date,
  updatedAt: Date
}
```

## Troubleshooting

### API Key Not Working
1. Verify the key format (starts with `bg_`, 67 characters)
2. Check if the key is active and not expired
3. Ensure you have the required permissions
4. Check rate limits haven't been exceeded

### Permission Denied
1. Verify the API key has the required permission
2. Check the endpoint documentation for required permissions
3. Update API key permissions in the UI if needed

### Rate Limit Issues
1. Check current usage in the API Keys dashboard
2. Adjust rate limits if needed
3. Implement exponential backoff in your application
4. Consider using multiple API keys for higher throughput

## Support

For issues or questions:
1. Check the BaseGeek logs for detailed error messages
2. Use the test script to diagnose authentication issues
3. Monitor API key usage in the dashboard
4. Review this documentation for common solutions

## Changelog

### v1.0.0 (Initial Release)
- API key authentication system
- Permission-based access control
- Rate limiting with configurable limits
- Usage tracking and statistics
- Web-based management interface
- Support for multiple applications
- Comprehensive error handling
- Test script and documentation