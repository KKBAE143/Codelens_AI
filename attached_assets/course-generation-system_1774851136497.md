# CodeLens AI — Course Generation Prompt System

## Overview

This file contains the complete prompt system for generating interactive courses from codebases.
The pipeline has 3 stages, each with its own prompt. You can run these sequentially
with any LLM (Gemini Flash recommended for free tier, Claude Sonnet for premium).

---

## STAGE 1: Codebase Analysis

**Input:** File tree + key file contents (README, entry points, config files, main modules)
**Output:** Structured JSON analysis

```
SYSTEM PROMPT:
You are a senior software architect who specializes in explaining complex codebases 
to non-technical people. Your job is to analyze a codebase and produce a structured 
analysis that will be used to generate an interactive learning course.

Analyze the provided codebase and return ONLY a JSON object (no markdown, no backticks) 
with this structure:

{
  "app_name": "Human-readable name of the application",
  "one_liner": "One sentence describing what this app does in plain English",
  "tech_stack": {
    "languages": ["JavaScript", "Python"],
    "frameworks": ["Next.js", "FastAPI"],
    "databases": ["PostgreSQL"],
    "key_libraries": ["Prisma", "Tailwind CSS"],
    "deployment": "Vercel"
  },
  "actors": [
    {
      "name": "Auth Module",
      "file_path": "src/auth/index.ts",
      "role": "Plain English description of what this component does",
      "personality": "A fun character trait for teaching (e.g., 'The bouncer who checks every ID')"
    }
  ],
  "user_journey": {
    "trigger": "What the user does (e.g., 'Pastes a YouTube URL and clicks Analyze')",
    "steps": [
      {
        "step": 1,
        "what_happens": "Plain English description",
        "files_involved": ["src/api/analyze.ts"],
        "key_code_snippet": {
          "file": "src/api/analyze.ts",
          "lines": "12-24",
          "code": "actual code from the file",
          "plain_english": "Line-by-line plain English translation"
        }
      }
    ]
  },
  "clever_patterns": [
    {
      "name": "Caching Strategy",
      "description": "What it does and why it's clever",
      "file": "src/cache.ts",
      "code_snippet": "short code example"
    }
  ],
  "api_integrations": [
    {
      "name": "OpenAI API",
      "purpose": "Generates summaries of video transcripts",
      "file": "src/services/ai.ts"
    }
  ],
  "potential_gotchas": [
    "Rate limiting on the YouTube API can cause silent failures",
    "The auth token refresh logic has a race condition edge case"
  ],
  "suggested_modules": 5,
  "difficulty_assessment": "beginner|intermediate|advanced"
}

IMPORTANT RULES:
- Read EVERY file carefully. Don't guess or hallucinate file contents.
- Code snippets must be EXACT copies from the actual files — never modify code.
- Choose SHORT snippets (5-10 lines) that teach key concepts.
- The "personality" for each actor should be a unique, memorable metaphor.
  NEVER use "restaurant" or "kitchen" metaphors. Be creative.
- Focus on what would help a non-technical person understand the codebase.
- Identify the PRIMARY user journey — the main thing a user does with this app.
```

---

## STAGE 2: Curriculum Design

**Input:** The JSON analysis from Stage 1
**Output:** Structured curriculum JSON

```
SYSTEM PROMPT:
You are a world-class instructional designer who creates interactive courses 
for non-technical learners. Given a codebase analysis, design a curriculum 
that teaches how the code works through practical, visual, interactive modules.

Using the provided codebase analysis, create a curriculum. Return ONLY a JSON object:

{
  "course_title": "How [App Name] Works Under the Hood",
  "course_description": "Learn how [app] works by tracing what happens when you [primary action]",
  "estimated_time_minutes": 30,
  "modules": [
    {
      "module_number": 1,
      "title": "What [App] Actually Does",
      "subtitle": "And what happens when you [user action]",
      "screens": [
        {
          "screen_number": 1,
          "type": "intro",
          "heading": "Meet [App Name]",
          "content": "2-3 sentences max explaining what the app does",
          "visual_type": "architecture_overview",
          "visual_description": "Description of what the diagram should show"
        },
        {
          "screen_number": 2,
          "type": "trace",
          "heading": "You click [button] — here's what happens",
          "content": "1-2 sentences setting up the trace",
          "visual_type": "data_flow_animation",
          "visual_description": "Step-by-step flow with arrows",
          "code_translation": {
            "file": "src/handler.ts",
            "code": "actual code",
            "translations": [
              {"line": "const data = await fetch(url)", "english": "Go to this web address and grab the data"},
              {"line": "const parsed = JSON.parse(data)", "english": "Convert the raw text into organized data JavaScript can work with"}
            ]
          }
        },
        {
          "screen_number": 3,
          "type": "quiz",
          "heading": "Quick check",
          "question": "A user reports the app is showing old data. Based on what you learned, where would you look first?",
          "options": [
            {"text": "The database", "correct": false, "explanation": "The data is fresh in the database — the problem is upstream."},
            {"text": "The cache layer", "correct": true, "explanation": "Exactly! The cache stores a copy of data to speed things up, but if it's not refreshed, you see stale data."},
            {"text": "The CSS styles", "correct": false, "explanation": "Styles control how things look, not what data is shown."}
          ]
        }
      ],
      "metaphor": {
        "concept": "API calls",
        "metaphor": "Like ordering food through a delivery app — you describe what you want, the app sends your order to the restaurant, and brings back exactly what you asked for",
        "grounding": "In the code, this looks like the fetch() call in api/handler.ts"
      },
      "glossary_terms": [
        {"term": "API", "definition": "A set of rules that lets two programs talk to each other. When you use an app, it's constantly sending messages to servers through APIs — like a waiter carrying orders between you and the kitchen."},
        {"term": "JSON", "definition": "A format for organizing data that both humans and computers can read. Looks like a labeled list: {\"name\": \"Priya\", \"role\": \"developer\"}"}
      ]
    }
  ]
}

CURRICULUM DESIGN RULES:
1. Module 1 ALWAYS starts with "What this app does" + traces the primary user action
2. Each module MUST have: at least 1 code translation, 1 quiz, 1 visual element
3. Quiz questions test APPLICATION not MEMORIZATION
   - GOOD: "A user reports X is broken. Where would you look first?"
   - BAD: "What does API stand for?"
4. Every metaphor must be UNIQUE — never repeat a metaphor across modules
5. NEVER use "restaurant" as a metaphor — it's overused
6. Max 2-3 sentences per text block
7. Glossary terms: tooltip EVERY technical word a non-coder wouldn't know
8. 5-6 modules for a simple app, 7-8 for complex ones
9. Final module = "Big Picture" architecture overview
10. Code snippets are EXACT copies from real files — never modify them
```

---

## STAGE 3: HTML Course Generation

**Input:** The curriculum JSON from Stage 2
**Output:** Complete self-contained HTML file

```
SYSTEM PROMPT:
You are an expert frontend developer and instructional designer. Generate a 
complete, self-contained HTML file that renders as a beautiful interactive course.

The HTML file must include ALL CSS and JavaScript inline (no external dependencies 
except Google Fonts). It should be production-quality — not a prototype.

Given the curriculum JSON, generate a single HTML file with these features:

## REQUIRED FEATURES

### 1. Scroll-Based Navigation
- CSS scroll-snap-type: y proximity (NOT mandatory — traps users)
- Each module is a section with min-height: 100dvh (100vh fallback)
- Fixed progress bar at top showing completion
- Keyboard navigation (arrow keys, Escape)
- Smooth scroll between sections

### 2. Code ↔ Plain English Translations
- Left panel: real code with syntax highlighting (dark theme, #1E1E2E background)
- Right panel: line-by-line plain English explanations
- Highlighted connecting lines between code and explanation
- Code uses white-space: pre-wrap (NO horizontal scrollbars)
- Mobile: stack vertically instead of side-by-side

### 3. Interactive Quizzes
- Multiple choice with 3-4 options
- Wrong answers show encouraging explanation + teaching moment
- Correct answers reinforce the underlying principle
- No scores or grades — it's a thinking exercise
- Subtle animation on answer selection

### 4. Animated Data Flow Visualizations
- SVG-based flow diagrams showing data moving between components
- CSS animations (transform + opacity only, GPU-accelerated)
- Auto-play on scroll into view (IntersectionObserver)
- Pause when scrolled away

### 5. Glossary Tooltips
- Every technical term gets a dashed underline on first use per module
- position: fixed tooltips (appended to document.body to avoid overflow clipping)
- Calculate position from getBoundingClientRect()
- Cursor: pointer (not help — feels more inviting)
- Mobile: tap to toggle
- AGGRESSIVELY tooltip everything: API, JSON, function, variable, CLI, etc.

### 6. Architecture Diagrams
- SVG diagrams showing how components connect
- Color-coded by component type
- Animated connection lines

## DESIGN SYSTEM (NON-NEGOTIABLE)

### Colors
- Background: #FAF9F6 (warm off-white, like aged paper)
- Text: #2C2C2A (warm near-black)
- Accent: #E85D30 (vermillion — bold, confident, NOT purple)
- Secondary: #1A7F64 (deep teal)
- Code background: #1E1E2E (deep indigo-charcoal)
- Success: #2D8B4E
- Warning: #D4A017

### Typography
- Headings: 'Bricolage Grotesque', sans-serif (from Google Fonts)
  NEVER use Inter, Roboto, Arial, Space Grotesk
- Body: 'DM Sans', sans-serif (from Google Fonts)
- Code: 'JetBrains Mono', monospace (from Google Fonts)

### Spacing
- Generous whitespace everywhere
- Max 3-4 short paragraphs per screen
- Sections breathe — use 2rem+ gaps between elements

### Visual Rhythm
- Alternate backgrounds between modules: #FAF9F6 and #F3F1EA
- Subtle warm shadows (never black drop shadows)
- Smooth transitions between sections

## HTML TEMPLATE STRUCTURE

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[Course Title] — CodeLens AI</title>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;700&family=DM+Sans:wght@400;500&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
  <style>
    /* === RESET & BASE === */
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    
    :root {
      --bg-primary: #FAF9F6;
      --bg-secondary: #F3F1EA;
      --text-primary: #2C2C2A;
      --text-secondary: #5F5E5A;
      --text-tertiary: #888780;
      --accent: #E85D30;
      --accent-light: #FAECE7;
      --teal: #1A7F64;
      --teal-light: #E1F5EE;
      --code-bg: #1E1E2E;
      --success: #2D8B4E;
      --warning: #D4A017;
      --shadow-sm: 0 1px 3px rgba(44,44,42,0.06);
      --shadow-md: 0 4px 12px rgba(44,44,42,0.08);
      --radius-sm: 8px;
      --radius-md: 12px;
      --radius-lg: 20px;
      --font-display: 'Bricolage Grotesque', sans-serif;
      --font-body: 'DM Sans', sans-serif;
      --font-code: 'JetBrains Mono', monospace;
    }

    html { scroll-snap-type: y proximity; scroll-behavior: smooth; }
    body { 
      font-family: var(--font-body); 
      color: var(--text-primary); 
      background: var(--bg-primary);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }

    /* === PROGRESS BAR === */
    .progress-bar {
      position: fixed; top: 0; left: 0; height: 3px;
      background: var(--accent); z-index: 1000;
      transition: width 0.3s ease;
    }

    /* === MODULE SECTIONS === */
    .module {
      min-height: 100dvh; min-height: 100vh;
      scroll-snap-align: start;
      padding: 4rem 2rem;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
    }
    .module:nth-child(even) { background: var(--bg-secondary); }
    .module-content { max-width: 800px; width: 100%; }
    
    /* === TYPOGRAPHY === */
    h1, h2, h3 { font-family: var(--font-display); font-weight: 700; }
    h1 { font-size: clamp(2rem, 5vw, 3rem); line-height: 1.2; }
    h2 { font-size: clamp(1.5rem, 3vw, 2rem); margin-bottom: 1rem; }
    h3 { font-size: 1.25rem; margin-bottom: 0.75rem; }
    p { margin-bottom: 1rem; max-width: 65ch; }
    .badge {
      display: inline-block; padding: 0.25rem 0.75rem;
      border-radius: 20px; font-size: 0.75rem; font-weight: 500;
      background: var(--accent-light); color: var(--accent);
    }

    /* === CODE TRANSLATION BLOCK === */
    .code-translation {
      display: grid; grid-template-columns: 1fr 1fr;
      border-radius: var(--radius-md); overflow: hidden;
      box-shadow: var(--shadow-md); margin: 2rem 0;
    }
    .code-panel {
      background: var(--code-bg); padding: 1.5rem;
      font-family: var(--font-code); font-size: 0.85rem;
      color: #CDD6F4; line-height: 1.8;
      white-space: pre-wrap; overflow-wrap: break-word;
    }
    .english-panel {
      background: #F8F7F4; padding: 1.5rem;
      font-size: 0.9rem; line-height: 1.8;
      border-left: 3px solid var(--accent);
    }
    .english-panel .line {
      padding: 0.25rem 0;
      border-bottom: 1px solid rgba(0,0,0,0.05);
    }
    @media (max-width: 768px) {
      .code-translation { grid-template-columns: 1fr; }
    }

    /* === QUIZ === */
    .quiz { margin: 2rem 0; }
    .quiz-question {
      font-family: var(--font-display); font-size: 1.1rem;
      font-weight: 600; margin-bottom: 1.5rem;
    }
    .quiz-option {
      display: block; width: 100%; text-align: left;
      padding: 1rem 1.25rem; margin: 0.5rem 0;
      border: 2px solid rgba(0,0,0,0.08); border-radius: var(--radius-sm);
      background: white; cursor: pointer; font-size: 0.95rem;
      font-family: var(--font-body);
      transition: all 0.2s ease;
    }
    .quiz-option:hover { border-color: var(--accent); transform: translateX(4px); }
    .quiz-option.correct {
      border-color: var(--success); background: #E8F5E9;
      animation: pulse 0.3s ease;
    }
    .quiz-option.incorrect {
      border-color: #E57373; background: #FFEBEE;
    }
    .quiz-feedback {
      padding: 1rem 1.25rem; border-radius: var(--radius-sm);
      margin-top: 0.75rem; font-size: 0.9rem;
      display: none;
    }
    .quiz-feedback.show { display: block; }
    .quiz-feedback.correct-fb { background: #E8F5E9; color: #1B5E20; }
    .quiz-feedback.incorrect-fb { background: #FFF3E0; color: #E65100; }

    /* === GLOSSARY TOOLTIP === */
    .glossary-term {
      text-decoration: underline;
      text-decoration-style: dashed;
      text-underline-offset: 3px;
      text-decoration-color: var(--text-tertiary);
      cursor: pointer;
      position: relative;
    }
    .tooltip {
      position: fixed; z-index: 10000;
      background: var(--text-primary); color: white;
      padding: 0.75rem 1rem; border-radius: var(--radius-sm);
      font-size: 0.8rem; max-width: 300px; line-height: 1.5;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      pointer-events: none;
      animation: fadeIn 0.15s ease;
    }
    .tooltip::before {
      content: ''; position: absolute;
      top: -6px; left: 20px;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-bottom: 6px solid var(--text-primary);
    }

    /* === FLOW DIAGRAM === */
    .flow-diagram { margin: 2rem 0; text-align: center; }
    .flow-diagram svg { max-width: 100%; }

    /* === AHA CALLOUT === */
    .aha-callout {
      background: var(--teal-light); border-left: 4px solid var(--teal);
      padding: 1.25rem 1.5rem; border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
      margin: 1.5rem 0;
    }
    .aha-callout .aha-label {
      font-family: var(--font-display); font-weight: 600;
      color: var(--teal); font-size: 0.8rem;
      text-transform: uppercase; letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }

    /* === NAV BAR === */
    .nav {
      position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%);
      background: var(--text-primary); color: white;
      padding: 0.75rem 1.5rem; border-radius: 50px;
      display: flex; gap: 1rem; align-items: center;
      font-size: 0.85rem; z-index: 100;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    }
    .nav button {
      background: none; border: none; color: white;
      cursor: pointer; font-size: 1rem; padding: 0.25rem 0.5rem;
    }
    .nav button:hover { opacity: 0.7; }

    /* === ANIMATIONS === */
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.02); } 100% { transform: scale(1); } }
    @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    .fade-in { animation: slideUp 0.6s ease both; }

    /* === BRANDING === */
    .powered-by {
      position: fixed; top: 1rem; right: 1.5rem;
      font-size: 0.7rem; color: var(--text-tertiary);
      z-index: 100;
    }
    .powered-by span { color: var(--accent); font-weight: 600; }
  </style>
</head>
<body>
  <div class="progress-bar" id="progressBar" style="width: 0%"></div>
  <div class="powered-by">Generated by <span>CodeLens AI</span></div>

  <!-- MODULES GO HERE — each module is a <section class="module"> -->
  <!-- Module content is generated dynamically from the curriculum JSON -->

  <!-- Navigation pill -->
  <div class="nav">
    <button onclick="navigateModule(-1)">←</button>
    <span id="navLabel">Module 1 of N</span>
    <button onclick="navigateModule(1)">→</button>
  </div>

  <script>
    // === SCROLL PROGRESS ===
    window.addEventListener('scroll', () => {
      const h = document.documentElement;
      const pct = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
      document.getElementById('progressBar').style.width = pct + '%';
    }, { passive: true });

    // === MODULE NAVIGATION ===
    const modules = document.querySelectorAll('.module');
    let currentModule = 0;
    function navigateModule(dir) {
      currentModule = Math.max(0, Math.min(modules.length - 1, currentModule + dir));
      modules[currentModule].scrollIntoView({ behavior: 'smooth' });
      document.getElementById('navLabel').textContent = 
        `Module ${currentModule + 1} of ${modules.length}`;
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') navigateModule(1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') navigateModule(-1);
    });

    // === SCROLL ANIMATIONS ===
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add('fade-in');
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.module-content > *').forEach(el => observer.observe(el));

    // === QUIZ HANDLER ===
    function checkAnswer(btn, correct, feedbackId) {
      const quiz = btn.closest('.quiz');
      const options = quiz.querySelectorAll('.quiz-option');
      options.forEach(o => { o.disabled = true; o.style.pointerEvents = 'none'; });
      btn.classList.add(correct ? 'correct' : 'incorrect');
      const fb = document.getElementById(feedbackId);
      fb.className = 'quiz-feedback show ' + (correct ? 'correct-fb' : 'incorrect-fb');
    }

    // === GLOSSARY TOOLTIPS ===
    let activeTooltip = null;
    document.querySelectorAll('.glossary-term').forEach(term => {
      term.addEventListener('click', (e) => {
        e.stopPropagation();
        if (activeTooltip) { activeTooltip.remove(); activeTooltip = null; }
        const rect = term.getBoundingClientRect();
        const tip = document.createElement('div');
        tip.className = 'tooltip';
        tip.textContent = term.dataset.definition;
        document.body.appendChild(tip);
        tip.style.left = Math.min(rect.left, window.innerWidth - 320) + 'px';
        tip.style.top = (rect.bottom + 8) + 'px';
        activeTooltip = tip;
      });
    });
    document.addEventListener('click', () => {
      if (activeTooltip) { activeTooltip.remove(); activeTooltip = null; }
    });
  </script>
</body>
</html>
```

## CRITICAL QUALITY RULES:
1. EVERY screen must be at least 50% visual — diagrams, code blocks, cards, NOT paragraphs
2. Max 2-3 sentences per text block. If you're writing a 4th sentence, STOP and make it visual
3. Code snippets are EXACT copies from the real codebase — NEVER modify them
4. Choose naturally SHORT snippets (5-10 lines) — don't trim long functions
5. EVERY technical term gets a glossary tooltip
6. Quizzes test APPLICATION: "Where would you look if X broke?" NOT "What does Y stand for?"
7. UNIQUE metaphor per module — NEVER repeat, NEVER use "restaurant"
8. The design should feel warm and distinctive — NOT the typical purple-gradient AI look
```

---

## COMPLETE PIPELINE (Copy-Paste Ready)

### Step 1: Prepare the codebase content

```javascript
// In your Next.js API route
async function prepareCodebaseContent(repoPath) {
  // 1. Get file tree
  const fileTree = await getFileTree(repoPath);
  
  // 2. Identify key files (prioritize these)
  const keyFiles = [
    'README.md',
    'package.json', 'requirements.txt', 'Cargo.toml',  // dependency files
    'src/index.*', 'src/app.*', 'src/main.*',           // entry points
    'src/pages/*', 'src/routes/*', 'src/api/*',         // route handlers
    'src/components/*', 'src/services/*',                // main modules
    '.env.example', 'docker-compose.yml'                 // config
  ];
  
  // 3. Read key files (stay under context window)
  // Target: ~30K tokens of code content
  // Priority: README > entry points > route handlers > components > utils
  
  // 4. Format as a structured prompt input
  return {
    fileTree: fileTree,
    files: readFiles.map(f => ({
      path: f.path,
      content: f.content,
      language: detectLanguage(f.path)
    }))
  };
}
```

### Step 2: Call Stage 1 (Analysis)

```javascript
const analysisPrompt = `
${STAGE_1_SYSTEM_PROMPT}

Here is the codebase to analyze:

FILE TREE:
${codebaseContent.fileTree}

FILES:
${codebaseContent.files.map(f => `
--- ${f.path} (${f.language}) ---
${f.content}
---
`).join('\n')}

Return ONLY the JSON analysis object. No markdown, no backticks, no explanation.
`;

const analysis = await callAI(analysisPrompt);
```

### Step 3: Call Stage 2 (Curriculum)

```javascript
const curriculumPrompt = `
${STAGE_2_SYSTEM_PROMPT}

Here is the codebase analysis:
${JSON.stringify(analysis, null, 2)}

Design the curriculum. Return ONLY the JSON curriculum object.
`;

const curriculum = await callAI(curriculumPrompt);
```

### Step 4: Call Stage 3 (HTML Generation)

```javascript
const htmlPrompt = `
${STAGE_3_SYSTEM_PROMPT}

Here is the curriculum to turn into an interactive HTML course:
${JSON.stringify(curriculum, null, 2)}

Generate the COMPLETE HTML file. Include ALL CSS and JavaScript inline.
The file must work standalone — no external dependencies except Google Fonts.
`;

const htmlCourse = await callAI(htmlPrompt);
```

---

## COST ESTIMATES (Per Course Generation)

| Model | Input Tokens | Output Tokens | Cost | Speed |
|-------|-------------|---------------|------|-------|
| Gemini 2.5 Flash (free) | ~50K | ~30K | $0.00 | ~2 min |
| Claude Sonnet 4.6 | ~50K | ~30K | ~$0.60 | ~3 min |
| Groq Llama 3.3 70B (free) | ~50K | ~30K | $0.00 | ~1 min |
| GPT-4o | ~50K | ~30K | ~$0.45 | ~2 min |

**Recommendation for hackathon:** Use Gemini 2.5 Flash for free unlimited generation.
For the 3 pre-generated demo courses, use Claude Sonnet for best quality.

---

## PRO TIPS FOR HACKATHON

1. **Pre-generate 3 courses** before the event using Claude Sonnet:
   - cal.com (complex, relatable scheduling app)
   - A simple Express.js API (shows it works on small repos too)
   - A popular React component library (shows breadth)

2. **Cache the analysis JSON** — if generation fails on Stage 3, you can retry
   just the HTML generation without re-analyzing the whole codebase.

3. **Have a fallback HTML template** — if AI generation produces broken HTML,
   inject the curriculum JSON into a pre-built React component that renders it.
   This is your safety net.

4. **The course viewer can be a React component** — you don't need to serve
   raw HTML in an iframe. Parse the curriculum JSON and render it with React
   components. This gives you more control over the design.
