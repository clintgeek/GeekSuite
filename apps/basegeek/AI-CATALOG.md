# AI Provider & Model Catalog
**Last Updated:** January 2025
**Total Providers:** 12
**Total Models:** 50

<!-- API keys are stored in the database via BaseGeek UI - never commit real keys here -->
<!-- Configure provider keys at: BaseGeek UI → AI Geek → Configuration -->

Qwen3Coder 30B a3B
Mistral Devstral SMALL 2507
Kat-Dev
Vibecoder-20b-rl1_0
GPT-OSS 20B

---
## Provider Hierarchy & Fallback Order

1. **Cerebras** - 120K tokens/min, 30 req/min, 235B model
2. **Together** - 180K tokens/min, 600 req/min (DeepSeek R1)
3. **LLM7** - 4500 req/h, 150 req/min (Qwen2.5 Coder)
4. **1min.ai** - Code generator with multiple AI models
5. **Ollama Cloud** - Qwen3 Coder 480B
6. **LLM Gateway** - Llama 4 Maverick (1M context)
7. **Cloudflare** - 10K neurons/day
8. **Groq** - 12K tokens/min, 1K req/day
9. **OpenRouter** - many free models
10. **Gemini** - 2.0 Flash
11. **Cohere** - 1K calls/month, 20/min
12. **Anthropic** - paid tier only (last resort)

---

## Anthropic (7 models)
*API:* `https://api.anthropic.com/v1`
*Type:* Paid tier
*Default Model:* `claude-3-5-sonnet-20241022`

| Model ID | Model Name | Status |
|----------|------------|--------|
| `claude-opus-4-1-20250805` | Claude Opus 4.1 | Paid |
| `claude-opus-4-20250514` | Claude Opus 4 | Paid |
| `claude-sonnet-4-20250514` | Claude Sonnet 4 | Paid |
| `claude-3-7-sonnet-20250219` | Claude Sonnet 3.7 | Paid |
| `claude-3-5-sonnet-20241022` | Claude Sonnet 3.5 | Paid |
| `claude-3-5-haiku-20241022` | Claude Haiku 3.5 | Paid |
| `claude-3-haiku-20240307` | Claude Haiku 3 | Paid |

---

## Groq (4 models)
*API:* `https://api.groq.com/openai/v1`
*Type:* Free tier (12K TPM, 30 RPM, 1K req/day)
*Default Model:* `llama-3.3-70b-versatile`

| Model ID | Model Name | Status |
|----------|------------|--------|
| `llama-3.3-70b-versatile` | Llama 3.3 70B Versatile (Free) | ✅ Free |
| `llama-3.1-70b-versatile` | Llama 3.1 70B Versatile (Free) | ✅ Free |
| `llama-3.1-8b-instant` | Llama 3.1 8B Instant (Free) | ✅ Free |
| `mixtral-8x7b-32768` | Mixtral 8x7B (Free) | ✅ Free |

---

## Gemini (3 models)
*API:* `https://generativelanguage.googleapis.com/v1beta`
*Type:* Free tier
*Default Model:* `gemini-2.0-flash-exp`

| Model ID | Model Name | Status |
|----------|------------|--------|
| `gemini-1.5-flash-latest` | Gemini 1.5 Flash (Free) | ✅ Free |
| `gemini-1.5-pro-latest` | Gemini 1.5 Pro | Paid |
| `gemini-pro` | Gemini Pro | Paid |

---

## Together (3 models)
*API:* `https://api.together.xyz/v1`
*Type:* Free tier (180K TPM, 600 RPM)
*Default Model:* `deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free`

| Model ID | Model Name | Status |
|----------|------------|--------|
| `meta-llama/Llama-3.3-70B-Instruct-Turbo-Free` | Llama 3.3 70B (Free) | ✅ Free |
| `deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free` | DeepSeek R1 70B (Free) | ✅ Free |
| `meta-llama/Llama-3.1-70B-Instruct-Turbo` | Llama 3.1 70B Turbo | Paid |

---

## Cohere (4 models)
*API:* `https://api.cohere.ai/v1`
*Type:* Free tier (1K calls/month, 20/min)
*Default Model:* `command-r-plus-08-2024`

| Model ID | Model Name | Status |
|----------|------------|--------|
| `command-r-plus-08-2024` | Command R+ (08-2024) | Paid |
| `command-r-plus` | Command R+ | Paid |
| `command-r` | Command R | Paid |
| `command` | Command | Paid |

---

## OpenRouter (7 models)
*API:* `https://openrouter.ai/api/v1`
*Type:* Mixed (free & paid)
*Default Model:* `qwen/qwen3-235b-a22b:free`

| Model ID | Model Name | Status |
|----------|------------|--------|
| `google/gemini-2.0-flash-exp:free` | Gemini 2.0 Flash (Free) | ✅ Free |
| `meta-llama/llama-3.1-70b-instruct:free` | Llama 3.1 70B (Free) | ✅ Free |
| `meta-llama/llama-3.1-8b-instruct:free` | Llama 3.1 8B (Free) | ✅ Free |
| `nousresearch/hermes-3-llama-3.1-405b:free` | Hermes 3 Llama 405B (Free - may be limited) | ✅ Free |
| `google/gemini-flash-1.5` | Gemini Flash 1.5 | Paid |
| `anthropic/claude-3.5-sonnet` | Claude 3.5 Sonnet | Paid |
| `openai/gpt-4o` | GPT-4o | Paid |

---

## Cerebras (3 models)
*API:* `https://api.cerebras.ai/v1`
*Type:* Free tier (120K TPM, 30 RPM)
*Default Model:* `qwen-3-235b-a22b-instruct-2507`

| Model ID | Model Name | Status |
|----------|------------|--------|
| `qwen-3-235b-a22b-instruct-2507` | Qwen3 235B Instruct (Free) | ✅ Free |
| `llama3.1-8b` | Llama 3.1 8B (Free) | ✅ Free |
| `llama3.1-70b` | Llama 3.1 70B (Free) | ✅ Free |

---

## Cloudflare (2 models)
*API:* `https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/run`
*Type:* Free tier (10K neurons/day)
*Default Model:* `@cf/openai/gpt-oss-120b`
*Format:* Workers AI (prompt string, not messages array)

| Model ID | Model Name | Status |
|----------|------------|--------|
| `@cf/openai/gpt-oss-120b` | GPT OSS 120B (Free) | ✅ Free |
| `llama-3.3-70b-instruct-fp8-fast` | Llama 3.3 70B Instruct FP8 Fast (Free) | ✅ Free |

---

## Ollama Cloud (7 models)
*API:* `https://ollama.com/api/chat`
*Type:* Free tier
*Default Model:* `qwen3-coder:480b`
*Format:* Native Ollama API (messages array, stream:false)

| Model ID | Model Name | Status |
|----------|------------|--------|
| `qwen3-coder:480b` | Qwen3 Coder 480B (Free) | ✅ Free |
| `deepseek-v3.1:671b` | DeepSeek V3.1 671B (Free) | ✅ Free |
| `gpt-oss:120b` | GPT OSS 120B (Free) | ✅ Free |
| `gpt-oss:20b` | GPT OSS 20B (Free) | ✅ Free |
| `kimi-k2:1t` | Kimi K2 1T (Free) | ✅ Free |
| `glm-4.6` | GLM 4.6 (Free) | ✅ Free |
| `qwen3-vl:235b` | Qwen3 VL 235B (Free) | ✅ Free |

---

## LLM7 (1 model)
*API:* `https://api.llm7.io/v1`
*Type:* Free tier (4500 req/h, 150 RPM)
*Default Model:* `Qwen2.5-Coder-32B-Instruct`
*API Key:* "unused" or get token at https://token.llm7.io/

| Model ID | Model Name | Status |
|----------|------------|--------|
| `Qwen2.5-Coder-32B-Instruct` | Qwen2.5 Coder 32B Instruct (Free) | ✅ Free |

---

## LLM Gateway (1 model)
*API:* `https://api.llmgateway.io/v1`
*Type:* Free tier
*Default Model:* `llama-4-maverick-free`

| Model ID | Model Name | Status |
|----------|------------|--------|
| `llama-4-maverick-free` | Llama 4 Maverick (Free - 1M context) | ✅ Free |

---

## 1min.ai (9 models)
*API:* `https://api.1min.ai/api`
*Type:* Paid (credit-based)
*Default Model:* `deepseek-reasoner`
*Format:* CODE_GENERATOR feature type
*Docs:* https://docs.1min.ai/docs/api/ai-for-code/code-generator/code-generator-tag

| Model ID | Model Name | Context | Credits (In/Out) | Families |
|----------|------------|---------|------------------|----------|
| `deepseek-reasoner` | DeepSeek Reasoner (R1) | 85.6K words | 1,121 / 3,362 | qwen, deepseek |
| `deepseek-chat` | DeepSeek Chat | 85.6K words | 400 / 3,002 | deepseek |
| `claude-3-5-haiku` | Claude 3.5 Haiku | 213.4K words | 800 / 4,003 | claude |
| `claude-3-7-sonnet` | Claude 3.7 Sonnet | 213.4K words | 3,002 / 15,007 | claude |
| `claude-4-sonnet` | Claude 4 Sonnet | 213.4K words | 3,002 / 15,007 | claude |
| `gpt-4o` | GPT-4o | 170.7K words | 2,502 / 10,005 | gpt |
| `gpt-5` | GPT-5 | 533.4K words | 6,003 / 30,015 | gpt |
| `gpt-5-chat-latest` | GPT-5 Chat Latest | 533.4K words | 6,003 / 30,015 | gpt |
| `grok-code-fast-1` | xAI Grok Code Fast 1 | 170.7K words | 1,501 / 6,003 | gpt |

**Special Features:**
- **ONLY provider with GPT-5 access** (gpt-5, gpt-5-chat-latest)
- Latest Claude 4 Sonnet support
- Code-optimized with xAI Grok Code Fast model
- Credit-based pricing (~$0.0011/1K tokens estimated for Deepseek Reasoner)
- Optional web search integration (`webSearch: true`)
- Unique CODE_GENERATOR API format (not OpenAI-compatible)
- Integrated into 4 model families (qwen, deepseek, claude, gpt)

---

## Summary Statistics

### Models by Provider
- **Anthropic:** 7 models (paid)
- **Groq:** 4 models (free)
- **Gemini:** 3 models (mixed)
- **Together:** 3 models (free)
- **Cohere:** 4 models (paid)
- **OpenRouter:** 7 models (mixed)
- **Cerebras:** 3 models (free)
- **Cloudflare:** 2 models (free)
- **Ollama Cloud:** 7 models (free)
- **LLM7:** 1 model (free)
- **LLM Gateway:** 1 model (free)
- **1min.ai:** 9 models (paid, credit-based)

### Free vs Paid
- **Free Models:** 28 models
- **Paid Models:** 22 models (Anthropic: 7, Cohere: 4, OpenRouter: 2, 1min.ai: 9)
- **Free Providers:** 8 providers with free tiers
- **Paid-Only Providers:** 2 providers (Anthropic, 1min.ai)

### Rate Limits (Free Tiers)
- **Cerebras:** 120,000 TPM, 30 RPM
- **Together:** 180,000 TPM, 600 RPM
- **Groq:** 12,000 TPM, 30 RPM, 1,000 req/day
- **Cohere:** 20 RPM, 1,000 calls/month
- **LLM7:** 150 RPM, 4,500 req/hour
- **Cloudflare:** 10,000 neurons/day

### Special Features
- **Largest Model:** Ollama Cloud `deepseek-v3.1:671b` (671B parameters)
- **Coding Specialist:** Ollama Cloud `qwen3-coder:480b` (480B parameters)
- **Longest Context:** LLM Gateway `llama-4-maverick-free` (1M tokens)
- **Fastest Inference:** Cerebras (120K TPM)
- **Most Requests:** Together (600 RPM)

---

## API Format Notes

### OpenAI-Compatible APIs
Most providers use OpenAI-compatible format:
```json
{
  "model": "model-name",
  "messages": [{"role": "user", "content": "prompt"}],
  "max_tokens": 1000,
  "temperature": 0.7
}
```

**Compatible:** Cerebras, Together, Groq, OpenRouter, LLM7, LLM Gateway

### Special Formats

**Cloudflare Workers AI:**
```json
{
  "prompt": "formatted prompt string",
  "max_tokens": 1000
}
```

**Ollama Cloud:**
```json
{
  "model": "model-name",
  "messages": [{"role": "user", "content": "prompt"}],
  "stream": false,
  "options": {
    "temperature": 0.7,
    "num_predict": 1000
  }
}
```

**Anthropic Claude:**
```json
{
  "model": "model-name",
  "messages": [{"role": "user", "content": "prompt"}],
  "max_tokens": 1000,
  "temperature": 0.7
}
```
*Headers:* `x-api-key`, `anthropic-version: 2023-06-01`

**Google Gemini:**
```json
{
  "contents": [{"parts": [{"text": "prompt"}]}],
  "generationConfig": {
    "maxOutputTokens": 1000,
    "temperature": 0.7
  }
}
```

**Cohere:**
```json
{
  "model": "model-name",
  "message": "prompt",
  "max_tokens": 1000,
  "temperature": 0.7
}
```

**1min.ai Code Generator:**
```json
{
  "type": "CODE_GENERATOR",
  "model": "deepseek-reasoner",
  "conversationId": "CODE_GENERATOR",
  "promptObject": {
    "prompt": "your prompt here",
    "webSearch": false
  }
}
```
*Headers:* `API-KEY: your-api-key`
*Note:* Unique format - not OpenAI-compatible

---

*This catalog is automatically seeded on service initialization via `seedInitialModels()` in `aiService.js`*
