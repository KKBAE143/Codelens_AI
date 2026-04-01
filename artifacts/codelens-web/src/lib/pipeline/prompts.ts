import type { TargetAudience } from "../prompts";

const PERSONA_CONTEXT: Record<TargetAudience, string> = {
  vibe_coder: `The learner is a "vibe coder" who builds with AI tools (Cursor, Bolt, Lovable) without a CS background. They can BUILD but cannot debug or maintain. Focus on: debugging strategies, what breaks and how to fix it, how to steer AI tools, dangerous zones AI frequently messes up.`,
  new_engineer: `The learner is a new software engineer joining the team — smart and technically capable, but completely new to this specific codebase. Write as if you are a friendly senior engineer walking them through the code over coffee, not a textbook author.

TONE & STYLE RULES (mandatory):
- Open EVERY chapter with a "Why this matters" paragraph: one or two sentences that connect this abstraction to a real task the new engineer will actually do (e.g., "When you add your first feature here, you'll touch this layer — here's why it's designed this way").
- Use at least ONE real-world analogy per major concept (e.g., "think of this like a restaurant kitchen: orders come in from the front-of-house, the chef decides routing, and each station handles its specialty").
- Write SHORT paragraphs — 3–4 sentences maximum. Break complex ideas into multiple paragraphs rather than one dense block.
- AVOID jargon walls: never introduce more than two technical terms in a single paragraph without immediately explaining them in plain English.
- Prefer active, direct sentences: "This function checks if the user is logged in" beats "Authentication verification is performed by this function".
- Build complexity gradually within each chapter: start simple (what it is, why it exists), then go deeper (how it works, edge cases).`,
  product_manager: `The learner is a Product Manager. They need to understand WHAT the system does and WHY without reading code. Focus on: business-level component descriptions, user journeys, external integrations, performance characteristics. Minimize code, maximize diagrams.`,
  security_auditor: `The learner is a Security Auditor. Focus on: authentication flows, authorization boundaries, input validation, API security, secrets management, dependency risks, data exposure, error handling information leaks.`,
};

const ANTI_PLACEHOLDER_RULES = `
ABSOLUTE RULES — VIOLATION MEANS FAILURE:
- NEVER write generic placeholder text like "This chapter covers...", "In this section we will...", "Let's explore...", "This component handles..."
- NEVER write one-sentence text blocks. Every text block must have AT LEAST 2-3 substantial paragraphs
- NEVER invent or fabricate code. Every code block must quote EXACTLY from the provided file contents
- NEVER create empty or trivial mermaid diagrams. Each diagram must show REAL relationships with proper node labels and edge descriptions
- NEVER write trivial quiz questions like "What does X do?" — questions must test APPLICATION-level understanding with realistic scenarios
- Every chapter MUST feel like a section from a well-written O'Reilly book, not AI-generated filler`;

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

Rules:
- Foundational abstractions (few dependencies, imported by many) come first
- Complex orchestrators (depend on many others) come last
- Chapter 0 is ALWAYS "Overview & Architecture" (you don't need to include it)
- Chapter 1 is ALWAYS "Setup & Installation" (you don't need to include it)
- Second-to-last is ALWAYS "Dependencies Explained" (you don't need to include it)
- Last is ALWAYS "Troubleshooting & Common Errors" (you don't need to include it)
- You only need to order the ABSTRACTION chapters (the mandatory ones are inserted automatically)

Return ONLY valid YAML (no markdown fences). Format:

- index: 2
  title: "Chapter Title"
  learningObjective: "After this chapter, the reader will understand..."
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
    ? "Write 5-8 blocks for this chapter. Cover the essential 'what' and 'why' with concrete examples."
    : depth === "full"
      ? "Write 8-12 blocks for this chapter. Cover 'what', 'why', and key 'how' with code examples and diagrams."
      : "Write 12-18 blocks for this chapter. Deep dive including edge cases, alternatives, internals, and advanced patterns.";

  const newEngineerExtra = audience === "new_engineer" ? `

NEW ENGINEER CHAPTER REQUIREMENTS (in addition to the structure below):
- The VERY FIRST sentence of the opening text block must be a "Why this matters" hook — one sentence connecting this abstraction to a real task the reader will do (e.g., "Every time you add a new API endpoint, you'll go through this layer — here's exactly how it works.").
- After the hook, use a real-world analogy to explain the concept before any code appears (e.g., "Think of this like a receptionist: it receives every incoming request, checks ID, and routes you to the right desk.").
- Keep ALL text paragraphs to 3–4 sentences maximum. If you have more to say, start a new paragraph.
- Never stack more than two technical terms in the same sentence without explaining both.
- Quizzes must be scenario-based: "You're on day 2 and need to add X — which file do you open first?" or "You see error Y in the logs — what does that tell you?".
- Include a callout[first-pr] with a concrete, safe first contribution the reader could make to this part of the codebase.` : "";

  return `You are writing a single chapter of a codebase tutorial about the "${abstractionName}" abstraction.

${PERSONA_CONTEXT[audience]}
${newEngineerExtra}
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
5. "callout": { "type": "callout", "variant": "warning"|"tip"|"ai-hint"|"first-pr"|"security"|"command", "content": "actionable insight, not generic advice" }
6. "file-list": { "type": "file-list", "files": [{"path": "src/file.ts", "role": "specific role description", "lineCount": 100}] }
7. "architecture-card": { "type": "architecture-card", "decision": "specific architectural decision", "rationale": "why this approach was chosen", "tradeoffs": "what was gained and lost", "alternatives": "what else could have been used" }
8. "dependency-card": { "type": "dependency-card", "packageName": "pkg", "version": "1.0", "purpose": "specific purpose in this project", "whatBreaksWithout": "concrete consequence", "alternatives": "other options" }
9. "env-var-card": { "type": "env-var-card", "varName": "KEY", "required": true, "purpose": "what this configures", "exampleValue": "value", "whatBreaksWithout": "specific failure mode" }
10. "command-card": { "type": "command-card", "command": "npm run dev", "when": "when and why to use this", "expectedOutput": "what you see", "commonErrors": [{"error": "msg", "fix": "solution"}] }

REQUIRED CHAPTER STRUCTURE:
1. Start with a text block that explains WHAT this abstraction is and WHY it exists — use a real-world analogy, reference specific files, explain the problem it solves. Minimum 3 paragraphs.
2. Include a file-list block listing all files in this abstraction with specific role descriptions
3. Include 2-4 code blocks quoting EXACT code from the provided files — show the key functions, data structures, or patterns. Each code block needs a caption explaining the significance.
4. Include EXACTLY ONE mermaid diagram showing how this abstraction connects to other parts of the system — use the relationship data provided. The diagram must have labeled nodes and edges.
5. Include at least ONE quiz with a realistic scenario (e.g., "You're debugging X and see error Y in the logs. What's the most likely cause?") with 3-4 options, each with detailed explanations.
6. Include 1-2 callout blocks with actionable tips, warnings, or first-PR suggestions specific to this abstraction.
7. End with a text block summarizing key takeaways and how this connects to the next chapter.

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
  return `You are creating spaced-repetition flashcards for a codebase tutorial chapter.

${PERSONA_CONTEXT[audience]}

Given the chapter content below (a list of content blocks), generate 4 high-quality flashcards.

Rules:
- Each flashcard tests ONE specific concept, function, pattern, or architectural decision from this chapter
- Front: a clear question or term. Use "What does X do?", "Why does this codebase use Y?", "When would you Z?". DO NOT use yes/no questions.
- Back: a clear, complete answer (2-4 sentences). Explain the what AND the why. No placeholder text.
- codeSnippet: optional short code example (≤10 lines) that illustrates the concept. Include ONLY if directly relevant and verbatim from the chapter. Omit if not applicable.
- Cover: key concepts, important functions, architectural decisions, common gotchas — NOT trivia.
- Avoid duplicating the same concept across cards.

Return ONLY valid JSON (no markdown fences):
{
  "cards": [
    {
      "front": "...",
      "back": "...",
      "codeSnippet": "..." or null
    }
  ]
}`;
}

export function getOverviewChapterPrompt(audience: TargetAudience): string {
  return `You are writing the "Overview & Architecture" chapter of a codebase tutorial.

${PERSONA_CONTEXT[audience]}

Generate a comprehensive introductory chapter that gives the reader a complete mental model of the system.

REQUIRED STRUCTURE (minimum 8 blocks):
1. A text block (3+ paragraphs) with a thorough summary of what this codebase does, who it's for, and what problem it solves. Use a real-world analogy to explain the architecture.
2. A mermaid flowchart (graph TD) showing the high-level architecture — main components and how data flows between them. Every node must be labeled with the actual component/module name from the codebase. Edges must describe what data or control flows between components.
3. A file-list block showing the key directories/files and their specific roles in the architecture
4. A text block with key statistics: file count, main languages and their percentage, estimated complexity, lines of code
5. A text block explaining the main data flow — what happens from user input to final output, step by step
6. A callout[tip] about how to navigate this course effectively based on the reader's goals
7. A callout[ai-hint] with the single most important thing to understand about this codebase

${ANTI_PLACEHOLDER_RULES}

Return ONLY a valid JSON object: { "blocks": [ ... ] }`;
}
