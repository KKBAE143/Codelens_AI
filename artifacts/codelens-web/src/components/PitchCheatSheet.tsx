import type { PitchStats } from "./PitchDocument";

export function buildPitchCheatSheetHtml(stats: PitchStats): string {
  const now = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const accent = "#E85D30";
  const accentLight = "#FFF0EB";
  const dark = "#1a1a2e";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CodeLens AI &mdash; Presenter Cheat Sheet</title>
  <style>
    @page { margin: 0.4in; size: letter; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 8.5pt; line-height: 1.4; color: ${dark}; max-width: 850px; margin: 0 auto; padding: 0.5rem; }
    h1 { font-size: 1.3em; text-align: center; margin-bottom: 0.3em; }
    h2 { font-size: 0.85em; color: white; background: ${accent}; padding: 0.2em 0.5em; border-radius: 4px; margin: 0.5em 0 0.25em; text-transform: uppercase; letter-spacing: 0.04em; }
    .accent { color: ${accent}; }
    .three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.4em; }
    .stat { text-align: center; background: ${accentLight}; border: 1.5px solid ${accent}; border-radius: 6px; padding: 0.3em; }
    .stat .num { font-size: 1.5em; font-weight: 800; color: ${accent}; }
    .stat .label { font-size: 0.65em; text-transform: uppercase; color: #555; }
    ul { margin: 0.15em 0 0.15em 1em; }
    li { margin: 0.08em 0; }
    .script-cue { font-size: 0.65em; color: ${accent}; text-transform: uppercase; font-weight: 700; margin-top: 0.3em; display: block; }
    .script-text { font-size: 0.82em; line-height: 1.35; margin-bottom: 0.15em; }
    table { width: 100%; border-collapse: collapse; font-size: 0.78em; }
    th { background: ${dark}; color: white; padding: 0.2em 0.4em; text-align: left; font-size: 0.75em; }
    td { padding: 0.15em 0.4em; border-bottom: 1px solid #eee; }
    .no-print { text-align: center; margin: 0.5rem auto; }
    .no-print button { padding: 0.4rem 1rem; background: ${accent}; color: white; border: none; border-radius: 6px; font-size: 0.85rem; cursor: pointer; margin: 0.2em; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
<div class="no-print">
  <button onclick="window.print()">Print Cheat Sheet</button>
  <button onclick="window.location.href='/api/export/pitch-pdf'">View Full Pitch</button>
</div>
<h1>Code<span class="accent">Lens</span> AI &mdash; Presenter Cheat Sheet</h1>

<h2>Key Stats to Memorise</h2>
<div class="three-col">
  <div class="stat"><div class="num">${stats.totalCourses}</div><div class="label">Courses Created</div></div>
  <div class="stat"><div class="num">${stats.totalUsers}</div><div class="label">Users</div></div>
  <div class="stat"><div class="num">${stats.generationCount}</div><div class="label">Generations Run</div></div>
</div>
<div class="three-col" style="margin-top:0.3em">
  <div class="stat"><div class="num">6.2mo</div><div class="label">Avg Onboarding</div></div>
  <div class="stat"><div class="num">$45K+</div><div class="label">Cost/Developer</div></div>
  <div class="stat"><div class="num">$15.2B</div><div class="label">TAM</div></div>
</div>

<h2>8-Minute Script Cues</h2>
<span class="script-cue">[0:00-1:00] Hook</span>
<div class="script-text">&ldquo;Join a new team, handed thousands of files, told to &lsquo;just read the code.&rsquo; 6 months later you&rsquo;re productive. That&rsquo;s a $50K problem. CodeLens AI turns any GitHub repo into an interactive course in minutes.&rdquo;</div>

<span class="script-cue">[1:00-2:30] Problem</span>
<div class="script-text">6.2mo onboarding, 58% leaders say biggest challenge, 80% codebases under-documented. READMEs describe WHAT not WHY/HOW. Senior engineers pulled into walkthrough sessions.</div>

<span class="script-cue">[2:30-4:30] Demo</span>
<div class="script-text">Paste GitHub URL &rarr; pick persona (New Engineer) &rarr; generate. 5-stage AI pipeline: extract abstractions, map relationships, order pedagogically, generate content, assemble course. Show: Codebase Passport, Beginner Mode, &ldquo;I&rsquo;m Confused&rdquo; button.</div>

<span class="script-cue">[4:30-5:30] Differentiators</span>
<div class="script-text">1) Uses YOUR code, not generic tutorials. 2) 4 personas from same repo. 3) Webhook auto-regeneration &mdash; always current.</div>

<span class="script-cue">[5:30-6:30] Business</span>
<div class="script-text">Stripe 3-tier: Free (3/mo), Pro ($19/mo unlimited), Team ($49/user &mdash; orgs, learning paths). ${stats.totalUsers} users, ${stats.totalCourses} courses, ${stats.generationCount} generations.</div>

<span class="script-cue">[6:30-7:30] Market</span>
<div class="script-text">$15.2B market. Pluralsight $300M+ ARR, Codecademy acquired $525M. Our approach: generated, not curated. Roadmap: VS Code ext &rarr; GitLab/Bitbucket &rarr; SSO/enterprise &rarr; marketplace.</div>

<span class="script-cue">[7:30-8:00] Close</span>
<div class="script-text">&ldquo;Stop paying $50K/dev to &lsquo;just read the code.&rsquo; Let AI teach it. Thank you.&rdquo;</div>

<h2>Feature Inventory</h2>
<table>
  <thead><tr><th>Area</th><th>Features</th></tr></thead>
  <tbody>
    <tr><td>AI Pipeline</td><td>5-stage pipeline, 4 personas, 3 depths, account pool, Beginner Mode, Jargon Buster, Safety Map, &ldquo;I&rsquo;m Confused&rdquo;</td></tr>
    <tr><td>Content</td><td>Text/code/Mermaid/quizzes/exercises, architecture cards, Codebase Passport, overview graph, module summaries, concept index</td></tr>
    <tr><td>Learning</td><td>Progress tracking, quiz scoring, SM-2 flashcards, XP + streaks + badges</td></tr>
    <tr><td>Teams</td><td>Organisations, learning paths, assignments, deadlines, comments, sharing</td></tr>
    <tr><td>Platform</td><td>Stripe billing, GitHub OAuth + webhooks, PDF export, admin dashboard, email notifications</td></tr>
  </tbody>
</table>

<div style="text-align:center;margin-top:0.4em;font-size:0.7em;color:#999">CodeLens AI &mdash; ${now} &mdash; Live stats from production</div>
</body>
</html>`;
}
