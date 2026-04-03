export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { courses, courseAssignments } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import {
  parseV2Course,
  type V2Block,
  type V2Module,
} from "@/lib/course-types";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\bon\w+\s*=\s*\S+/gi, "")
    .replace(/javascript\s*:/gi, "");
}

function renderBlock(block: V2Block): string {
  switch (block.type) {
    case "text":
      return `<div class="block block-text">${sanitizeHtml(block.content)}</div>`;
    case "code":
      return `<div class="block block-code">
        ${block.filePath ? `<div class="code-path">${escapeHtml(block.filePath)}</div>` : ""}
        <pre><code>${escapeHtml(block.content)}</code></pre>
        ${block.caption ? `<div class="code-caption">${escapeHtml(block.caption)}</div>` : ""}
      </div>`;
    case "callout":
      return `<div class="block block-callout callout-${escapeHtml(block.variant || "info")}">
        <div class="callout-content">${sanitizeHtml(block.content)}</div>
      </div>`;
    case "quiz":
      return `<div class="block block-quiz">
        <div class="quiz-label">Quiz</div>
        <div class="quiz-question">${escapeHtml(block.question)}</div>
        ${block.scenario ? `<div class="quiz-scenario">${escapeHtml(block.scenario)}</div>` : ""}
        <ol class="quiz-options">
          ${block.options.map((o) => `<li class="${o.correct ? "correct" : ""}">${escapeHtml(o.text)}${o.correct ? " ✓" : ""}</li>`).join("")}
        </ol>
      </div>`;
    case "mermaid":
      return `<div class="block block-mermaid">
        <div class="mermaid-label">Diagram</div>
        <pre class="mermaid-source">${escapeHtml(block.source)}</pre>
        ${block.caption ? `<div class="mermaid-caption">${escapeHtml(block.caption)}</div>` : ""}
      </div>`;
    case "exercise":
      return `<div class="block block-exercise">
        <div class="exercise-label">Exercise: ${escapeHtml(block.title)}</div>
        <div class="exercise-task">${escapeHtml(block.task)}</div>
        ${block.verificationHint ? `<div class="exercise-hint"><strong>Hint:</strong> ${escapeHtml(block.verificationHint)}</div>` : ""}
      </div>`;
    case "file-list":
      return `<div class="block block-file-list">
        <div class="file-list-label">Key Files</div>
        <table class="file-table">
          <thead><tr><th>File</th><th>Role</th></tr></thead>
          <tbody>${block.files.map((f) => `<tr><td><code>${escapeHtml(f.path)}</code></td><td>${escapeHtml(f.role)}</td></tr>`).join("")}</tbody>
        </table>
      </div>`;
    case "architecture-card":
      return `<div class="block block-card">
        <div class="card-label">Architecture Decision</div>
        <p><strong>Decision:</strong> ${escapeHtml(block.decision)}</p>
        <p><strong>Rationale:</strong> ${escapeHtml(block.rationale)}</p>
        <p><strong>Tradeoffs:</strong> ${escapeHtml(block.tradeoffs)}</p>
      </div>`;
    case "dependency-card":
      return `<div class="block block-card">
        <div class="card-label">Dependency: ${escapeHtml(block.packageName)}</div>
        <p>${escapeHtml(block.purpose)}</p>
      </div>`;
    case "env-var-card":
      return `<div class="block block-card">
        <div class="card-label">Environment Variable: <code>${escapeHtml(block.varName)}</code></div>
        <p>${escapeHtml(block.purpose)}</p>
      </div>`;
    case "command-card":
      return `<div class="block block-card">
        <div class="card-label">Command</div>
        <pre><code>${escapeHtml(block.command)}</code></pre>
        <p>${escapeHtml(block.when)}</p>
      </div>`;
    default:
      return "";
  }
}

function renderModuleSummary(block: Record<string, unknown>): string {
  const bullets = Array.isArray(block.bullets) ? block.bullets as string[] : [];
  if (bullets.length === 0) return "";
  const title = typeof block.title === "string" ? block.title : "What You Learned";
  return `<div class="module-summary"><div class="module-summary-title">${escapeHtml(title)}</div><ul>${bullets.map((t) => `<li>${escapeHtml(t.replace(/\*\*([^*]+)\*\*/g, "$1"))}</li>`).join("")}</ul></div>`;
}

function renderModule(mod: V2Module, index: number): string {
  const filteredBlocks = mod.blocks.filter((b) => {
    const bAny = b as Record<string, unknown>;
    return !bAny.beginnerOnly;
  });

  const regularBlocks = filteredBlocks.filter((b) => (b as Record<string, unknown>).type !== "module-summary");
  const summaryBlock = filteredBlocks.find((b) => (b as Record<string, unknown>).type === "module-summary");

  const summaryHtml = summaryBlock ? renderModuleSummary(summaryBlock as Record<string, unknown>) : "";

  return `
    <section class="module">
      <h2>Module ${index + 1}: ${escapeHtml(mod.title)}</h2>
      ${mod.learningObjective ? `<p class="learning-objective"><strong>Learning Objective:</strong> ${escapeHtml(mod.learningObjective)}</p>` : ""}
      ${regularBlocks.map(renderBlock).join("\n")}
      ${summaryHtml}
    </section>
  `;
}

function buildPdfHtml(
  repoName: string,
  ownerName: string,
  modules: V2Module[],
  languages: string[],
  frameworks: string[],
  estimatedMinutes: number,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(ownerName)}/${escapeHtml(repoName)} — CodeLens AI Course (PDF)</title>
  <style>
    @page { margin: 0.75in; size: letter; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; max-width: 800px; margin: 0 auto; padding: 2rem 1rem; font-size: 10pt; }
    h1 { font-size: 1.8em; margin-bottom: 0.25em; color: #16213e; }
    h2 { font-size: 1.3em; margin: 1.5em 0 0.5em; color: #16213e; border-bottom: 2px solid #e8e8ec; padding-bottom: 0.3em; page-break-after: avoid; }
    .cover { text-align: center; margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 3px solid #16213e; }
    .cover .meta { color: #666; font-size: 0.9em; margin-top: 0.5em; }
    .cover .badges { display: flex; gap: 0.5em; justify-content: center; margin-top: 0.75em; flex-wrap: wrap; }
    .cover .badge { background: #e8f5e9; color: #2e7d32; padding: 0.15em 0.5em; border-radius: 4px; font-size: 0.8em; }
    .module { margin-bottom: 1.5rem; }
    .learning-objective { font-style: italic; color: #555; margin-bottom: 1em; font-size: 0.9em; }
    .block { margin: 0.75em 0; }
    .block-text { line-height: 1.7; }
    .block-text p { margin: 0.5em 0; }
    .block-text ul, .block-text ol { margin: 0.5em 0 0.5em 1.5em; }
    .block-code { background: #f7f7f9; border: 1px solid #e0e0e5; border-radius: 6px; overflow: hidden; }
    .code-path { background: #e8e8ec; padding: 0.3em 0.75em; font-size: 0.8em; font-family: monospace; color: #555; }
    pre { padding: 0.75em; overflow-x: auto; font-size: 0.85em; white-space: pre-wrap; word-wrap: break-word; }
    code { font-family: "SF Mono", "Fira Code", monospace; }
    .code-caption { padding: 0.3em 0.75em; font-size: 0.8em; color: #666; border-top: 1px solid #e0e0e5; }
    .block-callout { padding: 0.75em 1em; border-radius: 6px; border-left: 4px solid #2196f3; background: #e3f2fd; font-size: 0.9em; }
    .callout-warning { border-left-color: #ff9800; background: #fff3e0; }
    .callout-tip { border-left-color: #4caf50; background: #e8f5e9; }
    .callout-danger { border-left-color: #f44336; background: #ffebee; }
    .block-quiz { background: #f3e5f5; border: 1px solid #ce93d8; border-radius: 6px; padding: 0.75em 1em; }
    .quiz-label, .exercise-label, .file-list-label, .card-label, .mermaid-label { font-weight: 600; font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.3em; color: #555; }
    .quiz-question { font-weight: 500; margin-bottom: 0.5em; }
    .quiz-scenario { font-style: italic; color: #666; margin-bottom: 0.5em; font-size: 0.9em; }
    .quiz-options { margin: 0.5em 0 0.5em 1.25em; }
    .quiz-options li { margin: 0.2em 0; }
    .quiz-options li.correct { font-weight: 600; color: #2e7d32; }
    .block-exercise { background: #e8f5e9; border: 1px solid #a5d6a7; border-radius: 6px; padding: 0.75em 1em; }
    .exercise-hint { margin-top: 0.5em; font-size: 0.85em; color: #555; }
    .block-card { background: #fff8e1; border: 1px solid #ffe082; border-radius: 6px; padding: 0.75em 1em; }
    .block-card p { margin: 0.3em 0; font-size: 0.9em; }
    .file-table { width: 100%; border-collapse: collapse; font-size: 0.85em; margin-top: 0.3em; }
    .file-table th, .file-table td { text-align: left; padding: 0.3em 0.5em; border-bottom: 1px solid #e0e0e5; }
    .file-table th { font-weight: 600; color: #555; }
    .mermaid-source { background: #f0f0f5; font-size: 0.8em; }
    .mermaid-caption { font-size: 0.8em; color: #666; font-style: italic; }
    .toc { margin: 1rem 0 2rem; }
    .toc h2 { font-size: 1.1em; margin-bottom: 0.5em; }
    .toc ol { margin-left: 1.25em; }
    .toc li { margin: 0.2em 0; font-size: 0.9em; }
    .footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e0e0e5; text-align: center; font-size: 0.8em; color: #999; }
    .no-print { margin: 1rem auto; max-width: 400px; text-align: center; }
    .print-instructions { font-size: 0.85em; color: #666; margin-bottom: 0.75em; line-height: 1.5; }
    .no-print button { padding: 0.75rem 2rem; background: #16213e; color: white; border: none; border-radius: 8px; font-size: 1rem; cursor: pointer; font-family: inherit; }
    .no-print button:hover { background: #1a2744; }
    h3 { font-size: 1.1em; margin: 1em 0 0.4em; color: #16213e; }
    .callout-ai-hint { border-left-color: #6366f1; background: #eef2ff; }
    .callout-security { border-left-color: #ef4444; background: #fef2f2; }
    .callout-command { border-left-color: #0ea5e9; background: #f0f9ff; }
    .callout-first-pr { border-left-color: #22c55e; background: #f0fdf4; }
    .module-summary { background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #22c55e; border-radius: 6px; padding: 0.75em 1em; margin-top: 1em; }
    .module-summary-title { font-weight: 600; font-size: 0.85em; color: #15803d; margin-bottom: 0.4em; }
    .module-summary ul { margin: 0.3em 0 0 1.25em; font-size: 0.85em; }
    .module-summary li { margin: 0.15em 0; }
    @media print {
      body { padding: 0; font-size: 10pt; }
      .module { page-break-before: always; }
      .module:first-of-type { page-break-before: avoid; }
      h2 { page-break-after: avoid; }
      .block-code { page-break-inside: avoid; }
      .block-quiz { page-break-inside: avoid; }
      .block-exercise { page-break-inside: avoid; }
      .block-card { page-break-inside: avoid; }
      .module-summary { page-break-inside: avoid; }
      .no-print { display: none; }
      @page { @top-center { content: "${escapeHtml(ownerName)}/${escapeHtml(repoName)} — CodeLens AI"; font-size: 8pt; color: #999; } }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <p class="print-instructions">Use your browser&rsquo;s &ldquo;Save as PDF&rdquo; option in the print dialog to download this course as a PDF file.</p>
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>

  <div class="cover">
    <h1>${escapeHtml(ownerName)}/${escapeHtml(repoName)}</h1>
    <div class="meta">Generated by CodeLens AI &mdash; ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
    <div class="meta">${modules.length} modules &bull; ~${estimatedMinutes} min</div>
    ${(languages.length || frameworks.length) ? `<div class="badges">${[...languages, ...frameworks].map((t) => `<span class="badge">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
  </div>

  <div class="toc">
    <h2>Table of Contents</h2>
    <ol>
      ${modules.map((m, i) => `<li>Module ${i + 1}: ${escapeHtml(m.title)}</li>`).join("\n      ")}
    </ol>
  </div>

  ${modules.map((m, i) => renderModule(m, i)).join("\n")}

  <div class="footer">
    <p>This course was generated from <strong>${escapeHtml(ownerName)}/${escapeHtml(repoName)}</strong> using CodeLens AI.</p>
  </div>
</body>
</html>`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id: courseId } = await params;

  const [course] = await db
    .select({
      id: courses.id,
      repoName: courses.repoName,
      ownerName: courses.ownerName,
      html: courses.html,
      createdBy: courses.createdBy,
      isPublic: courses.isPublic,
      organizationId: courses.organizationId,
    })
    .from(courses)
    .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)))
    .limit(1);

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  let hasAccess = course.createdBy === user.id || course.isPublic;
  if (!hasAccess && course.organizationId) {
    const [assignment] = await db
      .select({ id: courseAssignments.id })
      .from(courseAssignments)
      .where(and(eq(courseAssignments.courseId, courseId), eq(courseAssignments.assignedTo, user.id)))
      .limit(1);
    if (assignment) hasAccess = true;
  }
  if (!hasAccess) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  let v2Data;
  if (course.html) {
    v2Data = parseV2Course(course.html);
  }

  if (!v2Data) {
    return NextResponse.json({ error: "Course data not available for export" }, { status: 400 });
  }

  const html = buildPdfHtml(
    course.repoName,
    course.ownerName,
    v2Data.modules,
    v2Data.languages,
    v2Data.frameworks,
    v2Data.estimatedTotalMinutes,
  );

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="${course.ownerName}-${course.repoName}-course.html"`,
    },
  });
}
