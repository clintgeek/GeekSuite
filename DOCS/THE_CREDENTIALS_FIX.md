# Credential Exposure Remediation Guide

## Summary

This document details the steps required to fix the sensitive credential exposures found in the GeekSuite repository. **These credentials MUST be rotated and removed before pushing to GitHub or any public repository.**

---

## Exposed Credentials Inventory

### 1. AI Provider API Keys

| Provider | Exposed Key Location | Key Value |
|----------|---------------------|-----------|
| OpenRouter | `apps/basegeek/AI-CATALOG.md:6` | `REDACTED_OPENROUTER_KEY` |
| Cerebras | `apps/basegeek/AI-CATALOG.md:7` | `REDACTED_CEREBRAS_KEY` |
| Gemini | `apps/basegeek/AI-CATALOG.md:8` | `REDACTED_GEMINI_KEY` |
| Groq | `apps/basegeek/AI-CATALOG.md:9` | `REDACTED_GROQ_KEY` |
| Together | `apps/basegeek/AI-CATALOG.md:10` | `REDACTED_TOGETHER_KEY` |
| Ollama Cloud | `apps/basegeek/AI-CATALOG.md:11` | `REDACTED_OLLAMA_CLOUD_KEY` |

### 2. Database Credentials

| Service | Username | Password | Files Affected |
|---------|----------|----------|----------------|
| MongoDB | `datageek_admin` | `REDACTED` | `apps/basegeek/.env`, `apps/basegeek/.env.production`, `apps/flockgeek/.env`, `apps/flockgeek/backend/.env` |
| PostgreSQL | `datageek_pg_admin` | `REDACTED` | `apps/basegeek/.env`, `apps/basegeek/.env.production` |
| InfluxDB | `datageek_influx_admin` | `REDACTED` | `apps/basegeek/.env`, `apps/basegeek/.env.production` |

### 3. Authentication Secrets

| Secret Type | Value | Files Affected |
|-------------|-------|----------------|
| JWT_SECRET | `REDACTED_JWT_SECRET` | `apps/basegeek/.env`, `apps/basegeek/.env.production`, `apps/flockgeek/.env`, `apps/flockgeek/backend/.env` |
| JWT_REFRESH_SECRET | `REDACTED_JWT_REFRESH_SECRET` | `apps/basegeek/.env`, `apps/basegeek/.env.production` |
| INFLUXDB_TOKEN | `REDACTED_INFLUXDB_TOKEN` | `apps/basegeek/.env.production` |
| INFLUXDB_ADMIN_TOKEN | `REDACTED_INFLUXDB_ADMIN_TOKEN` | `apps/basegeek/.env` |

---

## Immediate Actions Required

### Step 1: Revoke/Rotate AI Provider API Keys (URGENT - Do First)

**OpenRouter:**
1. Visit https://openrouter.ai/keys
2. Delete the exposed key ending in `11921462`
3. Generate a new key
4. Update `AIConfig` in BaseGeek database or configuration

**Cerebras:**
1. Visit https://cloud.cerebras.ai/
2. Navigate to API Keys section
3. Revoke the exposed key
4. Generate a new key

**Google Gemini:**
1. Visit https://makersuite.google.com/app/apikey
2. Delete the key `REDACTED_GEMINI_KEY`
3. Create a new API key

**Groq:**
1. Visit https://console.groq.com/keys
2. Delete the exposed key
3. Create a new key

**Together AI:**
1. Visit https://api.together.xyz/settings/api-keys
2. Revoke the exposed key
3. Generate a new key

**Ollama Cloud:**
1. Visit https://ollama.com/settings
2. Revoke the exposed key
3. Generate a new key

### Step 2: Rotate Database Passwords

**MongoDB:**
```bash
# Connect to MongoDB as admin
mongo -u admin -p --authenticationDatabase admin

# Change password for datageek_admin user
use admin
db.updateUser("datageek_admin", {
  pwd: "<NEW_STRONG_PASSWORD>",
  roles: [...existing roles...]
})
```

**PostgreSQL:**
```sql
-- Connect as superuser
ALTER USER datageek_pg_admin WITH PASSWORD '<NEW_STRONG_PASSWORD>';
```

**InfluxDB:**
```bash
# For InfluxDB 2.x, update the user password
influx user password -n datageek_influx_admin
```

### Step 3: Regenerate JWT Secrets

Generate new JWT secrets using:
```bash
# Generate new JWT_SECRET (64 bytes hex)
openssl rand -hex 64

# Generate new JWT_REFRESH_SECRET (32 bytes base64)
openssl rand -base64 32
```

Update these in:
- `apps/basegeek/.env`
- `apps/basegeek/.env.production`
- `apps/flockgeek/.env`
- `apps/flockgeek/backend/.env`

### Step 4: Rotate InfluxDB Tokens

1. Generate new tokens via InfluxDB UI or CLI
2. Update `INFLUXDB_TOKEN` and `INFLUXDB_ADMIN_TOKEN` in affected files

---

## File Remediation

### Remove Credentials from Files

1. **Edit `apps/basegeek/AI-CATALOG.md`**
   - Remove or redact lines 6-11 containing actual API keys
   - Replace with placeholder format: `sk-or-v1-xxx...xxx` or remove entirely

2. **Update all `.env` files**
   - Replace all real passwords with placeholder values or environment variable references
   - Use pattern: `${VARIABLE_NAME}` for dynamic injection

### Example .env Template Structure:

```bash
# .env.example - Safe to commit
MONGODB_URI=mongodb://datageek_admin:${MONGODB_PASSWORD}@192.168.1.17:27018
JWT_SECRET=${JWT_SECRET}
```

---

## Git History Cleanup (Critical Before Push)

**Option A: Using BFG Repo-Cleaner (Recommended)**

```bash
# 1. Download BFG
wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar

# 2. Create a passwords.txt file with all exposed credentials
# Add each credential on its own line

# 3. Run BFG to remove credentials from history
java -jar bfg-1.14.0.jar --replace-text passwords.txt

# 4. Clean up
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

**Option B: Using git-filter-repo**

```bash
# Install git-filter-repo
pip install git-filter-repo

# Remove specific files with sensitive data from history
git filter-repo --path apps/basegeek/AI-CATALOG.md --invert-paths
git filter-repo --path apps/basegeek/.env --invert-paths
git filter-repo --path apps/basegeek/.env.production --invert-paths
```

**Option C: Nuclear Option (Fresh History)**

If the repository is not yet pushed to remote:
```bash
# Remove .git and reinitialize (DESTROYS ALL HISTORY)
rm -rf .git
git init
git add .
git commit -m "Initial commit with cleaned credentials"
```

---

## .gitignore Updates

Ensure these patterns are in your `.gitignore`:

```gitignore
# Environment files
.env
.env.local
.env.*.local
.env.production
.env.development

# Backup files
*.bak
*.backup

# IDE
.vscode/settings.json
.idea/

# Logs
logs/
*.log
```

---

## Post-Remediation Verification

### 1. Verify No Credentials in Code

```bash
# Search for credential patterns
grep -r "sk-or-v1-[a-z0-9]" .
grep -r "AIzaSy[a-zA-Z0-9_-]" .
grep -r "gsk_[a-zA-Z0-9]" .
grep -r "DataGeek_[A-Za-z_]*2024" .
```

### 2. Test Application Functionality

After rotating all credentials:
- [ ] Test database connections
- [ ] Test AI provider API calls
- [ ] Test authentication flows
- [ ] Test InfluxDB metrics collection

### 3. Implement Secret Management (Long-term)

Consider migrating to:
- **Doppler** (https://doppler.com)
- **1Password Secrets Automation**
- **HashiCorp Vault**
- **AWS Secrets Manager / GCP Secret Manager / Azure Key Vault**

---

## Timeline

| Priority | Action | Status |
|----------|--------|--------|
| CRITICAL | Revoke AI provider API keys | [ ] |
| CRITICAL | Rotate database passwords | [ ] |
| HIGH | Regenerate JWT secrets | [ ] |
| HIGH | Clean git history | [ ] |
| MEDIUM | Implement secret management solution | [ ] |
| LOW | Update documentation | [ ] |

---

## Contact

If you discover additional exposed credentials or need assistance with the remediation process, document them here and follow the same rotation procedure.

**Last Updated:** March 22, 2026
**Status:** PENDING REMEDIATION
