export interface PitchStats {
  totalCourses: number;
  totalUsers: number;
  generationCount: number;
}

export function buildPitchDocumentHtml(stats: PitchStats): string {
  const now = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const accent = "#E85D30";
  const accentLight = "#FFF0EB";
  const dark = "#1a1a2e";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeLens AI — Hackathon Pitch Document</title>
  <style>
    @page { margin: 0.6in 0.75in; size: letter; @bottom-center { content: counter(page); font-size: 8pt; color: #999; } }
    @page :first { margin-top: 0; @bottom-center { content: none; } }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: ${dark}; max-width: 850px; margin: 0 auto; padding: 0 1rem; font-size: 10.5pt; counter-reset: page; }
    h1 { font-size: 2em; color: ${dark}; }
    h2 { font-size: 1.35em; color: ${dark}; margin: 1.5em 0 0.5em; border-bottom: 3px solid ${accent}; padding-bottom: 0.25em; page-break-after: avoid; }
    h3 { font-size: 1.05em; color: ${dark}; margin: 1em 0 0.4em; }
    p { margin: 0.4em 0; }
    ul, ol { margin: 0.4em 0 0.4em 1.4em; }
    li { margin: 0.15em 0; }
    strong { color: ${dark}; }
    .accent { color: ${accent}; }
    .cover { text-align: center; padding: 3rem 1rem 2rem; border-bottom: 4px solid ${accent}; margin-bottom: 1.5rem; page-break-after: always; }
    .cover h1 { font-size: 2.8em; margin-bottom: 0.15em; }
    .cover .logo { font-size: 3.5em; margin-bottom: 0.25em; }
    .cover .tagline { font-size: 1.3em; color: #555; margin: 0.5em 0; font-style: italic; }
    .cover .date { font-size: 0.9em; color: #999; margin-top: 1.5em; }
    .cover .team { font-size: 0.85em; color: #777; margin-top: 0.5em; }
    .stat-card { display: inline-block; background: ${accentLight}; border: 2px solid ${accent}; border-radius: 10px; padding: 0.6em 1.2em; margin: 0.3em; text-align: center; min-width: 130px; }
    .stat-card .num { font-size: 1.8em; font-weight: 800; color: ${accent}; line-height: 1.1; }
    .stat-card .label { font-size: 0.72em; text-transform: uppercase; letter-spacing: 0.06em; color: #555; }
    .stats-row { text-align: center; margin: 1.25em 0; }
    .callout { background: ${accentLight}; border-left: 4px solid ${accent}; border-radius: 0 8px 8px 0; padding: 0.75em 1em; margin: 0.75em 0; font-size: 0.92em; }
    .callout-blue { background: #EFF6FF; border-left-color: #3B82F6; }
    .callout-green { background: #F0FDF4; border-left-color: #22C55E; }
    .scoring-header { background: ${accent}; color: white; padding: 0.35em 0.75em; border-radius: 6px 6px 0 0; font-size: 0.8em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; display: inline-block; margin-bottom: -1px; }
    .scoring-body { border: 2px solid ${accent}; border-radius: 0 8px 8px 8px; padding: 0.75em 1em; margin-bottom: 1em; }
    .scoring-body ul { margin-left: 1.2em; }
    table { width: 100%; border-collapse: collapse; font-size: 0.88em; margin: 0.75em 0; }
    th { background: ${dark}; color: white; text-align: left; padding: 0.4em 0.6em; font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.04em; }
    td { padding: 0.35em 0.6em; border-bottom: 1px solid #e0e0e5; }
    tr:nth-child(even) td { background: #fafafa; }
    .mermaid-box { background: #f7f7f9; border: 1px solid #e0e0e5; border-radius: 8px; padding: 1em; font-family: monospace; font-size: 0.82em; white-space: pre-wrap; margin: 0.75em 0; }
    .page-break { page-break-before: always; }
    .footer { margin-top: 2rem; padding-top: 0.75rem; border-top: 2px solid ${accent}; text-align: center; font-size: 0.75em; color: #999; }
    .no-print { text-align: center; margin: 1rem auto; max-width: 500px; }
    .no-print p { font-size: 0.85em; color: #666; margin-bottom: 0.75em; }
    .no-print button { padding: 0.6rem 1.5rem; background: ${accent}; color: white; border: none; border-radius: 8px; font-size: 0.95rem; cursor: pointer; font-family: inherit; margin: 0.25em; }
    .no-print button:hover { opacity: 0.9; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75em; }
    .roadmap-item { background: #f7f7f9; border-radius: 8px; padding: 0.6em 0.9em; border-left: 4px solid ${accent}; }
    .roadmap-item .phase { font-size: 0.72em; text-transform: uppercase; letter-spacing: 0.04em; color: ${accent}; font-weight: 700; margin-bottom: 0.2em; }
    .pitch-script { background: #FFFBF0; border: 1px solid #F5E6C8; border-radius: 8px; padding: 1em; margin: 0.5em 0; font-size: 0.9em; line-height: 1.7; }
    .pitch-script .cue { font-size: 0.7em; color: ${accent}; text-transform: uppercase; font-weight: 700; letter-spacing: 0.04em; margin-top: 0.75em; display: block; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
      .cover { padding-top: 4rem; }
    }
  </style>
</head>
<body>

<div class="no-print">
  <p>Use your browser&rsquo;s &ldquo;Save as PDF&rdquo; option in the print dialog to download this pitch document.</p>
  <button onclick="window.print()">Print / Save as PDF</button>
  <button onclick="window.location.href='/api/export/pitch-pdf?mode=cheatsheet'">View Cheat Sheet</button>
</div>

<!-- ===== COVER PAGE ===== -->
<div class="cover">
  <div class="logo">&#x1F52C;</div>
  <h1>Code<span class="accent">Lens</span> AI</h1>
  <div class="tagline">Turn any GitHub repository into an interactive, AI-generated learning course</div>
  <div class="stats-row">
    <div class="stat-card"><div class="num">${stats.totalCourses}</div><div class="label">Courses Created</div></div>
    <div class="stat-card"><div class="num">${stats.totalUsers}</div><div class="label">Users</div></div>
    <div class="stat-card"><div class="num">${stats.generationCount}</div><div class="label">Generations Run</div></div>
  </div>
  <div class="date">${now}</div>
  <div class="team">Hackathon Pitch Document</div>
</div>

<!-- ===== EXECUTIVE SUMMARY ===== -->
<h2>Executive Summary</h2>
<p>CodeLens AI is a full-stack SaaS platform that transforms any public or private GitHub repository into a structured, interactive learning course in minutes. Powered by a multi-stage AI pipeline running on Cloudflare Workers AI with a managed account pool, it extracts abstractions, maps relationships, orders content pedagogically, and generates rich courseware &mdash; complete with quizzes, exercises, architecture cards, dependency maps, Mermaid diagrams, and a Codebase Passport.</p>
<p>The platform supports <strong>four audience personas</strong> (Vibe Coder, New Engineer, Product Manager, Security Auditor), <strong>three depth levels</strong> (overview, standard, deep-dive), and <strong>a Beginner Mode</strong> that injects plain-English summaries for accessibility. Courses include AI safety maps, end-of-module summary cards, jargon busters, and spaced-repetition flashcards &mdash; all exportable as polished PDFs.</p>
<p>Monetisation is handled through Stripe-integrated tiered subscriptions (Free / Pro / Team), with team features including organisations, learning path assignments, course sharing, and progress tracking. The platform is production-deployed on Replit with PostgreSQL (Neon), GitHub OAuth, webhook-driven auto-regeneration, and Inngest background jobs.</p>

<div class="callout">
  <strong>Key differentiator:</strong> CodeLens AI doesn&rsquo;t just document code &mdash; it <em>teaches</em> it. Every course is pedagogically structured with learning objectives, scaffolded content, knowledge checks, and measurable progress, turning passive code reading into active learning.
</div>

<!-- ===== PROBLEM STATEMENT ===== -->
<h2 class="page-break">Problem Statement</h2>
<p>Developer onboarding is one of the most expensive and time-consuming challenges in software engineering:</p>
<ul>
  <li><strong>6.2 months</strong> average time for a new developer to reach full productivity at a new company (State of Developer Onboarding 2023)</li>
  <li><strong>58%</strong> of engineering leaders say onboarding is their biggest team challenge (GitLab Developer Survey 2023)</li>
  <li><strong>$45,000&ndash;$65,000</strong> estimated cost per developer for onboarding (SHRM, adjusted for engineering roles)</li>
  <li><strong>80%</strong> of codebases have inadequate or outdated documentation (GitHub Octoverse)</li>
  <li><strong>50%+</strong> of a new developer&rsquo;s first month is spent reading code without structured guidance (Microsoft Research)</li>
</ul>
<div class="callout-blue callout">
  <strong>The gap:</strong> Static documentation, README files, and wiki pages fail to teach how a codebase actually works. They describe <em>what</em> but not <em>why</em> or <em>how</em>. Developers resort to expensive 1:1 walkthroughs with senior engineers, pulling them away from productive work.
</div>

<!-- ===== SOLUTION OVERVIEW ===== -->
<h2>Solution Overview</h2>
<p>CodeLens AI bridges the gap between raw code and understanding through a <strong>5-stage AI pipeline</strong> that produces pedagogically structured courses from any GitHub repository:</p>
<ol>
  <li><strong>Stage 1 &mdash; Abstraction Extraction:</strong> AI identifies the core concepts, patterns, and components in the codebase</li>
  <li><strong>Stage 2 &mdash; Relationship Mapping:</strong> Determines how abstractions connect, depend on, and interact with each other</li>
  <li><strong>Stage 3 &mdash; Pedagogical Ordering:</strong> Arranges modules in optimal learning sequence using prerequisite analysis</li>
  <li><strong>Stage 4 &mdash; Content Generation:</strong> Produces rich multi-block content with text, code, quizzes, exercises, architecture cards, diagrams, and callouts &mdash; tailored to the chosen audience persona and depth</li>
  <li><strong>Stage 5 &mdash; Assembly &amp; Polish:</strong> Compiles the course with a Codebase Passport, concept index, overview graph, jargon callouts, beginner summaries, AI safety map, and module summary cards</li>
</ol>

<h3>Architecture Diagram</h3>
<div class="mermaid-box">flowchart TB
  subgraph Client["Next.js 15 Frontend"]
    UI[React UI + Course Viewer]
    Auth[GitHub OAuth / Clerk Auth]
  end
  subgraph API["Express 5 API Server"]
    Routes[REST API Routes]
    Inngest[Inngest Background Jobs]
  end
  subgraph Pipeline["AI Pipeline"]
    S1[Stage 1: Abstractions]
    S2[Stage 2: Relationships]
    S3[Stage 3: Ordering]
    S4[Stage 4: Content Gen]
    S5[Stage 5: Assembly]
  end
  subgraph External["External Services"]
    GH[GitHub API]
    CF[Cloudflare Workers AI Pool]
    Stripe[Stripe Billing]
    DB[(PostgreSQL / Neon)]
  end
  UI --&gt; Routes
  Auth --&gt; Routes
  Routes --&gt; Inngest
  Inngest --&gt; S1 --&gt; S2 --&gt; S3 --&gt; S4 --&gt; S5
  S1 &amp; S2 &amp; S3 &amp; S4 --&gt; CF
  Routes --&gt; GH
  Routes --&gt; DB
  Routes --&gt; Stripe
  S5 --&gt; DB</div>

<!-- ===== SCORING CRITERIA ===== -->
<h2 class="page-break">Technical Brilliance (50 marks)</h2>

<div class="scoring-header">1. AI Integration Quality &mdash; /10</div>
<div class="scoring-body">
  <ul>
    <li><strong>Multi-stage AI pipeline</strong> with 5 distinct stages, each with purpose-built prompts for different audience personas and depth levels</li>
    <li><strong>AI Account Pool Manager</strong> with automatic health monitoring, rate-limit rotation, and admin dashboard for managing multiple Cloudflare Workers AI accounts</li>
    <li><strong>Audience-aware generation</strong> &mdash; 4 personas (Vibe Coder, New Engineer, PM, Security Auditor) produce fundamentally different content, not just restyled text</li>
    <li><strong>AI Safety Map</strong> &mdash; automatically identifies and aggregates security-critical warnings across all modules</li>
    <li><strong>Beginner Mode</strong> &mdash; AI-generated plain-English summaries injected after every text block for accessibility</li>
    <li><strong>Jargon Buster</strong> &mdash; first-occurrence technical term detection with inline definitions from a 50+ term glossary</li>
    <li><strong>&ldquo;I&rsquo;m Confused&rdquo; button</strong> &mdash; on-demand AI re-explanation of any block in simpler terms</li>
    <li><strong>Spaced-repetition flashcards</strong> &mdash; AI-generated from course content with SM-2 algorithm scheduling</li>
  </ul>
</div>

<div class="scoring-header">2. Code Quality &amp; Architecture &mdash; /10</div>
<div class="scoring-body">
  <ul>
    <li><strong>pnpm monorepo</strong> with clean workspace separation: <code>@workspace/codelens-web</code>, <code>@workspace/api-server</code>, <code>@workspace/db</code></li>
    <li><strong>Drizzle ORM</strong> with typed schemas across 18+ tables &mdash; users, courses, organisations, learning paths, progress, flashcards, quiz scores, XP events, streaks, badges, and more</li>
    <li><strong>TypeScript throughout</strong> &mdash; strict typing with discriminated unions for course block types (V2Block), proper type narrowing, zero <code>any</code> in core pipeline</li>
    <li><strong>Server-side rendering</strong> with Next.js 15 App Router, server components for data-heavy pages, client components for interactivity</li>
    <li><strong>Error boundaries</strong> wrapping every course block renderer for graceful degradation</li>
    <li><strong>Proper auth middleware</strong> using session cookies with secure, httpOnly flags and CSRF protection</li>
  </ul>
</div>

<div class="scoring-header">3. Innovation &amp; Creativity &mdash; /10</div>
<div class="scoring-body">
  <ul>
    <li><strong>Codebase Passport</strong> &mdash; AI-generated personality summary, complexity level (Beginner/Intermediate/Advanced), detected architecture patterns, test coverage estimate, and top languages &mdash; a &ldquo;DNA card&rdquo; for any repo</li>
    <li><strong>Interactive overview graph</strong> &mdash; force-directed D3 visualisation showing how abstractions connect, with click-to-navigate</li>
    <li><strong>Webhook-driven auto-regeneration</strong> &mdash; courses automatically update when the source repository changes, with diff-based partial regeneration</li>
    <li><strong>Multi-persona courses</strong> &mdash; the same repo produces completely different courses for a vibe coder vs a security auditor</li>
    <li><strong>Gamification layer</strong> &mdash; XP system, daily streaks, badges, and leaderboards tied to module completion and quiz scores</li>
    <li><strong>Team learning paths</strong> &mdash; organisations can create structured sequences of courses with deadlines and progress tracking</li>
  </ul>
</div>

<div class="scoring-header">4. Technical Complexity &mdash; /10</div>
<div class="scoring-body">
  <ul>
    <li><strong>Real-time progress streaming</strong> via Server-Sent Events during course generation &mdash; users see each pipeline stage with live status updates</li>
    <li><strong>AI account pool</strong> with health monitoring, automatic failover, rate-limit detection, and round-robin load balancing across multiple provider accounts</li>
    <li><strong>GitHub API integration</strong> &mdash; file tree walking, content fetching, language detection, webhook registration/management, and OAuth token management</li>
    <li><strong>Inngest background jobs</strong> for long-running course generation (5&ndash;15 minutes), with progress persistence and crash recovery</li>
    <li><strong>Spaced-repetition engine</strong> implementing the SM-2 algorithm with per-card difficulty tracking and optimal review scheduling</li>
    <li><strong>PDF export engine</strong> rendering full courses as print-optimised HTML with variant-specific callout styling, module summaries, and page break management</li>
  </ul>
</div>

<div class="scoring-header">5. Problem-Solving Effectiveness &mdash; /10</div>
<div class="scoring-body">
  <ul>
    <li><strong>Directly addresses</strong> the $45K+ onboarding cost problem with automated, structured codebase learning</li>
    <li><strong>Multiple audience modes</strong> ensure the tool works for diverse teams &mdash; not just developers, but PMs and security reviewers too</li>
    <li><strong>Beginner Mode + Jargon Buster</strong> make AI-generated content accessible to junior developers and non-engineers</li>
    <li><strong>Team features</strong> (orgs, assignments, learning paths, progress tracking) solve the enterprise onboarding workflow end-to-end</li>
    <li><strong>Webhook auto-regeneration</strong> solves the &ldquo;stale documentation&rdquo; problem that plagues every engineering team</li>
    <li><strong>Export capabilities</strong> (PDF, share links) enable offline learning and distribution beyond the platform</li>
  </ul>
</div>

<h2 class="page-break">Industry Readiness (50 marks)</h2>

<div class="scoring-header">6. Business Viability &amp; Market Fit &mdash; /10</div>
<div class="scoring-body">
  <ul>
    <li><strong>Clear value proposition:</strong> &ldquo;Paste a GitHub URL, get an interactive course in minutes&rdquo; &mdash; zero learning curve</li>
    <li><strong>Three-tier pricing</strong> with Stripe integration: Free (3 courses/mo), Pro ($19/mo, unlimited), Team ($49/user/mo, org features)</li>
    <li><strong>B2B expansion ready</strong> &mdash; team/organisation features with learning paths, assignments, and admin dashboards</li>
    <li><strong>Network effects:</strong> public courses create a searchable learning library, driving organic discovery</li>
    <li><strong>Proven willingness to pay</strong> &mdash; developer education is a $15B+ market (HolonIQ 2024), tools like Pluralsight, Codecademy, and Educative validate the space</li>
  </ul>
</div>

<div class="scoring-header">7. Scalability &amp; Growth Potential &mdash; /10</div>
<div class="scoring-body">
  <ul>
    <li><strong>Horizontal AI scaling</strong> via account pool &mdash; add more Cloudflare Workers AI accounts to increase throughput without infrastructure changes</li>
    <li><strong>Content is the moat:</strong> every generated course adds to the platform&rsquo;s value; courses improve as AI models improve</li>
    <li><strong>Enterprise pipeline:</strong> Free &rarr; Pro &rarr; Team &rarr; Enterprise is a natural upgrade path with increasing ARPU</li>
    <li><strong>API-first architecture</strong> enables future integrations (VS Code extension, Slack bot, CI/CD integration)</li>
    <li><strong>Multi-region ready</strong> &mdash; Cloudflare Workers run at the edge; database can be replicated across regions</li>
  </ul>
</div>

<div class="scoring-header">8. User Experience &amp; Design &mdash; /10</div>
<div class="scoring-body">
  <ul>
    <li><strong>One-click generation:</strong> paste a URL, pick a persona and depth, click generate &mdash; course ready in minutes</li>
    <li><strong>Interactive course viewer</strong> with module navigation, progress tracking, quiz scoring, and exercise completion</li>
    <li><strong>Dark/light mode</strong> with system preference detection and persistent user preference</li>
    <li><strong>Responsive design</strong> from mobile to desktop with touch-friendly navigation</li>
    <li><strong>Gamification feedback loops:</strong> XP gains, streak tracking, badges, and completion celebrations maintain engagement</li>
    <li><strong>Accessibility features:</strong> Beginner Mode, jargon busters, &ldquo;I&rsquo;m Confused&rdquo; re-explanations, and keyboard navigation</li>
  </ul>
</div>

<div class="scoring-header">9. Presentation Quality &mdash; /10</div>
<div class="scoring-body">
  <ul>
    <li><strong>Professional pitch document</strong> (this document) with live platform statistics, structured scoring breakdown, and print-optimised formatting</li>
    <li><strong>Condensed cheat sheet</strong> available for presenter quick-reference during live demonstration</li>
    <li><strong>Live demo ready:</strong> platform is production-deployed and accessible for real-time demonstration</li>
    <li><strong>Clear narrative arc:</strong> Problem &rarr; Gap &rarr; Solution &rarr; Features &rarr; Market &rarr; Roadmap</li>
  </ul>
</div>

<div class="scoring-header">10. Completeness &amp; Polish &mdash; /10</div>
<div class="scoring-body">
  <ul>
    <li><strong>End-to-end functional:</strong> from GitHub URL input to interactive course completion to PDF export</li>
    <li><strong>Production-grade infrastructure:</strong> PostgreSQL with Drizzle migrations, session auth, error boundaries, input validation</li>
    <li><strong>No placeholder data:</strong> all features work with real repositories, real AI generation, real Stripe payments</li>
    <li><strong>Comprehensive feature set:</strong> 18+ database tables, 4 audience personas, 3 depth levels, gamification, teams, learning paths, flashcards, PDF export, webhook automation</li>
    <li><strong>Edge case handling:</strong> rate limit recovery, generation failure retry, partial regeneration for changed repos, graceful degradation for missing data</li>
  </ul>
</div>

<!-- ===== FEATURE INVENTORY ===== -->
<h2 class="page-break">Complete Feature Inventory</h2>
<table>
  <thead>
    <tr><th>Category</th><th>Feature</th><th>Status</th></tr>
  </thead>
  <tbody>
    <tr><td>AI Pipeline</td><td>5-stage extraction &rarr; generation pipeline</td><td>Live</td></tr>
    <tr><td>AI Pipeline</td><td>4 audience personas (Vibe Coder, Engineer, PM, Security)</td><td>Live</td></tr>
    <tr><td>AI Pipeline</td><td>3 depth levels (overview, standard, deep-dive)</td><td>Live</td></tr>
    <tr><td>AI Pipeline</td><td>AI account pool with health monitoring</td><td>Live</td></tr>
    <tr><td>AI Pipeline</td><td>Beginner Mode (plain-English summaries)</td><td>Live</td></tr>
    <tr><td>AI Pipeline</td><td>Jargon Buster (inline term definitions)</td><td>Live</td></tr>
    <tr><td>AI Pipeline</td><td>AI Safety Map (security warning aggregation)</td><td>Live</td></tr>
    <tr><td>AI Pipeline</td><td>&ldquo;I&rsquo;m Confused&rdquo; AI re-explanation</td><td>Live</td></tr>
    <tr><td>Course Content</td><td>Text, code, Mermaid diagrams, quizzes, exercises</td><td>Live</td></tr>
    <tr><td>Course Content</td><td>Architecture/dependency/env-var/command cards</td><td>Live</td></tr>
    <tr><td>Course Content</td><td>Codebase Passport with personality summary</td><td>Live</td></tr>
    <tr><td>Course Content</td><td>Interactive overview graph (D3 force-directed)</td><td>Live</td></tr>
    <tr><td>Course Content</td><td>End-of-module summary cards</td><td>Live</td></tr>
    <tr><td>Course Content</td><td>Concept index with cross-module links</td><td>Live</td></tr>
    <tr><td>Learning</td><td>Module progress tracking with completion</td><td>Live</td></tr>
    <tr><td>Learning</td><td>Quiz scoring with per-module scores</td><td>Live</td></tr>
    <tr><td>Learning</td><td>Spaced-repetition flashcards (SM-2)</td><td>Live</td></tr>
    <tr><td>Learning</td><td>XP system with daily streaks</td><td>Live</td></tr>
    <tr><td>Learning</td><td>Badge achievements</td><td>Live</td></tr>
    <tr><td>Collaboration</td><td>Organisations with roles (owner/admin/member)</td><td>Live</td></tr>
    <tr><td>Collaboration</td><td>Learning path assignments with deadlines</td><td>Live</td></tr>
    <tr><td>Collaboration</td><td>Course sharing (public/private + share links)</td><td>Live</td></tr>
    <tr><td>Collaboration</td><td>Course comments and discussions</td><td>Live</td></tr>
    <tr><td>Platform</td><td>Stripe billing (Free/Pro/Team tiers)</td><td>Live</td></tr>
    <tr><td>Platform</td><td>GitHub OAuth + webhook auto-regeneration</td><td>Live</td></tr>
    <tr><td>Platform</td><td>PDF course export with print styling</td><td>Live</td></tr>
    <tr><td>Platform</td><td>Featured/explore course discovery</td><td>Live</td></tr>
    <tr><td>Platform</td><td>Email notifications</td><td>Live</td></tr>
    <tr><td>Platform</td><td>Admin AI pool dashboard</td><td>Live</td></tr>
  </tbody>
</table>

<!-- ===== LIVE STATISTICS ===== -->
<h2>Platform Statistics</h2>
<div class="stats-row">
  <div class="stat-card"><div class="num">${stats.totalCourses}</div><div class="label">Total Courses</div></div>
  <div class="stat-card"><div class="num">${stats.generationCount}</div><div class="label">Generations Run</div></div>
  <div class="stat-card"><div class="num">${stats.totalUsers}</div><div class="label">Registered Users</div></div>
</div>
<div class="callout-green callout">
  <strong>Live data:</strong> These numbers are pulled directly from the production database at the time this document was generated (${now}).
</div>

<!-- ===== TECHNOLOGY STACK ===== -->
<h2 class="page-break">Technology Stack</h2>
<div class="two-col">
  <div>
    <h3>Frontend</h3>
    <ul>
      <li>Next.js 15 (App Router, Server Components)</li>
      <li>React 19 with TypeScript</li>
      <li>TanStack React Query</li>
      <li>D3.js for interactive graphs</li>
      <li>CSS custom properties (no Tailwind)</li>
    </ul>
    <h3>Backend</h3>
    <ul>
      <li>Express 5 API server</li>
      <li>Next.js API routes (server-side)</li>
      <li>Inngest for background job orchestration</li>
      <li>Server-Sent Events for real-time streaming</li>
    </ul>
  </div>
  <div>
    <h3>Data</h3>
    <ul>
      <li>PostgreSQL (Neon serverless)</li>
      <li>Drizzle ORM with typed schema</li>
      <li>18+ tables across users, courses, orgs, progress</li>
    </ul>
    <h3>AI &amp; Integrations</h3>
    <ul>
      <li>Cloudflare Workers AI (managed account pool)</li>
      <li>GitHub REST API + OAuth + Webhooks</li>
      <li>Stripe Billing API</li>
      <li>Clerk Authentication</li>
    </ul>
    <h3>Infrastructure</h3>
    <ul>
      <li>Replit Deployments</li>
      <li>pnpm monorepo workspace</li>
    </ul>
  </div>
</div>

<!-- ===== MARKET SIZING ===== -->
<h2 class="page-break">Market Sizing</h2>
<table>
  <thead>
    <tr><th>Metric</th><th>Value</th><th>Source / Rationale</th></tr>
  </thead>
  <tbody>
    <tr><td><strong>TAM</strong> (Total Addressable Market)</td><td><strong>$15.2B</strong></td><td>Global developer education + corporate technical training market (HolonIQ 2024, Grand View Research)</td></tr>
    <tr><td><strong>SAM</strong> (Serviceable Available Market)</td><td><strong>$2.1B</strong></td><td>Code-specific learning platforms + developer onboarding tools segment (~14% of TAM)</td></tr>
    <tr><td><strong>SOM</strong> (Serviceable Obtainable Market)</td><td><strong>$42M</strong></td><td>~2% of SAM within 3 years, targeting teams with 10&ndash;500 developers using GitHub</td></tr>
  </tbody>
</table>
<div class="callout">
  <strong>Market validation:</strong> Pluralsight ($300M+ ARR at peak), Codecademy (acquired $525M), Educative ($15M+ ARR), and GitBook ($25M+ ARR) demonstrate sustained demand. CodeLens AI differentiates by generating content from the team&rsquo;s own codebase rather than generic curricula.
</div>

<!-- ===== 18-MONTH ROADMAP ===== -->
<h2>18-Month Roadmap</h2>
<div class="two-col">
  <div class="roadmap-item">
    <div class="phase">Q3 2026 &mdash; Foundation</div>
    <ul>
      <li>VS Code extension for in-editor course access</li>
      <li>Private repo support for GitHub Enterprise</li>
      <li>Course version diffing and changelog</li>
    </ul>
  </div>
  <div class="roadmap-item">
    <div class="phase">Q4 2026 &mdash; Growth</div>
    <ul>
      <li>GitLab and Bitbucket support</li>
      <li>API for CI/CD integration</li>
      <li>Custom branding for enterprise</li>
    </ul>
  </div>
  <div class="roadmap-item">
    <div class="phase">Q1 2027 &mdash; Enterprise</div>
    <ul>
      <li>SSO / SAML integration</li>
      <li>Compliance reporting dashboards</li>
      <li>Monorepo support with sub-project courses</li>
    </ul>
  </div>
  <div class="roadmap-item">
    <div class="phase">Q2&ndash;Q4 2027 &mdash; Scale</div>
    <ul>
      <li>Multi-language course generation</li>
      <li>AI tutor chat alongside courses</li>
      <li>Marketplace for community-created courses</li>
    </ul>
  </div>
</div>

<!-- ===== PITCH SCRIPT ===== -->
<h2 class="page-break">Combined Pitch Script (~8 minutes)</h2>
<div class="pitch-script">
  <span class="cue">[0:00 &ndash; 1:00] Opening Hook</span>
  &ldquo;Every developer knows this feeling: you join a new team, you&rsquo;re handed a codebase with thousands of files, and someone says &lsquo;just read the code.&rsquo; Six months later, you&rsquo;re finally productive. That&rsquo;s not a rite of passage &mdash; that&rsquo;s a $50,000 problem.

  I&rsquo;m presenting CodeLens AI &mdash; a platform that turns any GitHub repository into an interactive learning course in minutes, not months.&rdquo;

  <span class="cue">[1:00 &ndash; 2:30] Problem Deep-Dive</span>
  &ldquo;Let me give you the numbers. The average developer takes 6.2 months to reach full productivity at a new company. 58% of engineering leaders say onboarding is their biggest challenge. And 80% of codebases have inadequate documentation.

  The existing solutions &mdash; README files, wiki pages, Confluence docs &mdash; they describe WHAT the code does, but not WHY architectural decisions were made or HOW components interact. Developers end up in expensive 1:1 walkthrough sessions with senior engineers, pulling your most productive people away from shipping.&rdquo;

  <span class="cue">[2:30 &ndash; 4:30] Solution Demo</span>
  &ldquo;CodeLens AI solves this with a 5-stage AI pipeline. Watch &mdash; I paste a GitHub URL, choose an audience persona &mdash; let&rsquo;s pick &lsquo;New Engineer&rsquo; &mdash; select standard depth, and hit generate.

  In a few minutes, the AI extracts every core abstraction in the codebase, maps how they relate to each other, orders them in the optimal learning sequence, and generates a complete interactive course with rich content: text explanations, real code snippets from the repo, architecture decision cards, Mermaid diagrams, quizzes to test understanding, and hands-on exercises.

  Each course gets a Codebase Passport &mdash; think of it as a DNA card for the repo. It shows the complexity level, detected patterns, test coverage, and a personality summary generated by AI.

  And here&rsquo;s the kicker &mdash; toggle Beginner Mode and every section gets a plain-English summary. Hit &lsquo;I&rsquo;m Confused&rsquo; on any block and AI re-explains it at a simpler level. No one gets left behind.&rdquo;

  <span class="cue">[4:30 &ndash; 5:30] Differentiators</span>
  &ldquo;What makes this different from Pluralsight or Codecademy? Three things.

  First, it uses YOUR code. Not generic tutorials &mdash; your team&rsquo;s actual codebase, architecture decisions, and patterns.

  Second, it serves four different audiences from the same repo. A security auditor sees a completely different course than a vibe coder. A PM gets product context, not implementation details.

  Third, it stays current. Set up a webhook and when the repo changes, the course automatically regenerates. No more stale docs.&rdquo;

  <span class="cue">[5:30 &ndash; 6:30] Business Model &amp; Traction</span>
  &ldquo;We&rsquo;re running a three-tier SaaS model through Stripe. Free tier gives you 3 courses per month. Pro at $19/month is unlimited. Team at $49 per user adds organisations, learning paths, assignments, and progress tracking &mdash; that&rsquo;s the enterprise wedge.

  Right now we have ${stats.totalUsers} registered users, ${stats.totalCourses} courses created, and ${stats.generationCount} total generations run. The platform is live and production-deployed.&rdquo;

  <span class="cue">[6:30 &ndash; 7:30] Market &amp; Roadmap</span>
  &ldquo;The developer education market is $15 billion and growing. Pluralsight peaked at $300M+ ARR. Codecademy was acquired for $525M. We&rsquo;re entering this space with a fundamentally different approach &mdash; generated, not curated.

  Our roadmap: VS Code extension this quarter, GitLab and Bitbucket support next quarter, then enterprise features &mdash; SSO, compliance reporting, and eventually a marketplace for community-created courses.&rdquo;

  <span class="cue">[7:30 &ndash; 8:00] Close</span>
  &ldquo;CodeLens AI turns your biggest engineering bottleneck &mdash; codebase knowledge transfer &mdash; into an automated, interactive, measurable process. Stop paying $50K per developer to &lsquo;just read the code.&rsquo; Let AI teach it instead.

  Thank you.&rdquo;
</div>

<!-- ===== FOOTER ===== -->
<div class="footer">
  <p>CodeLens AI &mdash; Hackathon Pitch Document &mdash; Generated ${now}</p>
  <p>Platform statistics are live from production. All features described are implemented and functional.</p>
</div>

</body>
</html>`;
}
