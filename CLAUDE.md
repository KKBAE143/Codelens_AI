# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

CodeLens AI converts any GitHub repository URL into an interactive, audience-tailored HTML course using a 3-stage AI pipeline (codebase analysis → curriculum design → HTML generation). Users authenticate via GitHub OAuth, pick a target audience (vibe coder, new engineer, product manager, security auditor), and receive a self-contained course page they can share or auto-update on every push via GitHub webhooks.

## Monorepo Structure

This is a **pnpm workspace monorepo**. All packages use `@workspace/*` namespace.

```
root
├── artifacts/
│   ├── codelens-web/       Next.js 15 App Router — main app (port 26099)
│   ├── api-server/         Express 5 — Stripe webhook handler (port 8080)
│   └── mockup-sandbox/     Vite + React — UI prototyping sandbox (do NOT import in codelens-web)
├── lib/
│   ├── db/                 Drizzle ORM schema + Neon PostgreSQL client (@workspace/db)
│   ├── integrations-gemini-ai/   Google Gemini SDK wrapper (@workspace/integrations-gemini-ai)
│   ├── api-zod/            Zod schemas generated from OpenAPI spec via Orval
│   ├── api-client-react/   TanStack Query hooks generated from OpenAPI spec via Orval
│   └── api-spec/           OpenAPI YAML spec + Orval code-gen config
└── scripts/                One-off admin scripts (run with tsx)
```

Shared dependency versions are pinned in `pnpm-workspace.yaml` `catalog:` section — use `catalog:` in package.json instead of version strings.

## Commands

```bash
# Install
pnpm install                    # pnpm is enforced (preinstall hook rejects npm/yarn)

# Dev servers
pnpm --filter @workspace/codelens-web run dev     # Next.js on port 26099
pnpm --filter @workspace/api-server run dev       # Express on port 8080

# Build
pnpm run build                  # typecheck all + build all packages
pnpm --filter @workspace/codelens-web run build   # Next.js only
pnpm --filter @workspace/api-server run build     # Express only (esbuild → dist/)

# Typecheck
pnpm run typecheck              # all packages (libs first via tsc --build, then artifacts)
pnpm run typecheck:libs         # shared libs only

# Database (from lib/db/)
pnpm drizzle-kit push           # push schema to Neon
pnpm drizzle-kit generate       # generate migration files

# Admin scripts (from scripts/)
npx tsx fix-user-and-courses.ts
```

## Environment Setup

```bash
cp .env.example .env
# Required: NEON_DATABASE_URL, GITHUB_CLIENT_ID/SECRET, ENCRYPTION_KEY, SESSION_SECRET
# AI (at least one): GEMINI_API_KEY or GROQ_API_KEY
# Billing: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET
# Optional per-stage model overrides: COURSE_STAGE1_MODEL, COURSE_STAGE2_MODEL, COURSE_STAGE3_MODEL
```

## AI Pipeline

Course generation runs as a 3-stage pipeline in `artifacts/codelens-web/src/lib/`:

| Stage | Function | Output | Max tokens |
|-------|----------|--------|------------|
| 1 — Analysis | `ai-pipeline.ts:runStage1` | JSON analysis (tech stack, actors, difficulty) | 8,192 |
| 2 — Curriculum | `ai-pipeline.ts:runStage2` | JSON curriculum (modules, quizzes, debug guide) | 8,192 |
| 3 — HTML | `ai-pipeline.ts:runStage3` | Self-contained interactive HTML course | 32,768 |

**LLM routing** (`src/lib/llm.ts`): Each stage has a provider priority list. Groq (Llama) is tried first; Gemini is the fallback. Per-stage model overrides available via env vars.

**JSON safety**: `safeParseJson()` in `ai-pipeline.ts` handles malformed JSON from models (markdown fences, raw newlines, control characters) with a 5-step repair pipeline.

**Trigger modes**:
- **Inngest** (if `INNGEST_EVENT_KEY` set): async job via `codelens/course.generate` event
- **Direct** (fallback): `generateCourseDirect()` fires as a background Promise

**GitHub webhook auto-update**: pushes trigger `regenerateCourseDirect()` which diffs changed files and regenerates with context from the previous version.

## Authentication

Custom session-based auth — **no NextAuth**:
- GitHub OAuth flow: `/api/auth/login` → GitHub → `/api/auth/callback`
- Sessions stored in PostgreSQL `sessions` table (sid, sess JSONB, expire), 7-day cookie TTL
- Server: `requireAuth()` / `getUser()` helpers in `src/lib/auth.ts`
- Client: `useAuth()` hook fetches `/api/auth/user`

## Key Data Tables

Defined in `lib/db/src/schema/`:

| Table | Purpose |
|-------|---------|
| `users` | GitHub identity, plan (free/pro/team), Stripe IDs, monthly generation counter |
| `courses` | Status enum, JSONB analysis/curriculum, HTML output, version counter, shareToken |
| `sessions` | Custom session store (sid, sess JSONB, expire) |
| `organizations` | Team workspace with slug |
| `organizationMembers` | User ↔ org membership with role + status |
| `webhookRegistrations` | GitHub webhook ID + secret per course for auto-update |

## Billing (Stripe)

| Plan | Monthly generations |
|------|---------------------|
| `free` | 5 |
| `pro` | Unlimited |
| `team` | Unlimited + org features |

Stripe webhook events handled in `/api/stripe/webhook/route.ts` and the Express `api-server` at `/backend-api/stripe/webhook` (raw-body variant).

## Coding Conventions

- **TypeScript strict mode** and **ESM only** throughout
- Path alias `@/*` maps to `src/*` in codelens-web
- **Drizzle ORM** for all DB access — no raw SQL except session JSONB patching (intentional: Drizzle lacks partial JSONB updates)
- API routes: set `export const dynamic = "force-dynamic"` and `export const runtime = "nodejs"` for routes hitting the DB
- AI JSON responses: always run through `safeParseJson()`; HTML responses: regex-extract `<!DOCTYPE html>`
- To add a new LLM provider, extend `generateText()` in `src/lib/llm.ts` with a new `provider` branch
- AI prompts live in `artifacts/codelens-web/src/lib/prompts.ts`; audience-specific context is in `AUDIENCE_CONTEXT`
- GitHub token for private repo access comes from the user's stored `githubAccessToken` in the `users` table, not a global env var

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update tasks/lessons.md with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes -- don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests -- then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. Plan First: Write plan to tasks/todo.md with checkable items
2. Verify Plan: Check in before starting implementation
3. Track Progress: Mark items complete as you go
4. Explain Changes: High-level summary at each step
5. Document Results: Add review section to tasks/todo.md
6. Capture Lessons: Update tasks/lessons.md after corrections

## Core Principles

- Simplicity First: Make every change as simple as possible. Impact minimal code.
- No Laziness: Find root causes. No temporary fixes. Senior developer standards.
- Minimal Impact: Only touch what's necessary. No side effects with new bugs.
