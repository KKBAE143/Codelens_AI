# CodeLens AI

## Overview

CodeLens AI — a SaaS platform where users paste a GitHub URL and receive an AI-generated interactive course about that codebase. Built as a pnpm monorepo with TypeScript.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: Next.js 15 App Router (React 19, Tailwind CSS 4)
- **API framework**: Express 5 (legacy api-server, not primary)
- **Database**: PostgreSQL (Neon DB) + Drizzle ORM
- **AI**: Gemini (via Replit AI Integrations proxy) — models: `gemini-2.5-pro`, `gemini-3.1-pro-preview`
- **Background jobs**: Inngest (optional) or direct async execution
- **Auth**: GitHub OAuth (sole sign-in, token encrypted + stored)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`

## Design System

- **Fonts**: Bricolage Grotesque (headings), DM Sans (body), JetBrains Mono (code)
- **Colors**: `#FAF9F6` (bg), `#E85D30` (accent/orange), `#1A7F64` (teal), `#2C2C2A` (text), `#1E1E2E` (code bg)
- **CSS**: Custom properties defined in `artifacts/codelens-web/src/app/globals.css`

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── codelens-web/          # Next.js 15 App Router — main frontend + API routes
│   ├── api-server/            # Express API server (legacy scaffold)
│   └── mockup-sandbox/        # Component preview dev server
├── lib/
│   ├── db/                    # Drizzle ORM schema + DB connection (7 tables)
│   ├── integrations-gemini-ai/# Gemini AI client (Replit integration)
│   ├── api-spec/              # OpenAPI spec + Orval codegen config
│   ├── api-client-react/      # Generated React Query hooks
│   └── api-zod/               # Generated Zod schemas
├── scripts/                   # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Stripe Integration

- **Stripe connection**: Replit integration (OAuth via connectors API)
- **Packages**: `stripe` (SDK), `stripe-replit-sync` (webhook sync) — installed at workspace root
- **Client files**: `stripeClient.ts` in `artifacts/api-server/src/`, `artifacts/codelens-web/src/lib/`, and `scripts/src/`
- **Products**: CodeLens Pro ($19/mo, plan metadata: `pro`), CodeLens Team ($49/mo, plan metadata: `team`). Created via `scripts/src/seed-products.ts`
- **API routes** (Next.js):
  - `POST /api/stripe/checkout` — creates Stripe Checkout Session for plan upgrade
  - `POST /api/stripe/billing-portal` — creates Stripe Customer Portal session
  - `GET /api/stripe/subscription` — gets current user's subscription info
  - `POST /api/stripe/webhook` — handles checkout.session.completed, subscription.updated/deleted, invoice.payment_failed
- **API server**: `/backend-api/stripe/webhook` — webhook endpoint with `stripe-replit-sync` processing, stripe schema initialization on startup
- **Pricing page**: `/pricing` — shows Free/Pro/Team plans with feature comparison and upgrade buttons
- **Billing section**: Shown at top of dashboard, shows current plan, usage, next billing date, manage subscription button
- **Upgrade prompt**: `UpgradePrompt` component shown when free user hits rate limit (429 response)

## Database Schema (8 tables)

All tables defined in `lib/db/src/schema/`:

1. **users** — GitHub OAuth users + encrypted access tokens + Stripe fields (`stripe_customer_id`, `stripe_subscription_id`)
2. **courses** — Generated courses with status tracking, AI output, share tokens
3. **organizations** — Team/enterprise orgs
4. **organization_members** — Org membership with roles (unique on org_id+user_id)
5. **course_assignments** — Team course assignments
6. **course_progress** — Per-user progress tracking (unique on course_id+user_id)
7. **webhook_registrations** — GitHub webhook registrations for auto-regeneration
8. **sessions** — Session storage (sid, sess JSONB, expire)

Schema push: `pnpm --filter @workspace/db run push`
Seed Stripe products: `pnpm --filter @workspace/scripts exec tsx src/seed-products.ts`

## Auth Architecture

- **GitHub OAuth**: Sole sign-in method. Login redirects to GitHub OAuth with scopes `repo,read:org,admin:repo_hook`. Callback exchanges code for access token, fetches user profile, upserts user in DB, stores encrypted GitHub token, creates session.
- **Session storage**: PostgreSQL `sessions` table (sid, sess JSONB, expire timestamp). 7-day TTL.
- **Auth routes**: `/api/auth/login` (GitHub OAuth redirect), `/api/auth/callback` (token exchange + session creation), `/api/auth/logout` (session deletion + redirect to home), `/api/auth/user` (current user info from session).
- **Client hook**: `useAuth()` in `artifacts/codelens-web/src/hooks/use-auth.ts` — provides `user`, `isLoading`, `isAuthenticated`, `login()`, `logout()`.
- **User IDs**: Based on GitHub user IDs (numeric, converted to string).
- **GitHub token**: Stored AES-encrypted in `users.githubAccessToken` using `ENCRYPTION_KEY`. Available immediately at sign-in — no separate "Connect GitHub" step needed.
- Auth helpers: `artifacts/codelens-web/src/lib/auth.ts` (getUser, requireAuth, session CRUD, upsertUser)
- GitHub auth: `artifacts/codelens-web/src/lib/github-auth.ts` (encrypt/decrypt/store tokens)

## AI Pipeline (3-Stage Course Generation)

Files in `artifacts/codelens-web/src/lib/`:

- `inngest.ts` — Inngest client + event type definitions
- `github.ts` — GitHub repo extractor: parses URL, fetches file tree via GitHub API, scores/filters files (priority: README > config > entry points > source), reads top 30 files. Supports private repos via user's encrypted GitHub token.
- `prompts.ts` — 4 audience-specific prompt sets (vibe_coder, new_engineer, product_manager, security_auditor) for each of the 3 pipeline stages. Each audience adjusts focus, quiz style, and tone.
- `ai-pipeline.ts` — 3-stage pipeline:
  - Stage 1 (gemini-2.5-pro): Codebase analysis → JSON (actors, user journey, patterns, tech stack)
  - Stage 2 (gemini-2.5-pro): Curriculum design → JSON (modules, quizzes, code translations, animations)
  - Stage 3 (gemini-3.1-pro-preview): HTML generation → self-contained interactive HTML course
- `rate-limit.ts` — Plan-based rate limiting (free: 5/month, pro/team: unlimited). Checks + resets monthly.
- `jobs/generate-course.ts` — Inngest function orchestrating the full pipeline with progress tracking. Each step updates course status/progress in DB. Handles errors by setting status=failed with message.
- `jobs/regenerate-course.ts` — Inngest function for webhook-triggered regeneration. Re-fetches repo, re-runs all 3 stages, increments version number, generates AI change summary.
- `github-webhooks.ts` — GitHub webhook registration/deletion, HMAC signature verification, smart change detection (filters for meaningful code file extensions).

## API Routes (Next.js App Router)

All routes in `artifacts/codelens-web/src/app/api/`:

**Auth:**
- `GET /api/auth/login` — Initiate GitHub OAuth login
- `GET /api/auth/callback` — GitHub OAuth callback (token exchange + session creation)
- `GET /api/auth/logout` — Clear session + redirect to home
- `GET /api/auth/user` — Current user info from session

**Infrastructure:**
- `GET /api/health` — DB connectivity check
- `GET/POST/PUT /api/inngest` — Inngest event handler (serves Inngest functions)

**GitHub:**
- `GET /api/github/repos` — List user's GitHub repos (supports `org`, `search`, `page` query params, uses stored GitHub token)
- `GET /api/github/orgs` — List user's GitHub orgs/accounts (returns user info + org list)

**Courses:**
- `POST /api/courses/generate` — Start course generation (requires auth, rate-limited)
- `GET /api/courses` — List user's courses (cursor-paginated, excludes soft-deleted)
- `GET /api/courses/[id]` — Get full course detail (owner only)
- `GET /api/courses/[id]/status` — Poll generation progress (auth required, owner only)
- `PATCH /api/courses/[id]/progress` — Update module completion progress (auth required, triggers Slack on 100%)
- `POST /api/courses/[id]/regenerate` — Regenerate course (creates new version, rate-limited)
- `GET /api/courses/[id]/webhook` — Get webhook registration status for a course (owner only)
- `PATCH /api/courses/[id]/webhook` — Enable/disable auto-update webhook (registers/deletes GitHub webhook)
- `POST /api/webhooks/github` — GitHub webhook handler (HMAC validation, smart change detection, dispatches Inngest regeneration)
- `DELETE /api/courses/[id]` — Soft-delete course + cleanup webhooks (owner only)
- `GET /api/courses/share/[shareToken]` — Public course access by share token
- `GET /api/courses/assigned` — List courses assigned to current user across all orgs

**Organizations:**
- `POST /api/org` — Create organization (auth required)
- `GET /api/org/[slug]` — Get org dashboard data (members, courses, assignments, stats)
- `PATCH /api/org/[slug]/settings` — Update org settings (admin+)
- `POST /api/org/[slug]/settings` — Test Slack webhook (admin+)
- `POST /api/org/[slug]/invite` — Invite member (admin+)
- `DELETE /api/org/[slug]/members/[userId]` — Remove member (admin+)
- `GET /api/org/[slug]/assignments` — List org assignments
- `POST /api/org/[slug]/assignments` — Create assignment (admin+)
- `DELETE /api/org/[slug]/assignments/[id]` — Delete assignment (admin+)
- `GET /api/org/invitations` — List pending invitations for current user
- `POST /api/org/invitations` — Accept/decline invitation

## Environment Variables

Required secrets:
- `NEON_DATABASE_URL` — PostgreSQL connection string (Neon DB pooled, takes precedence over `DATABASE_URL`)
- `AI_INTEGRATIONS_GEMINI_BASE_URL` — Gemini API proxy (auto-set by Replit)
- `AI_INTEGRATIONS_GEMINI_API_KEY` — Gemini API key (auto-set by Replit)
- `GITHUB_CLIENT_ID` — GitHub OAuth App client ID
- `GITHUB_CLIENT_SECRET` — GitHub OAuth App client secret
- `ENCRYPTION_KEY` — AES encryption key for GitHub tokens
- `SESSION_SECRET` — Session secret
- `INNGEST_EVENT_KEY` — Inngest event key (for sending events)
- `INNGEST_SIGNING_KEY` — Inngest signing key (for webhook verification)

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — only `.d.ts` files emitted; JS bundling by esbuild/next/vite

## Development

- `pnpm --filter @workspace/codelens-web run dev` — Start Next.js dev server (port from $PORT, default 26099)
- `pnpm --filter @workspace/db run push` — Push schema changes to database
- `pnpm run typecheck` — Full project typecheck

## Packages

### `artifacts/codelens-web` (`@workspace/codelens-web`)

Next.js 15 App Router application. Main frontend and API routes for CodeLens AI.

- Entry: `src/app/layout.tsx` — root layout with fonts + design system + ClientProviders
- Pages:
  - `src/app/page.tsx` — landing page (hero, role selector, demo library, generation modal)
  - `src/app/dashboard/page.tsx` — authenticated dashboard (course cards, delete, regenerate, share, pending invitations, assigned courses)
  - `src/app/course/[id]/page.tsx` — full-screen course viewer (iframe, postMessage progress tracking)
  - `src/app/share/[token]/page.tsx` — public shared course viewer (no auth required)
  - `src/app/org/new/page.tsx` — create organization form
  - `src/app/org/[slug]/page.tsx` — org dashboard (members, courses, assignments, completion tracking)
  - `src/app/org/[slug]/settings/page.tsx` — org settings (name, Slack webhook)
- Components: `src/components/` — Navbar, Toast, GenerationModal, RepoPickerModal, PageTransition, ClientProviders
- Org helpers: `src/lib/org-helpers.ts` — `requireOrgMembership(slug, userId, minRole?)` RBAC helper
- Slack: `src/lib/slack.ts` — Slack webhook notification utility + message formatters
- API routes: `src/app/api/` — health, auth, courses CRUD, generation, progress tracking
- Depends on: `@workspace/db`, `framer-motion`, `canvas-confetti`

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. 7 tables for users, courses, orgs, progress tracking.

- `src/index.ts` — Pool + Drizzle instance with Neon SSL config
- `src/schema/` — 7 table definitions with Zod insert schemas
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

### `lib/integrations-gemini-ai` (`@workspace/integrations-gemini-ai`)

Gemini AI client via Replit's AI Integrations proxy. Provides text generation and batch processing.

- `src/client.ts` — Gemini client initialization
- `src/index.ts` — Main exports

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server (legacy scaffold, not primary for CodeLens AI).

### `scripts` (`@workspace/scripts`)

Utility scripts. Run via `pnpm --filter @workspace/scripts run <script>`.
