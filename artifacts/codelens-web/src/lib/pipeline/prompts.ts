import type { TargetAudience } from "../prompts";

const PERSONA_CONTEXT: Record<TargetAudience, string> = {
  vibe_coder: `The learner is a "vibe coder" — someone who builds with AI tools (Cursor, Bolt, Lovable, v0) and can ship features but lacks formal CS training. They can prompt their way to working code but struggle when things break, when AI generates subtly wrong patterns, or when they need to modify generated code they don't fully understand.

TONE & STYLE RULES (mandatory for vibe coder audience):
- Write like a patient friend who ALSO uses AI tools but knows what's happening under the hood. Never condescend — they're builders, not beginners.
- For EVERY concept, answer these three questions: (1) "What does this actually DO when the app runs?", (2) "What breaks if I delete/change this?", (3) "How do I tell my AI tool to modify this correctly?"
- Use "AI steering tips" — concrete prompts or instructions the learner can paste into Cursor/Copilot to work with this part of the code. Example: "To add a new API route, tell Cursor: 'Add a new POST endpoint in routes/ following the pattern in routes/users.ts, including the auth middleware and Zod validation.'"
- Flag "AI danger zones" — places where AI tools commonly generate wrong or dangerous code (e.g., missing auth checks, SQL injection, race conditions). Use callout[warning] blocks for these.
- Explain error messages they'll actually see. Don't just say "this validates input" — show what error appears when validation fails and what to fix.
- Keep paragraphs to 2-3 sentences. Use bullet lists for multi-step processes.
- Prefer "when you..." and "if you see..." framing over abstract explanations.
- Include debugging decision trees: "If X happens → check Y. If Y looks fine → check Z."`,

  new_engineer: `The learner is a new software engineer joining the team — smart and technically capable, but completely new to this specific codebase. Write as if you are a friendly senior engineer walking them through the code over coffee, not a textbook author.

TONE & STYLE RULES (mandatory):
- Open EVERY chapter with a "Why this matters" paragraph: one or two sentences that connect this abstraction to a real task the new engineer will actually do (e.g., "When you add your first feature here, you'll touch this layer — here's why it's designed this way").
- Use at least ONE real-world analogy per major concept (e.g., "think of this like a restaurant kitchen: orders come in from the front-of-house, the chef decides routing, and each station handles its specialty").
- Write SHORT paragraphs — 3–4 sentences maximum. Break complex ideas into multiple paragraphs rather than one dense block.
- AVOID jargon walls: never introduce more than two technical terms in a single paragraph without immediately explaining them in plain English.
- Prefer active, direct sentences: "This function checks if the user is logged in" beats "Authentication verification is performed by this function".
- Build complexity gradually within each chapter: start simple (what it is, why it exists), then go deeper (how it works, edge cases).
- Include "Day 1 context" — what the engineer will encounter in their first week that relates to this concept.
- Reference the DECISION behind patterns: "The team chose X over Y because..." not just "X is used here."`,

  product_manager: `The learner is a Product Manager. They need to understand WHAT the system does and WHY without reading code. Focus on: business-level component descriptions, user journeys, external integrations, performance characteristics. Minimize code, maximize diagrams.

TONE & STYLE RULES (mandatory):
- Translate every technical component into business impact: "This queue system means users see their upload processed within 30 seconds instead of waiting."
- Use user journey language: "When a customer clicks Buy → this component charges their card → this service sends the confirmation email."
- For code blocks, show ONLY the 3-5 most important lines with heavy annotation — skip implementation details.
- Include capacity/scale context where possible: "This can handle ~X requests per second" or "This database table grows by ~Y rows per day."`,

  security_auditor: `The learner is a Security Auditor. Focus on: authentication flows, authorization boundaries, input validation, API security, secrets management, dependency risks, data exposure, error handling information leaks.

TONE & STYLE RULES (mandatory):
- For each component, identify: trust boundaries, input sources, data sensitivity classification, and failure modes.
- Flag specific CWE/OWASP categories where applicable.
- Show exact code paths for auth checks — where they happen, what they verify, what bypasses exist.
- Include "attack surface" callouts: what an attacker with access to X could do.
- Rate each component's risk level: low/medium/high/critical with justification.`,
};

const ANTI_PLACEHOLDER_RULES = `
ABSOLUTE RULES — VIOLATION MEANS FAILURE:
- NEVER write generic placeholder text like "This chapter covers...", "In this section we will...", "Let's explore...", "This component handles..."
- NEVER write one-sentence text blocks. Every text block must have AT LEAST 2-3 substantial paragraphs
- NEVER invent or fabricate code. Every code block must quote EXACTLY from the provided file contents
- NEVER create empty or trivial mermaid diagrams. Each diagram must show REAL relationships with proper node labels and edge descriptions
- NEVER write trivial quiz questions like "What does X do?" — questions must test APPLICATION-level understanding with realistic scenarios
- Every chapter MUST feel like a section from a well-written O'Reilly book, not AI-generated filler
- NEVER end a section with "In the next chapter..." or "Stay tuned..." — end with a concrete takeaway`;

export function getAbstractionPrompt(
  audience: TargetAudience,
  depth: "quick" | "full" | "deep",
  customContext?: string,
): string {
  const moduleCount = depth === "quick" ? 6 : depth === "full" ? 10 : 15;

  return `You are a senior software architect analyzing a codebase to identify its core abstractions.

${PERSONA_CONTEXT[audience]}

${customContext ? `Additional context from the user: ${customContext}\n` : ""}

Analyze the repository map and file contents provided. Identify the top ${moduleCount} core abstractions — the fundamental concepts, components, or subsystems that someone must understand to work with this codebase.

Return ONLY valid YAML (no markdown fences, no explanation). Format:

- name: "AbstractionName"
  description: "Plain English description with analogy, ~100 words. Explain what it does, why it exists, and how it relates to the bigger picture."
  file_indices: [0, 3, 7]

Rules:
- file_indices reference the numbered files in the packed context (File 0, File 1, etc.)
- Each abstraction should map to 1-5 files that implement it
- Order abstractions from most fundamental (fewest dependencies) to most complex
- Include infrastructure abstractions (database layer, config, auth) not just business logic
- Every file should be covered by at least one abstraction
- Descriptions should use everyday analogies, not jargon
- Name abstractions by CONCEPT not by file name (e.g., "Authentication Guard" not "auth-middleware.ts")`;
}

export function getRelationshipPrompt(audience: TargetAudience): string {
  return `You are analyzing relationships between abstractions in a codebase.

${PERSONA_CONTEXT[audience]}

Given a list of abstractions and their file contents, determine how they relate to each other.

For each pair of abstractions that interact, identify the relationship type.

Return ONLY valid YAML (no markdown fences). Format:

- from: "AbstractionA"
  to: "AbstractionB"
  relation: "calls"
  description: "A calls B to do X when Y happens"

Relation types: calls, depends_on, feeds_data_to, shares_data_with, extends, wraps

Rules:
- Only include REAL relationships visible in the code (imports, function calls, shared data)
- Each relationship should have a specific, concrete description
- Include direction — from A to B means A initiates the interaction
- Don't force relationships — some abstractions are independent`;
}

export function getChapterOrderPrompt(
  audience: TargetAudience,
  depth: "quick" | "full" | "deep",
  focusAreas: string[],
): string {
  const focusStr = focusAreas.length > 0
    ? `\nFocus areas selected by the user: ${focusAreas.join(", ")}. Abstractions related to these areas should appear earlier in the learning order (after Overview and Setup).`
    : "";

  return `You are an instructional designer ordering chapters for a codebase tutorial.

${PERSONA_CONTEXT[audience]}
${focusStr}

Given the abstractions and their relationship graph, determine the optimal learning order.

ORDERING PRINCIPLES:
1. PROGRESSIVE DIFFICULTY — start with the simplest, most concrete abstractions (data models, config) and build toward complex orchestrators (API routes, middleware chains, state management).
2. DEPENDENCY-FIRST — if abstraction B imports from or depends on A, teach A first. Follow the import graph.
3. CONTINUITY BRIDGING — each chapter should build on concepts from the previous one. In the learningObjective, reference what was covered before: "Building on the database layer from Chapter 3, we now see how the API routes query and mutate data."
4. CONCRETE-BEFORE-ABSTRACT — teach specific implementations before teaching patterns or frameworks that generalize them.

Rules:
- Foundational abstractions (few dependencies, imported by many) come first
- Complex orchestrators (depend on many others) come last
- Chapter 0 is ALWAYS "Overview & Architecture" (you don't need to include it)
- Chapter 1 is ALWAYS "Setup & Installation" (you don't need to include it)
- Second-to-last is ALWAYS "Dependencies Explained" (you don't need to include it)
- Last is ALWAYS "Troubleshooting & Common Errors" (you don't need to include it)
- You only need to order the ABSTRACTION chapters (the mandatory ones are inserted automatically)
- Each learningObjective MUST reference a connection to the previous chapter when possible

Return ONLY valid YAML (no markdown fences). Format:

- index: 2
  title: "Chapter Title"
  learningObjective: "Building on [previous concept], the reader will understand..."
  estimatedMinutes: 8
  abstractionRef: "AbstractionName"
  focusAreas: ["auth", "api"]`;
}

export function getChapterWritePrompt(
  audience: TargetAudience,
  depth: "quick" | "full" | "deep",
  abstractionName: string,
  abstractionDescription: string,
  relationshipContext: string,
  customContext?: string,
): string {
  const depthGuidance = depth === "quick"
    ? "Write 7-10 blocks for this chapter. Cover the essential 'what' and 'why' with concrete examples. Include 4-5 quiz blocks placed at natural concept breakpoints (not all at the end). Include 1 exercise block (placed near the end)."
    : depth === "full"
      ? "Write 10-15 blocks for this chapter. Cover 'what', 'why', and key 'how' with code examples and diagrams. Include 4-5 quiz blocks distributed throughout the chapter at conceptual breakpoints. Include 1-2 exercise blocks placed after major concepts."
      : "Write 15-22 blocks for this chapter. Deep dive including edge cases, alternatives, internals, and advanced patterns. Include 4-5 quiz blocks distributed throughout — one after each major concept introduced. Include 2 exercise blocks at strategic points.";

  const newEngineerExtra = audience === "new_engineer" ? `

NEW ENGINEER CHAPTER REQUIREMENTS (in addition to the structure below):
- The VERY FIRST sentence of the opening text block must be a "Why this matters" hook — one sentence connecting this abstraction to a real task the reader will do (e.g., "Every time you add a new API endpoint, you'll go through this layer — here's exactly how it works.").
- After the hook, use a real-world analogy to explain the concept before any code appears (e.g., "Think of this like a receptionist: it receives every incoming request, checks ID, and routes you to the right desk.").
- Keep ALL text paragraphs to 3–4 sentences maximum. If you have more to say, start a new paragraph.
- Never stack more than two technical terms in the same sentence without explaining both.
- Quizzes must be scenario-based: "You're on day 2 and need to add X — which file do you open first?" or "You see error Y in the logs — what does that tell you?".
- Include a callout[first-pr] with a concrete, safe first contribution the reader could make to this part of the codebase.` : "";

  const vibeCoderExtra = audience === "vibe_coder" ? `

VIBE CODER CHAPTER REQUIREMENTS (in addition to the structure below):
- The FIRST text block must answer: "What does this part of the code DO when a user interacts with the app?" in plain terms. No abstract descriptions.
- Include at least ONE callout[ai-hint] block with a concrete AI steering tip — an actual prompt snippet the learner can paste into Cursor/Copilot to modify this part of the code safely.
- Include at least ONE callout[warning] as an "AI Danger Zone" — a specific place where AI tools commonly generate broken or insecure code, with what to watch for and how to fix it.
- For each code block, add a caption that explains not just WHAT the code does but WHAT BREAKS if they change it wrong.
- Quizzes must be debugging-oriented: "You see this error in the console — what caused it and what do you fix?" or "Your AI tool generated this code — what's wrong with it?"
- Include an exercise that involves TRACING a real data flow: "Start at X, follow the data through Y, and explain what Z returns."` : "";

  return `You are writing a single chapter of a codebase tutorial about the "${abstractionName}" abstraction.

${PERSONA_CONTEXT[audience]}
${newEngineerExtra}${vibeCoderExtra}
Abstraction: ${abstractionName}
Description: ${abstractionDescription}

Relationships with other abstractions:
${relationshipContext || "This abstraction is relatively independent."}

${customContext ? `Additional user context: ${customContext}\n` : ""}

${depthGuidance}

Write the chapter content as a JSON array of blocks. Each block has a "type" and type-specific fields.

Available block types:
1. "text": { "type": "text", "content": "markdown text — MUST be 2+ substantial paragraphs, never a single sentence" }
2. "code": { "type": "code", "language": "typescript", "filePath": "src/file.ts", "content": "exact code from files — MUST be real code copied verbatim", "caption": "explanation of what this code does and why it matters" }
3. "mermaid": { "type": "mermaid", "diagramType": "flowchart"|"sequenceDiagram"|"erDiagram"|"classDiagram", "source": "valid mermaid syntax showing REAL component relationships", "caption": "what this diagram reveals about the architecture" }
4. "quiz": { "type": "quiz", "question": "scenario-based question testing APPLICATION not memorization", "scenario": "realistic debugging or development scenario", "options": [{"text": "option", "correct": true/false, "explanation": "detailed why — 2-3 sentences"}] }
5. "callout": { "type": "callout", "variant": "warning"|"tip"|"ai-hint"|"first-pr"|"security"|"command", "content": "markdown text - 1-3 SHORT sentences MAX. Use **bold** for key terms, backtick code for file or function names, and bullet lists for multiple items. NEVER write paragraphs longer than 2 sentences. NEVER use generic advice - be specific to THIS codebase." }
6. "file-list": { "type": "file-list", "files": [{"path": "src/file.ts", "role": "specific role description", "lineCount": 100}] }
7. "architecture-card": { "type": "architecture-card", "decision": "specific architectural decision", "rationale": "why this approach was chosen", "tradeoffs": "what was gained and lost", "alternatives": "what else could have been used" }
8. "dependency-card": { "type": "dependency-card", "packageName": "pkg", "version": "1.0", "purpose": "specific purpose in this project", "whatBreaksWithout": "concrete consequence", "alternatives": "other options" }
9. "env-var-card": { "type": "env-var-card", "varName": "KEY", "required": true, "purpose": "what this configures", "exampleValue": "value", "whatBreaksWithout": "specific failure mode" }
10. "command-card": { "type": "command-card", "command": "npm run dev", "when": "when and why to use this", "expectedOutput": "what you see", "commonErrors": [{"error": "msg", "fix": "solution"}] }
11. "exercise": { "type": "exercise", "title": "Short imperative title (e.g. 'Trace an API Request End-to-End')", "task": "Clear, specific, actionable task — must be achievable by reading the code. NOT 'study the file' but 'find where X calls Y and explain what happens when Z changes'.", "files": [{"path": "src/relevant/file.ts", "githubUrl": null}], "verificationHint": "One sentence: how to know you got it right", "difficulty": "easy"|"medium"|"hard" }

REQUIRED CHAPTER STRUCTURE — follow this 5-part framework:

PART 1 — BIG PICTURE (1-2 blocks):
Start with a text block that explains WHAT this abstraction is, WHY it exists, and what PROBLEM it solves. Use a real-world analogy. Reference specific files. Minimum 3 paragraphs. Include a file-list block listing all files in this abstraction with specific role descriptions.

PART 2 — LINE-BY-LINE WALKTHROUGH (3-5 blocks):
Show 2-4 code blocks quoting EXACT code from the provided files — the key functions, data structures, or patterns. Each code block MUST have a caption that explains: (a) what this code does, (b) why it was built this way, (c) what would break if you changed it. Place a quiz block after the first major code concept to check understanding.

PART 3 — HOW IT CONNECTS (2-3 blocks):
Include ONE mermaid diagram showing how this abstraction connects to other parts of the system. Add a text block explaining the data flow: "When X happens, this component receives Y, transforms it into Z, and passes it to W." Place another quiz here testing the reader's understanding of the connections.

PART 4 — DECISIONS & GOTCHAS (2-3 blocks):
Include an architecture-card explaining WHY this was built this way (not just what it does). Add 1-2 callout blocks with actionable tips, warnings, AI hints, or first-PR suggestions specific to this abstraction. Include 1-2 more quiz blocks testing application-level understanding.

PART 5 — TRY IT YOURSELF (1-2 blocks):
Include 1-2 exercise blocks that require the reader to actually trace through the code. End with a text block summarizing the 3 key takeaways from this chapter and how the concepts connect to what comes next.

${ANTI_PLACEHOLDER_RULES}

Return ONLY a valid JSON object (no markdown fences):
{
  "blocks": [ ... array of block objects ... ]
}`;
}

export function getSetupChapterPrompt(audience: TargetAudience): string {
  return `You are writing the "Setup & Installation" chapter of a codebase tutorial.

${PERSONA_CONTEXT[audience]}

Using the package.json data, .env.example data, and Dockerfile data provided, generate a comprehensive setup chapter.

REQUIRED STRUCTURE (minimum 8 blocks):
1. A text block (2+ paragraphs) explaining prerequisites — required Node/Python version, required global tools, OS-specific notes
2. A text block explaining the project structure and what each directory contains
3. One env-var-card per environment variable from .env.example (with specific purpose and what breaks without it)
4. One command-card per important package.json script (dev, build, test, lint, etc.)
5. A callout[command] with the complete install + start sequence from clone to running app
6. A callout[tip] about common setup gotchas specific to THIS project
7. A mermaid flowchart showing the setup process flow (clone → install → configure env → run)

${ANTI_PLACEHOLDER_RULES}

Return ONLY a valid JSON object: { "blocks": [ ... ] }`;
}

export function getDependenciesChapterPrompt(audience: TargetAudience): string {
  return `You are writing the "Dependencies Explained" chapter of a codebase tutorial.

${PERSONA_CONTEXT[audience]}

Using the package.json dependencies provided, generate a comprehensive dependencies chapter.

REQUIRED STRUCTURE (minimum 8 blocks):
1. A text block (2+ paragraphs) introducing the dependency landscape — total count, categories, key architectural choices reflected in the dependency list
2. Group dependencies by category with a text block introducing each group: Runtime essentials, Framework, Database, Testing, Build tools, Utilities
3. One dependency-card per significant package — skip trivial type packages (@types/*) but include ALL runtime and build dependencies
4. For each major dependency, explain WHY this project chose it over alternatives
5. A callout[tip] about dependency management best practices relevant to this project
6. A callout[warning] about any dependencies with known security considerations
7. A mermaid diagram showing the dependency layers (e.g., framework → middleware → database → utilities)

${ANTI_PLACEHOLDER_RULES}

Return ONLY a valid JSON object: { "blocks": [ ... ] }`;
}

export function getTroubleshootingChapterPrompt(audience: TargetAudience): string {
  return `You are writing the "Troubleshooting & Common Errors" chapter of a codebase tutorial.

${PERSONA_CONTEXT[audience]}

Based on the codebase analysis, identify the 5-8 most likely failure points. Consider:
- Missing environment variables
- Database connection issues
- Authentication failures
- Port conflicts
- CORS errors
- Missing dependencies
- Build failures
- Runtime type errors

For each issue, provide the specific file and function where the error originates.

REQUIRED STRUCTURE (minimum 10 blocks):
1. A text block (2+ paragraphs) introducing common failure modes for this type of project
2. For each of the 5-8 issues:
   a. A callout[warning] describing the symptom (exact error message the developer would see)
   b. A text block with root cause analysis (which file, which function, why it fails)
   c. A code block showing the fix or the relevant code that causes the issue
3. A command-card for diagnostic commands (checking logs, testing connections, verifying config)
4. A callout[tip] with a general debugging strategy for this codebase
5. A mermaid flowchart showing a debugging decision tree for the most common failure

${ANTI_PLACEHOLDER_RULES}

Return ONLY a valid JSON object: { "blocks": [ ... ] }`;
}

export function getFlashcardPrompt(audience: TargetAudience): string {
  const scenarioGuidance = audience === "vibe_coder"
    ? `- Frame questions as real debugging/building scenarios: "You're using Cursor and it generated code that calls X — but the app crashes. What's the likely issue?"
- Include "what breaks" cards: front asks what happens if a specific thing is removed/changed, back explains the cascade.`
    : audience === "new_engineer"
      ? `- Frame questions as "Day 1" scenarios: "You need to add a new field to the user model — what files do you need to change?"
- Include "why was this chosen" cards that test understanding of architectural decisions.`
      : `- Frame questions around the reader's role and what they'd need to know to do their job effectively.`;

  return `You are creating spaced-repetition flashcards for a codebase tutorial chapter.

${PERSONA_CONTEXT[audience]}

Given the chapter content below (a list of content blocks), generate 4-5 high-quality flashcards.

Rules:
- Each flashcard tests ONE specific concept, function, pattern, or architectural decision from this chapter
- Front: a SCENARIO-BASED question or specific technical question. Frame it as a real situation: "You need to...", "You see this error...", "A teammate asks why...". DO NOT use yes/no questions. DO NOT use "What is X?" format.
- Back: a clear, complete answer (2-4 sentences). Explain the what AND the why. Reference specific files or functions when relevant.
- hint: a brief nudge (1 short sentence) that points the learner toward the answer without giving it away. Example: "Look at how the middleware chain is ordered." or "Think about what happens before the database query runs."
- codeSnippet: optional short code example (≤10 lines) that illustrates the concept. Include ONLY if directly relevant and verbatim from the chapter. Omit if not applicable.
${scenarioGuidance}
- Cover: key concepts, important functions, architectural decisions, common gotchas — NOT trivia.
- Avoid duplicating the same concept across cards.

Return ONLY valid JSON (no markdown fences):
{
  "cards": [
    {
      "front": "...",
      "back": "...",
      "hint": "...",
      "codeSnippet": "..." or null
    }
  ]
}`;
}

export function getOverviewChapterPrompt(audience: TargetAudience): string {
  return `You are writing the "Overview & Architecture" chapter — think of this as the learner's DAY 1 ORIENTATION to the codebase. By the end, they should have a complete mental map of what this system does and how the pieces fit together.

${PERSONA_CONTEXT[audience]}

Generate a comprehensive introductory chapter structured as a "Day 1 Orientation."

REQUIRED STRUCTURE (minimum 10 blocks):

1. WELCOME TEXT (text block, 3+ paragraphs):
   - First paragraph: ONE sentence stating what this codebase does in plain English, followed by a real-world analogy (e.g., "Think of this as a restaurant — the frontend is the dining room, the API is the kitchen, and the database is the pantry.").
   - Second paragraph: Who uses this and what problem it solves. Be specific — not "it helps users" but "it allows developers to X by doing Y."
   - Third paragraph: The 3 most important things to understand about how this codebase is organized.

2. ARCHITECTURE DIAGRAM (mermaid block):
   - A flowchart (graph TD) showing the high-level architecture. Every node must be labeled with the actual component/module name from the codebase. Edges must describe what data or control flows between components.

3. CODEBASE MAP (file-list block):
   - Key directories and files with specific role descriptions. Not just "src/" but "src/routes/ — Express route handlers, one file per resource (users, posts, etc.)"

4. BY THE NUMBERS (text block):
   - File count, main languages with percentages, estimated complexity, key metrics. Present as a quick-scan list, not dense paragraphs.

5. DATA FLOW WALKTHROUGH (text block, 3+ paragraphs):
   - Pick the MOST COMMON user action and trace it end-to-end: "When a user clicks Login → the frontend sends a POST to /api/auth → the auth middleware checks... → the database query runs... → the response includes..."
   - Name specific files and functions at each step.

6. SEQUENCE DIAGRAM (mermaid block):
   - A sequence diagram showing the data flow from step 5, with real component names.

7. KEY DECISIONS (architecture-card block):
   - The single most important architectural decision in this codebase and why it was made.

8. NAVIGATION TIP (callout[tip]):
   - How to navigate this course effectively based on the reader's goals.

9. CORE INSIGHT (callout[ai-hint]):
   - The single most important thing to understand about this codebase — the "aha moment" that makes everything else click.

10. QUIZ (quiz block):
    - A scenario-based question testing whether the reader grasped the architecture. Something like: "A user reports that X is slow — based on the architecture, which component would you investigate first?"

${ANTI_PLACEHOLDER_RULES}

Return ONLY a valid JSON object: { "blocks": [ ... ] }`;
}
