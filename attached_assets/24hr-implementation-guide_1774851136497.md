# CodeLens AI — 24-Hour Hackathon Implementation Guide

## The One Rule: If judges don't say "wow" at the generated course, nothing else matters.

---

## Project Structure (Minimal)

```
codelens/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── layout.tsx                  # Root layout
│   ├── globals.css                 # Tailwind + custom styles
│   ├── dashboard/
│   │   └── page.tsx                # Course list (can be static for demo)
│   ├── course/
│   │   └── [id]/
│   │       └── page.tsx            # Course viewer (renders generated HTML)
│   └── api/
│       └── generate/
│           └── route.ts            # POST: GitHub URL → Generated course HTML
├── components/
│   ├── hero.tsx                    # Landing hero section
│   ├── url-input.tsx               # GitHub URL input with generation status
│   ├── course-card.tsx             # Course preview card
│   ├── course-viewer.tsx           # Renders the generated HTML course
│   └── generation-progress.tsx     # Real-time generation progress UI
├── lib/
│   ├── ai.ts                      # AI pipeline (Stage 1-3 prompts)
│   ├── github.ts                   # Clone repo + extract files
│   └── prompts.ts                  # All AI prompts (from prompt system doc)
├── public/
│   └── demos/                      # Pre-generated course HTML files
│       ├── cal-com.html
│       ├── express-api.html
│       └── react-library.html
├── package.json
├── tailwind.config.ts
├── next.config.js
└── .env.local                      # API keys
```

---

## Hour-by-Hour Battle Plan

### HOURS 0-2: Project Setup + GitHub Integration

```bash
npx create-next-app@latest codelens --typescript --tailwind --app --src-dir=false
cd codelens
npm install @google/genai         # Gemini API (free)
# OR
npm install @anthropic-ai/sdk     # Claude API (paid but better)
```

**.env.local:**
```
GEMINI_API_KEY=your_key_here
# OR
ANTHROPIC_API_KEY=your_key_here
GITHUB_TOKEN=your_github_pat      # For cloning private repos (optional)
```

**lib/github.ts** — Extract files from a GitHub repo:
```typescript
export async function extractRepoContent(githubUrl: string) {
  // Parse owner/repo from URL
  const match = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) throw new Error('Invalid GitHub URL');
  const [, owner, repo] = match;
  
  // Use GitHub API to get file tree (no cloning needed!)
  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`,
    { headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } }
  );
  const tree = await treeRes.json();
  
  // Priority files to read
  const priorities = [
    /README\.md$/i,
    /package\.json$/, /requirements\.txt$/, /Cargo\.toml$/,
    /^src\/(index|app|main)\./,
    /^src\/(pages|routes|api)\//,
    /^src\/(components|services|lib)\//,
    /\.(ts|tsx|js|jsx|py|rs|go)$/
  ];
  
  // Score and sort files by priority
  const scoredFiles = tree.tree
    .filter((f: any) => f.type === 'blob' && f.size < 50000) // Skip huge files
    .map((f: any) => ({
      path: f.path,
      score: priorities.findIndex(p => p.test(f.path)),
      size: f.size
    }))
    .filter((f: any) => f.score >= 0)
    .sort((a: any, b: any) => a.score - b.score);
  
  // Read top ~20 files (stay under token limits)
  const filesToRead = scoredFiles.slice(0, 20);
  const files = await Promise.all(
    filesToRead.map(async (f: any) => {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${f.path}`,
        { headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } }
      );
      const data = await res.json();
      return {
        path: f.path,
        content: Buffer.from(data.content, 'base64').toString('utf-8'),
        language: f.path.split('.').pop()
      };
    })
  );
  
  // Build file tree string
  const fileTree = tree.tree
    .filter((f: any) => f.type === 'blob')
    .map((f: any) => f.path)
    .join('\n');
  
  return { fileTree, files, repoName: repo, owner };
}
```

### HOURS 2-6: AI Pipeline

**lib/ai.ts** — The complete generation pipeline:
```typescript
import { GoogleGenAI } from '@google/genai';
// import Anthropic from '@anthropic-ai/sdk';

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function generateCourse(
  fileTree: string, 
  files: Array<{path: string, content: string, language: string}>,
  repoName: string,
  onProgress?: (stage: string, detail: string) => void
) {
  // STAGE 1: Analyze
  onProgress?.('analyzing', 'Reading codebase structure...');
  
  const fileContent = files.map(f => 
    `--- ${f.path} (${f.language}) ---\n${f.content}\n---`
  ).join('\n\n');

  const analysisResponse = await genai.models.generateContent({
    model: 'gemini-2.5-flash',  
    contents: `You are a senior software architect. Analyze this codebase and return ONLY a JSON object with these fields:
    - app_name, one_liner, tech_stack (languages, frameworks, databases, key_libraries)
    - actors (name, file_path, role, personality — unique metaphor each, NEVER "restaurant")
    - user_journey (trigger + steps with code snippets and plain english translations)
    - clever_patterns, api_integrations, potential_gotchas
    - suggested_modules (5-7), difficulty_assessment

FILE TREE:\n${fileTree}\n\nFILES:\n${fileContent}\n\nReturn ONLY valid JSON.`,
  });

  const analysis = JSON.parse(analysisResponse.text!);
  
  // STAGE 2: Design curriculum
  onProgress?.('designing', 'Designing course curriculum...');
  
  const curriculumResponse = await genai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `You are an instructional designer for non-technical learners. Given this codebase analysis, design a course curriculum.

Return ONLY a JSON object with:
- course_title, course_description, estimated_time_minutes
- modules (5-7), each with: title, subtitle, screens (3-5 per module)
  - Screen types: intro, trace, code_translation, quiz, architecture, aha_moment
  - Each code_translation has: file, code (EXACT from codebase), translations (line → english)
  - Each quiz has: question (scenario-based, NOT memorization), options with correct/explanation
  - Each module has: unique metaphor (NEVER "restaurant"), glossary_terms

RULES:
- Module 1 = "What this app does" + trace primary user action
- Every module: 1+ code translation, 1 quiz, 1 visual
- Quiz = "Where would you look if X broke?" NOT "What does Y stand for?"
- Max 2-3 sentences per text block
- Tooltip EVERY technical term

Analysis:\n${JSON.stringify(analysis, null, 2)}\n\nReturn ONLY valid JSON.`,
  });

  const curriculum = JSON.parse(curriculumResponse.text!);
  
  // STAGE 3: Generate HTML
  onProgress?.('generating', 'Building interactive course...');
  
  const htmlResponse = await genai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Generate a COMPLETE self-contained HTML file for this interactive course.

REQUIREMENTS:
- Scroll-snap navigation, progress bar, keyboard nav
- Code ↔ Plain English side-by-side translations (dark code theme #1E1E2E)  
- Interactive quizzes with feedback
- Glossary tooltips (position:fixed, getBoundingClientRect)
- Architecture SVG diagrams
- Fonts: Bricolage Grotesque (headings), DM Sans (body), JetBrains Mono (code)
- Colors: #FAF9F6 bg, #E85D30 accent, #1A7F64 teal, #2C2C2A text
- Alternating section backgrounds
- Mobile responsive
- NO external dependencies except Google Fonts
- "Generated by CodeLens AI" branding

Curriculum:\n${JSON.stringify(curriculum, null, 2)}\n\nReturn ONLY the complete HTML.`,
  });

  return {
    analysis,
    curriculum, 
    html: htmlResponse.text!
  };
}
```

**app/api/generate/route.ts:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { extractRepoContent } from '@/lib/github';
import { generateCourse } from '@/lib/ai';

export async function POST(req: NextRequest) {
  try {
    const { githubUrl } = await req.json();
    
    // Extract repo content
    const { fileTree, files, repoName } = await extractRepoContent(githubUrl);
    
    // Generate course
    const result = await generateCourse(fileTree, files, repoName);
    
    // Return the generated course
    return NextResponse.json({
      success: true,
      courseId: `course-${Date.now()}`,
      repoName,
      html: result.html,
      analysis: result.analysis,
      curriculum: result.curriculum
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export const maxDuration = 120; // Allow 2 minutes for generation
```

### HOURS 6-14: Frontend (Your Superpower)

This is where you shine. Build these 3 pages:

**1. Landing Page** — Hero + URL Input + Demo showcase
**2. Dashboard** — Grid of course cards (pre-generated + user-generated)
**3. Course Viewer** — Full-screen iframe rendering the generated HTML

Key components to make stunning:

**components/url-input.tsx** (the hero interaction):
```tsx
'use client';
import { useState } from 'react';

export function UrlInput() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle'|'generating'|'done'|'error'>('idle');
  const [progress, setProgress] = useState('');
  
  const generate = async () => {
    setStatus('generating');
    const stages = [
      'Cloning repository...',
      'Analyzing codebase structure...',
      'Identifying components and data flows...',
      'Designing course curriculum...',
      'Building interactive modules...',
      'Adding quizzes and visualizations...',
      'Polishing the final course...'
    ];
    
    // Fake progress while waiting (real generation happens server-side)
    let i = 0;
    const interval = setInterval(() => {
      if (i < stages.length) setProgress(stages[i++]);
    }, 3000);
    
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubUrl: url })
      });
      const data = await res.json();
      clearInterval(interval);
      
      if (data.success) {
        // Store in localStorage for demo purposes (no DB needed!)
        const courses = JSON.parse(localStorage.getItem('courses') || '[]');
        courses.push({
          id: data.courseId,
          repoName: data.repoName,
          html: data.html,
          createdAt: new Date().toISOString()
        });
        localStorage.setItem('courses', JSON.stringify(courses));
        
        setStatus('done');
        // Redirect to course viewer
        window.location.href = `/course/${data.courseId}`;
      }
    } catch (err) {
      clearInterval(interval);
      setStatus('error');
    }
  };
  
  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex gap-3">
        <input 
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a GitHub URL → get an interactive course"
          className="flex-1 px-5 py-4 rounded-xl border-2 border-gray-200 
                     text-lg focus:border-[#E85D30] focus:outline-none
                     transition-colors"
        />
        <button 
          onClick={generate}
          disabled={status === 'generating'}
          className="px-8 py-4 bg-[#E85D30] text-white rounded-xl
                     font-semibold text-lg hover:bg-[#d14e28] 
                     transition-colors disabled:opacity-50"
        >
          {status === 'generating' ? 'Generating...' : 'Generate Course'}
        </button>
      </div>
      
      {status === 'generating' && (
        <div className="mt-6 p-4 bg-orange-50 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="animate-spin w-5 h-5 border-2 border-[#E85D30] 
                            border-t-transparent rounded-full" />
            <span className="text-[#E85D30] font-medium">{progress}</span>
          </div>
          <div className="mt-3 w-full bg-orange-100 rounded-full h-2">
            <div className="bg-[#E85D30] h-2 rounded-full transition-all duration-1000"
                 style={{width: `${Math.min(90, (progress ? 15 * (stages.indexOf(progress) + 1) : 0))}%`}} />
          </div>
        </div>
      )}
    </div>
  );
}
```

### HOURS 14-20: Integration + Demo Courses

1. Wire everything together
2. Pre-generate 3 demo courses (use Claude Sonnet for best quality)
3. Put pre-generated HTML files in `/public/demos/`
4. Deploy to Vercel: `vercel --prod`

### HOURS 20-24: Polish + Demo Prep

1. Loading animations (skeleton screens, spinners)
2. Error handling (graceful failures)
3. Mobile responsiveness
4. Demo script (write it down!)
5. Record backup video
6. Practice the 5-minute pitch

---

## Demo Script (5 minutes)

**[0:00-0:30] The Hook**
"Every day, millions of people build apps with AI without understanding a single line of code. When something breaks, they're stuck. We built CodeLens AI to fix that."

**[0:30-1:30] Live Demo — Paste URL**
- Open CodeLens landing page
- Paste a GitHub URL (use a small repo for speed)
- Show generation progress
- While waiting, explain: "It's analyzing the codebase, identifying components, tracing data flows, and designing a personalized curriculum."

**[1:30-3:30] Show Pre-Generated Course**
- Switch to a pre-generated course (cal.com or similar)
- Scroll through Module 1: "Look — it traced what happens when you book a meeting"
- Show code ↔ English translation: "Left is real code, right is plain English"
- Hover a glossary term: "Every technical word has a definition"
- Click a quiz: "This isn't 'what does API stand for' — it asks 'where would you look if bookings stopped working'"
- Show architecture diagram

**[3:30-4:30] The Market**
"Developer onboarding costs companies 2-3 weeks per new hire. When employees leave, 42% of their knowledge is lost forever. And 92% of developers now use AI coding tools but can't debug what they build. CodeLens turns any codebase into a self-serve learning experience."

**[4:30-5:00] Close**
"Paste a URL, get a course. No coding knowledge required. We're CodeLens AI."

---

## Emergency Fallbacks

| If This Fails | Do This Instead |
|---------------|-----------------|
| AI generates broken HTML | Use pre-generated demo courses only. Show "generation in progress" during demo |
| GitHub API rate limit | Pre-download repo contents as JSON, use that |
| Vercel deploy fails | Run locally with `npm run dev` on your laptop |
| Live generation too slow | Show the generation starting, then "fast forward" to pre-generated result |
| Internet dies | Have everything pre-loaded in browser tabs |

---

## What Impresses Judges (from 15+ hackathon experience)

1. **The "wow" moment** — When the generated course appears with beautiful code translations, animated diagrams, and interactive quizzes — that's your wow moment. Protect it.

2. **Business case** — You have hard numbers: $750K/year cost of knowledge loss, 78% of devs struggle with codebases, $4.7B vibe coding market. USE THEM.

3. **Technical depth** — Mention the multi-stage AI pipeline, AST parsing, curriculum design principles. Show you're not just wrapping an API.

4. **Design quality** — The course should look like a Y Combinator startup built it, not a hackathon project. Warm colors, custom fonts, generous whitespace.

5. **Completeness** — End-to-end flow works: URL → generation → viewing → sharing. Even if parts are pre-generated, the flow should feel seamless.
