# StoryGeek Setup Guide

## Environment Variables

Create a `.env` file in the StoryGeek root directory with the following variables:

```bash
# baseGeek Integration (Required)
BASEGEEK_URL=https://basegeek.clintgeek.com

# JWT Secret (for authentication)
JWT_SECRET=your_jwt_secret_here

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Node Environment
NODE_ENV=development
```

## Testing the Integration

To test that StoryGeek is properly connected to baseGeek's AI service:

```bash
cd StoryGeek/backend
node test-ai-integration.js
```

This will test story generation and summary creation, and you can verify the usage appears in baseGeek's AI management dashboard.

## Authentication

StoryGeek uses the user's existing JWT token for authentication with baseGeek. No separate API key is needed. The system automatically:

1. **Extracts the user's token** from request headers
2. **Passes it to baseGeek** for AI calls
3. **Tracks usage** by user and app in baseGeek's dashboard

### AI Provider Options in baseGeek

- **Claude 3.5 Sonnet** (Primary - Recommended)
- **Groq Llama 3.1** (Fast Fallback)
- **Gemini 1.5 Flash** (Alternative)

All AI providers are managed centrally in baseGeek for cost control and consistency.

## Quick Start

1. **Get your baseGeek API key** (5 minutes)
2. **Create `.env` file** with your baseGeek API key
3. **Run the app:**
   ```bash
   cd StoryGeek
   docker-compose up --build
   ```
4. **Navigate to:** http://localhost:9988
5. **Start your first story!**

## Cost Estimate

- **200 interactions:** ~$0.0225
- **500 interactions:** ~$0.056
- **1000 interactions:** ~$0.112

Basically **free** for a full storytelling experience!

## Database

StoryGeek uses the existing DataGeek MongoDB instance, so no additional database setup is required.