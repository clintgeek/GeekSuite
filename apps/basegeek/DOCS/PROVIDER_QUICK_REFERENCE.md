# Quick Reference - AI Provider Selection

## 🎯 What Should I Use For...?

### 💻 **Coding / Programming**
```
1. Cerebras Qwen3 480B    ← Primary (1M free/day)
2. Groq Llama 70B         ← Fast fallback
3. OpenRouter Hermes 405B ← Quality fallback
```

### ⚡ **Speed (Fast Response)**
```
1. Groq Llama 70B         ← Fastest
2. Cerebras Qwen3 480B    ← Very fast
3. Gemini Flash           ← Fast + multimodal
```

### 🧠 **Quality (Best Response)**
```
1. Anthropic Claude 3.5   ← Premium ($$$)
2. OpenRouter Hermes 405B ← Free!
3. Mistral Large          ← Good value ($$)
```

### 🖼️ **Images / Multimodal**
```
1. Gemini Flash           ← Best free multimodal
2. Anthropic Claude       ← Premium quality
```

### 🔍 **RAG / Search**
```
1. Cohere Command R+      ← Specialized ($$)
2. OpenRouter Hermes 405B ← Free alternative
```

### 🌍 **Non-English Languages**
```
1. Mistral Large          ← Best for French/German/Spanish ($$)
2. Cohere Command R+      ← Good multilingual ($$)
3. Gemini Flash           ← Free multilingual
```

### 💰 **Free / Cost Savings**
```
1. Cerebras (1M/day)      ← Most generous
2. Groq (unlimited)       ← Very fast
3. Together (generous)    ← Good quality
4. OpenRouter (limited)   ← 405B model!
5. Gemini (5 req/sec)     ← Multimodal
```

## 📊 Quick Comparison

```
Provider      Size    Free?   Speed    Quality   Best For
----------    ----    -----   -----    -------   --------
Cerebras      480B    1M/day  ⚡⚡⚡⚡    ⭐⭐⭐⭐⭐  Coding
Groq           70B    Yes     ⚡⚡⚡⚡⚡   ⭐⭐⭐⭐    Speed
Together       70B    Yes     ⚡⚡⚡⚡    ⭐⭐⭐⭐    General
OpenRouter    405B    Limited ⚡⚡⚡     ⭐⭐⭐⭐⭐  Quality
Gemini         ?      Yes     ⚡⚡⚡⚡    ⭐⭐⭐⭐    Multimodal
Cohere        128B    No      ⚡⚡⚡     ⭐⭐⭐⭐    RAG
Mistral        ?      No      ⚡⚡⚡     ⭐⭐⭐⭐    Multilingual
Anthropic      ?      No      ⚡⚡⚡     ⭐⭐⭐⭐⭐  Premium
```

## 💡 Smart Defaults

### For codeGeek (VS Code Extension)
```javascript
Primary: cerebras      // Coding-optimized, 480B, 1M free/day
Fallback: groq         // Fast, reliable
Emergency: openrouter  // 405B quality
```

### For General Use
```javascript
Primary: cerebras      // Best free tier
Fallback: groq         // Fastest
Emergency: together    // Generous limits
```

### For Production Apps
```javascript
Primary: cerebras      // Free coding power
Tier 2: groq + together + openrouter  // All free
Tier 3: mistral        // Paid, good value ($2/M)
Tier 4: anthropic      // Premium quality ($3/M)
```

## 🎯 Decision Tree

```
Do you need images/video?
  YES → Gemini (free) or Claude (premium)
  NO  ↓

Is it coding-related?
  YES → Cerebras (480B, 1M/day free)
  NO  ↓

Do you need RAG/search?
  YES → Cohere (specialized, $2.50/M)
  NO  ↓

Is it non-English?
  YES → Mistral (multilingual expert, $2/M)
  NO  ↓

Do you need speed?
  YES → Groq (fastest free)
  NO  ↓

Do you need best quality?
  YES → Anthropic Claude (premium, $3/M)
  NO  ↓

Default: Cerebras → Groq → Together → OpenRouter
```

## 🔄 Fallback Chain

```
Request
  ↓
Cerebras (1M/day)
  ↓ limit hit
Groq (fast, unlimited)
  ↓ rate limited
Together (generous)
  ↓ unavailable
OpenRouter (405B free)
  ↓ rate limited
Gemini (multimodal free)
  ↓ rate limited
Cohere (paid $2.50/M)
  ↓ unavailable
Mistral (paid $2/M)
  ↓ unavailable
Claude (premium $3/M)
```

## 📈 Usage Tiers

### Light User (< 100K tokens/day)
- **Use**: Cerebras only
- **Cost**: $0/day
- **Coverage**: 100%

### Moderate User (100K-500K tokens/day)
- **Use**: Cerebras + Groq
- **Cost**: $0/day
- **Coverage**: 100%

### Heavy User (500K-1M tokens/day)
- **Use**: All free providers
- **Cost**: $0-2/day (rare paid overflow)
- **Coverage**: 98% free, 2% paid

### Power User (> 1M tokens/day)
- **Use**: Free providers + paid overflow
- **Cost**: $5-20/day
- **Coverage**: 85% free, 15% paid

## 🎁 Free Token Budget

Daily capacity before hitting paid tiers:
```
Cerebras:    1,000,000 tokens  (generous daily limit)
Groq:          100,000 tokens  (30 req/min)
Together:      500,000 tokens  (generous soft limit)
OpenRouter:     50,000 tokens  (rate-limited)
Gemini:        100,000 tokens  (5 req/sec)
              ----------
Total:       1,750,000 tokens/day FREE! 🎉
```

## 🚀 Getting Started

1. **Get Cerebras key** (most important)
   - https://cerebras.ai/
   - 1M tokens/day free!

2. **Get Groq key** (fast fallback)
   - https://console.groq.com/
   - Unlimited (rate-limited)

3. **Optional: Other free providers**
   - Together, OpenRouter, Gemini
   - Extra capacity and features

4. **Optional: Paid providers**
   - Only if you exceed 1.75M tokens/day
   - Cohere, Mistral, Anthropic

## 📝 Configuration

In aiGeek UI, enable providers in order:
1. ✅ Cerebras (coding primary)
2. ✅ Groq (fast fallback)
3. ✅ Together (general fallback)
4. ✅ OpenRouter (quality fallback)
5. ✅ Gemini (multimodal)
6. ⬜ Cohere (paid - only if needed)
7. ⬜ Mistral (paid - only if needed)
8. ⬜ Anthropic (paid - only if needed)

## 🎯 Recommended Setup

```javascript
// .env.production
CEREBRAS_API_KEY=xxx    // ← Required (1M/day free)
GROQ_API_KEY=xxx        // ← Required (fast fallback)
TOGETHER_API_KEY=xxx    // ← Recommended (extra capacity)
OPENROUTER_API_KEY=xxx  // ← Recommended (405B quality)
GEMINI_API_KEY=xxx      // ← Recommended (multimodal)

// Optional paid (only if needed)
COHERE_API_KEY=xxx      // For RAG tasks
MISTRAL_API_KEY=xxx     // For multilingual
ANTHROPIC_API_KEY=xxx   // For premium quality
```

## 🏆 Winner: Cerebras

**Why Cerebras is now primary:**
- 🎁 1M tokens/day FREE (most generous)
- 🚀 480B parameters (largest free model)
- 💻 Coding-specialized (perfect for codeGeek)
- ⚡ Fast inference (custom hardware)
- 🔓 No strict rate limits

**Before**: Groq → Together → Others
**After**: Cerebras → Groq → Together → Others

**Savings**: ~$3-10/day for moderate-heavy usage!

---

**tl;dr**: Use Cerebras for everything (1M free/day), fall back to Groq (fast), then other free providers. Only use paid providers when you exceed 1.75M tokens/day.
