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
- **AI**: Cloudflare Workers AI — models: `glm-4.7-flash`, `gpt-oss-20b`, `gpt-oss-120b` (via `llm.ts`)
- **Background jobs**: Inngest (optional) or direct async execution
- **Auth**: GitHub OAuth (sole sign-in, token encrypted + stored)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`

## Design System

- **Fonts**: Bricolage Grotesque (headings), DM Sans (body), JetBrains Mono (code)
- **Colors**: `#FAF9F6` (bg), `#E85D30` (accent/orange), `#1A7F64` (teal), `#2C2C2A` (text), `#1E1E2E` (code bg)
- **CSS**: Custom properties defined in `artifacts/codelens-web/src/app/globals.css`

## V2 Course Format

- V2 courses stored as `__codelens_v2__` prefix + JSON in `courses.html` column
- V1 legacy courses render via iframe fallback
- V2 block types: text, code, mermaid, quiz, callout, file-list, architecture-card, dependency-card, env-var-card, command-card
- Types: `artifacts/codelens-web/src/lib/course-types.ts`
- Block renderers: `artifacts/codelens-web/src/components/course-blocks/`
- Wizard: `artifacts/codelens-web/src/components/CourseWizardModal.tsx` (4-step: repo preview, persona, depth/focus, confirm+generate)
- Syntax highlighting: Shiki with `catppuccin-mocha` theme
- Knowledge graph: Interactive Sigma.js/WebGL force-directed graph on overview page, Louvain community detection for node clustering, search/filter, minimap, click-to-navigate, zoom/pan/drag. Component: `KnowledgeGraph.tsx`, utilities: `graph-utils.ts`. Uses `sigma`, `graphology`, `graphology-communities-louvain`, `graphology-types`.
- Overview page tabs: "Knowledge Graph" (Sigma.js interactive) and "Abstraction Map" (existing node/edge list)
- Viewer: Two-column layout (sidebar with module nav + progress rings, main content with block rendering)
- Unified sidebar: `CourseSidebar.tsx` component shared by both `/course/[id]` and `/explore/[owner]/[repo]` pages
- Per-module flashcard chips: Each module row shows due flashcard count; clicking opens per-module flashcard review
- Flashcard counts API: `/api/courses/[id]/flashcards/counts` returns per-module due counts
- Flashcard moduleIndex filter: GET `/api/courses/[id]/flashcards?moduleIndex=N` filters cards by module
- Keyboard navigation: j/k or arrow keys to navigate between modules
- Deep linking: `#module-N` hash in URL for direct module access
- Generation progress: SSE with polling fallback, queue position/ETA display

## Public Gallery & SEO

- **Explore page**: `/explore` — public course gallery with search (repos, orgs, keywords, GitHub URLs), language filter, audience type filter (vibe coder, new engineer, PM, security auditor), depth filter (quick/full/deep), focus area filter, sort (recent/views/stars/modules), pagination
- **Featured courses**: Landing page dynamically fetches top 6 courses (ranked by views + stars) from `/api/courses/featured`, shows rich preview cards with avatar, description, language badges, difficulty, module count, estimated time, view count. Falls back to static demo cards when no featured courses available.
- **Public course viewer**: `/explore/[owner]/[repo]` — full V2 course viewer for public courses, anonymous progress via localStorage, "last generated" timestamp, stars display, completion-triggered sign-in CTA
- **Generate course CTA**: Explore 404 pages show "Generate Course for owner/repo" deep-link button that pre-fills the repo URL on the landing page via `?repo=` query param
- **Existing course check**: Home page checks `/api/courses/check-existing?url=` on URL paste, shows banner linking to existing course
- **View analytics**: `course_views` table, POST `/api/courses/[id]/view` records views, view counts shown on cards + course pages
- **SEO**: Dynamic sitemap.ts, robots.ts, `generateMetadata` on explore layout (server-side), JSON-LD with `@type: LearningResource` in server layout, OG image endpoint at `/api/og/course/[id]`
- **Share flow**: Public courses share `/explore/owner/repo` URL, private courses share `/share/token` URL — both from authenticated viewer
- **GitHub stars**: Fetched from GitHub API during course generation, stored in `courses.stars`, displayed in explore cards + public course sidebar
- **Email notifications**: Resend-based email utility (`lib/email.ts`), sends on course generation complete + course completion, respects `users.emailNotifications` opt-out, graceful when `RESEND_API_KEY` not set
- **Email preferences**: GET/PATCH `/api/user/email-preferences` — toggle email notifications
- **API endpoints**: GET `/api/courses/explore` (listing with `audience`, `depth`, `focusArea`, `stars` sort, `githubUrl` search), GET `/api/courses/explore/[owner]/[repo]` (detail), GET `/api/courses/featured` (top 6 by popularity), GET `/api/courses/check-existing`

## Replit Setup

- **CodeLens Web workflow**: `pnpm --filter @workspace/codelens-web run dev` (default port 3000, webview)
- **API Server workflow**: `pnpm --filter @workspace/api-server run dev` (port 8080, console)
- Default port: 3000 (overridable via PORT env var)
- `allowedDevOrigins: ["*"]` in `next.config.ts` to allow dev proxies (Replit, etc.)
- Dependencies: `pnpm install` from root
- Deployment: Vercel (primary), Replit (dev environment)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── codelens-web/          # Next.js 15 App Router — main frontend + API routes
│   ├── api-server/            # Express API server (legacy scaffold)
│   └── mockup-sandbox/        # Component preview dev server
├── lib/
│   ├── db/                    # Drizzle ORM schema + DB connection (10 tables)
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

## Database Schema (9 tables)

All tables defined in `lib/db/src/schema/`:

1. **users** — GitHub OAuth users + encrypted access tokens + Stripe fields (`stripe_customer_id`, `stripe_subscription_id`) + `email_notifications` boolean
2. **courses** — Generated courses with status tracking, AI output, share tokens, `stars` (GitHub star count), `view_count` (denormalized from course_views)
3. **organizations** — Team/enterprise orgs
4. **organization_members** — Org membership with roles (unique on org_id+user_id)
5. **course_assignments** — Team course assignments
6. **course_progress** — Per-user progress tracking (unique on course_id+user_id)
7. **webhook_registrations** — GitHub webhook registrations for auto-regeneration
8. **sessions** — Session storage (sid, sess JSONB, expire)
9. **generation_cache** — Generation cache (repo_url, config_hash, course_id, created_at)

Schema push: `pnpm --filter @workspace/db run push` (or `push-force`)
Functional indexes migration: `lib/db/src/migrations/005-functional-indexes-and-viewcount-backfill.sql`
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

## AI Pipeline (6-Stage PocketFlow Architecture)

Files in `artifacts/codelens-web/src/lib/`:

- `inngest.ts` — Inngest client + event type definitions
- `github.ts` — Repomix-style repo extractor: full file tree cataloguing, skip/include lists, health check (file count, binary ratio), PageRank-based file scoring, 200KB max per file, up to 100 files for full content, 90K token budget. Special parsers for package.json, .env.example, Dockerfile. Repo map with function/class signature extraction.
- `repo-map.ts` — Aider-style repo map: regex-based function/class/method signature extraction for 10+ languages, import graph parsing, PageRank scoring (in-degree + PageRank × extension bonus × directory bonus).
- `token-counter.ts` — js-tiktoken wrapper: `countTokens()`, `truncateToTokenBudget()`, `estimateTokens()`, `truncateAtFunctionBoundary()` (cuts at nearest function/class boundary), `getDepthTokenBudget()` (quick:4K, full:8K, deep:16K), `getDepthContextBudget()` (quick:20K, full:40K, deep:60K).
- `v2-schema.ts` — Zod schemas for all v2 block types and chapter validation.
- `ai-pipeline.ts` — Legacy 3-stage pipeline (kept for reference, no longer used by generation jobs).
- `prompts.ts` — Legacy prompts (kept for reference).
- `pipeline/events.ts` — EventEmitter-based pipeline event system for SSE streaming. Named events: stage_start, stage_complete, abstraction_identified, chapter_start/complete/failed, completed, failed. Active emitters stored in-memory per courseId.
- `pipeline/prompts.ts` — New PocketFlow prompts for all 6 stages: abstraction identification (YAML), relationship mapping (YAML adjacency), chapter ordering (YAML), per-chapter writing (JSON blocks), special modules (setup, dependencies, troubleshooting, overview).
- `pipeline/stages.ts` — 6-stage pipeline:
  - Stage 0: Repo health check + Repomix-style extraction with PageRank file scoring
  - Stage 1: Identify abstractions (YAML output, name + description + file_indices, retry logic, robust YAML parsing with multiple fallbacks)
  - Stage 2: Analyze relationships (YAML adjacency list, drives Mermaid diagrams + chapter ordering)
  - Stage 3: Order chapters (learning-complexity sort, focus area weighting, mandatory module injection)
  - Stage 4: Write chapters in parallel (concurrency 3, depth-based token budget, PageRank-scored file ordering per abstraction, function-boundary-aware truncation, cross-abstraction context injection, progressive prompt simplification on retry, Zod validation, partial failure recovery)
  - Stage 5: Assemble v2 course JSON (overview graph from relationships, `__codelens_v2__` prefix)
- `pipeline/index.ts` — Pipeline exports.
- `rate-limit.ts` — Plan-based rate limiting.
- `jobs/generate-course-direct.ts` — Full pipeline orchestrator: cache check → extraction → 5 stages → assembly → cache store. Checkpoint recovery at each stage via `pipelineState` JSONB column. SSE events emitted throughout.
- `jobs/generate-course.ts` — Inngest function wrapping `generateCourseDirect()`.
- `jobs/regenerate-course-direct.ts` — Webhook-triggered regeneration: generates change summary, clears pipeline state, re-runs full pipeline.
- `jobs/regenerate-course.ts` — Inngest function wrapping `regenerateCourseDirect()`.
- `github-webhooks.ts` — GitHub webhook registration/deletion, HMAC signature verification.

### Generation Cache
- `generation_cache` table: SHA256 hash of (repoUrl + persona + depth + focusAreas + customContext)
- 7-day TTL, returns existing courseId if hit
- Invalidated on forced regeneration or webhook-triggered changes

### SSE Progress Streaming
- `GET /api/courses/[id]/status/stream` — Server-Sent Events endpoint
- Pipeline emits named events via `PipelineEmitter` (in-memory EventEmitter per courseId)
- Auto-closes on completed/failed events
- Heartbeat every 15s, 10-minute timeout
- Polling fallback at `GET /api/courses/[id]/status` (unchanged)

### Checkpoint Recovery
- `courses.pipelineState` JSONB column stores: stage, abstractions, relationships, curriculum, chaptersProgress
- On pipeline restart: checks existing state, resumes from last completed stage
- Per-chapter recovery: skips already-completed chapters in Stage 4

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

- `pnpm --filter @workspace/codelens-web run dev` — Start Next.js dev server (port from $PORT, default 3000)
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
