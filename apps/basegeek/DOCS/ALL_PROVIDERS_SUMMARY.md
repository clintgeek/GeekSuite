# AI Provider Summary - All 8 Providers

## Quick Overview

| # | Provider | Model | Parameters | Cost | Free Tier | Best For |
|---|----------|-------|------------|------|-----------|----------|
| 1 | **Cerebras** | **Qwen3 Coder** | **480B** | **Free** | **1M tokens/day** | **Coding** |
| 2 | Groq | Llama 3.3 | 70B | Free | Rate-limited | Speed |
| 3 | Together | Llama 3.3 / DeepSeek R1 | 70B | Free | Generous | General |
| 4 | OpenRouter | Hermes 3 | 405B | Free | Rate-limited | Quality |
| 5 | Gemini | Flash 1.5 | Unknown | Free | Rate-limited | Multimodal |
| 6 | Cohere | Command R+ | 128B | $2.50/M | None | RAG/Search |
| 7 | Mistral | Large 24.11 | Unknown | $2.00/M | None | Multilingual |
| 8 | Anthropic | Claude 3.5 Sonnet | Unknown | $3.00/M | None | Premium |

## Provider Details

### 1. Cerebras (Primary) 🆕
- **Default Model**: `cerebras/Qwen3-Coder-480B`
- **Free Tier**: 1M tokens/day
- **Strengths**:
  - 480B parameter coding model
  - Specialized for programming tasks
  - Fast inference on custom hardware
  - Best coding performance for free
- **Use For**: All coding, debugging, refactoring
- **API**: `https://api.cerebras.ai/v1`

### 2. Groq
- **Default Model**: `llama-3.3-70b-versatile`
- **Free Tier**: Unlimited (30 req/min)
- **Strengths**:
  - Fastest inference
  - Good general capabilities
  - Reliable fallback
- **Use For**: Speed-critical tasks
- **API**: `https://api.groq.com/openai/v1`

### 3. Together AI
- **Default Model**: `meta-llama/Llama-3.3-70B-Instruct-Turbo-Free`
- **Free Tier**: Generous daily limit
- **Strengths**:
  - Multiple free models
  - DeepSeek R1 available
  - Good quality/speed balance
- **Use For**: General tasks, overflow
- **API**: `https://api.together.xyz/v1`

### 4. OpenRouter
- **Default Model**: `nousresearch/hermes-3-llama-3.1-405b:free`
- **Free Tier**: Rate-limited
- **Strengths**:
  - 405B model (most powerful free)
  - Access to many providers
  - Good routing logic
- **Use For**: High-quality responses
- **API**: `https://openrouter.ai/api/v1`

### 5. Google Gemini
- **Default Model**: `gemini-1.5-flash-latest`
- **Free Tier**: 5 req/sec
- **Strengths**:
  - Multimodal (images, video)
  - Fast and efficient
  - Large context window
- **Use For**: Vision, multimodal tasks
- **API**: `https://generativelanguage.googleapis.com/v1beta`

### 6. Cohere
- **Default Model**: `command-r-plus-08-2024`
- **Cost**: $2.50 per 1M tokens
- **Strengths**:
  - Best-in-class RAG
  - Strong multilingual
  - Excellent search/retrieval
- **Use For**: RAG pipelines, search
- **API**: `https://api.cohere.ai/v1`

### 7. Mistral
- **Default Model**: `mistral-large-2411`
- **Cost**: $2.00 per 1M tokens
- **Strengths**:
  - European language expert
  - Strong reasoning
  - Good value
- **Use For**: French/German/etc., complex reasoning
- **API**: `https://api.mistral.ai/v1`

### 8. Anthropic
- **Default Model**: `claude-3-5-sonnet-20241022`
- **Cost**: $3.00 per 1M tokens
- **Strengths**:
  - Highest quality
  - Best reasoning
  - Excellent instruction following
- **Use For**: Critical tasks, complex reasoning
- **API**: `https://api.anthropic.com/v1`

## Fallback Strategy

```
Request comes in
    ↓
Try Cerebras (1M tokens/day free)
    ↓ (if limit hit or error)
Try Groq (fast, unlimited)
    ↓ (if rate limited)
Try Together (generous free tier)
    ↓ (if unavailable)
Try OpenRouter (405B model free)
    ↓ (if rate limited)
Try Gemini (multimodal free)
    ↓ (if rate limited)
Try Cohere ($2.50/M - paid)
    ↓ (if unavailable)
Try Mistral ($2.00/M - paid)
    ↓ (if unavailable)
Try Anthropic ($3.00/M - premium paid)
```

## Cost Optimization

### Daily Free Capacity
- **Cerebras**: 1,000,000 tokens
- **Groq**: ~100,000 tokens (30 req/min)
- **Together**: ~500,000 tokens (generous)
- **OpenRouter**: ~50,000 tokens (rate-limited)
- **Gemini**: ~100,000 tokens (5 req/sec)

**Total Free**: ~1.75M tokens/day before hitting paid tiers!

### Typical Usage Patterns

**Light Usage** (< 100K tokens/day):
- Cerebras handles everything
- No paid providers needed
- **Cost**: $0/day

**Moderate Usage** (100K-500K tokens/day):
- Cerebras + Groq covers most
- Occasional Together overflow
- **Cost**: $0/day

**Heavy Usage** (500K-1M tokens/day):
- All free providers utilized
- Rarely hits paid tiers
- **Cost**: $0-5/day

**Extreme Usage** (> 1M tokens/day):
- Free tiers fully utilized
- Cohere/Mistral for overflow
- Anthropic only when critical
- **Cost**: $5-20/day

## Environment Variables

Required in `.env.production`:

```env
# Free Providers (highly recommended)
CEREBRAS_API_KEY=your_cerebras_key
GROQ_API_KEY=your_groq_key
TOGETHER_API_KEY=your_together_key
OPENROUTER_API_KEY=your_openrouter_key
GEMINI_API_KEY=your_gemini_key

# Paid Providers (optional, for overflow)
COHERE_API_KEY=your_cohere_key
MISTRAL_API_KEY=your_mistral_key
ANTHROPIC_API_KEY=your_anthropic_key
```

## Getting API Keys

| Provider | Sign Up URL | Free Tier |
|----------|-------------|-----------|
| Cerebras | https://cerebras.ai/ | 1M tokens/day |
| Groq | https://console.groq.com/ | Yes |
| Together | https://api.together.ai/ | Yes |
| OpenRouter | https://openrouter.ai/ | Yes |
| Gemini | https://makersuite.google.com/ | Yes |
| Cohere | https://cohere.com/ | Trial |
| Mistral | https://console.mistral.ai/ | Trial |
| Anthropic | https://console.anthropic.com/ | Trial |

## Task-Specific Recommendations

### Coding Tasks
1. **Cerebras** (480B Qwen3 Coder) - Primary
2. **Groq** (70B Llama) - Fast fallback
3. **OpenRouter** (405B Hermes) - Quality fallback

### General Chat
1. **Groq** (fast responses)
2. **Together** (good quality)
3. **Cerebras** (if coding-adjacent)

### Multimodal (Images/Video)
1. **Gemini** (best multimodal free)
2. **Anthropic** (premium quality)

### RAG / Search
1. **Cohere** (specialized)
2. **OpenRouter** (good quality)

### European Languages
1. **Mistral** (best French/German/etc.)
2. **Cohere** (good multilingual)

### Complex Reasoning
1. **Anthropic** (best reasoning)
2. **Mistral** (good value)
3. **OpenRouter** (free 405B)

## Monitoring Usage

Check aiGeek dashboard for:
- Tokens used per provider today
- Remaining free tier capacity
- Cost estimates
- Fallback trigger frequency

## Testing All Providers

```bash
cd /Users/ccrocker/projects/baseGeek

# Test all providers
node test-provider-apis.js

# Check database keys
node debug-api-keys.js
```

## Performance Expectations

### Response Times (approximate)
- **Groq**: 0.5-1s (fastest)
- **Cerebras**: 1-2s (fast)
- **Together**: 1-3s (good)
- **Gemini**: 2-4s (good)
- **OpenRouter**: 3-5s (variable)
- **Mistral**: 2-4s (good)
- **Cohere**: 2-5s (good)
- **Anthropic**: 3-6s (quality over speed)

### Quality Tiers
**Excellent**: Anthropic Claude, Cerebras (coding), OpenRouter 405B
**Very Good**: Mistral Large, Cohere Command R+, Gemini Flash
**Good**: Groq Llama, Together Llama/DeepSeek

## Deployment Checklist

- [ ] Add all API keys to `.env.production`
- [ ] Deploy updated code to server
- [ ] Restart API service
- [ ] Test each provider via UI
- [ ] Enable desired providers in aiGeek config
- [ ] Monitor usage dashboard
- [ ] Verify fallback chain works
- [ ] Check cost tracking

## Summary

You now have **8 powerful AI providers** configured with:
- ✅ **1.75M+ tokens/day FREE**
- ✅ **480B coding-specialized model** (Cerebras)
- ✅ **405B general model** (OpenRouter)
- ✅ **Smart fallback chain**
- ✅ **Cost-optimized routing**
- ✅ **Multimodal capabilities** (Gemini)
- ✅ **Premium options** (Claude)

**Result**: World-class AI capabilities at minimal cost! 🎉
