# GeekSuite SSO Hardening — Step-by-Step Guide

> **Audience**: Any developer (or intern) working on SSO standardization  
> **Companion**: Read `THE_SSO_OVERVIEW.md` first for full context and rationale  
> **Rule**: Do phases in order. Commit after each phase. If a verify step fails, stop and debug.

---

## Phases

| Phase | File | What | Time |
|-------|------|------|------|
| **0** | [THE_SSO_STEPS_0_SECURITY.md](./THE_SSO_STEPS_0_SECURITY.md) | Critical security fixes (do first, do now) | 1-2h |
| **1** | [THE_SSO_STEPS_1_SHARED_PACKAGE.md](./THE_SSO_STEPS_1_SHARED_PACKAGE.md) | Create `@geeksuite/auth` shared package | 4-6h |
| **2** | [THE_SSO_STEPS_2_BASEGEEK_FIXES.md](./THE_SSO_STEPS_2_BASEGEEK_FIXES.md) | Align token/cookie TTLs, fix baseGeek middleware | 1-2h |
| **3** | [THE_SSO_STEPS_3_APP_MIGRATIONS.md](./THE_SSO_STEPS_3_APP_MIGRATIONS.md) | Migrate all 9 apps to shared package | 9-18h |
| **4** | [THE_SSO_STEPS_4_CLEANUP_AND_VERIFY.md](./THE_SSO_STEPS_4_CLEANUP_AND_VERIFY.md) | Delete legacy files, full verification suite | 3-5h |

**Total estimated effort: ~25-35 hours**

---

## Before You Start

1. Read `DOCS/THE_SSO_OVERVIEW.md` — especially Phase 1 (inventory) and Phase 2 (risks)
2. Create a git branch: `git checkout -b sso-hardening`
3. Ensure you can access `https://basegeek.clintgeek.com`
4. Ensure you can run any app locally

## After You Finish

The suite should:
- Login once at baseGeek → authenticated everywhere on `*.clintgeek.com`
- Silently refresh tokens every 50 minutes → no surprise logouts
- Broadcast logout across all open tabs via BroadcastChannel
- Use one shared auth package instead of 9 divergent copies
- Never store tokens in localStorage or expose them to JavaScript
