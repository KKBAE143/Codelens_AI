import type { TargetAudience } from "../prompts";

const PERSONA_CONTEXT: Record<TargetAudience, string> = {
  vibe_coder: `The learner is a "vibe coder" who builds with AI tools (Cursor, Bolt, Lovable) without a CS background. They can BUILD but cannot debug or maintain. Focus on: debugging strategies, what breaks and how to fix it, how to steer AI tools, dangerous zones AI frequently messes up.`,
  new_engineer: `The learner is a new software engineer joining a team. They have CS fundamentals but are unfamiliar with this codebase. Focus on: architecture overview, data flows, how to make a first contribution, test coverage, development workflow, code conventions.`,
  product_manager: `The learner is a Product Manager. They need to understand WHAT the system does and WHY without reading code. Focus on: business-level component descriptions, user journeys, external integrations, performance characteristics. Minimize code, maximize diagrams.`,
  security_auditor: `The learner is a Security Auditor. Focus on: authentication flows, authorization boundaries, input validation, API security, secrets management, dependency risks, data exposure, error handling information leaks.`,
};

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
    ? "Keep it concise: 3-5 blocks per chapter. Focus on the essential 'what' and 'why'."
    : depth === "full"
      ? "Moderate depth: 6-10 blocks per chapter. Cover 'what', 'why', and key 'how'."
      : "Deep dive: 8-15 blocks per chapter. Thorough coverage including edge cases, alternatives, and internals.";

  return `You are writing a single chapter of a codebase tutorial about the "${abstractionName}" abstraction.

${PERSONA_CONTEXT[audience]}

Abstraction: ${abstractionName}
Description: ${abstractionDescription}

Relationships with other abstractions:
${relationshipContext || "This abstraction is relatively independent."}

${customContext ? `Additional user context: ${customContext}\n` : ""}

${depthGuidance}

Write the chapter content as a JSON array of blocks. Each block has a "type" and type-specific fields.

Available block types:
1. "text": { "type": "text", "content": "markdown text" }
2. "code": { "type": "code", "language": "typescript", "filePath": "src/file.ts", "content": "exact code from files", "caption": "explanation" }
3. "mermaid": { "type": "mermaid", "diagramType": "flowchart"|"sequenceDiagram"|"erDiagram"|"classDiagram", "source": "valid mermaid syntax", "caption": "what this shows" }
4. "quiz": { "type": "quiz", "question": "scenario-based question", "scenario": "context", "options": [{"text": "option", "correct": true/false, "explanation": "why"}] }
5. "callout": { "type": "callout", "variant": "warning"|"tip"|"ai-hint"|"first-pr"|"security"|"command", "content": "text" }
6. "file-list": { "type": "file-list", "files": [{"path": "src/file.ts", "role": "description", "lineCount": 100}] }
7. "architecture-card": { "type": "architecture-card", "decision": "what", "rationale": "why", "tradeoffs": "gained/lost", "alternatives": "what else" }
8. "dependency-card": { "type": "dependency-card", "packageName": "pkg", "version": "1.0", "purpose": "why", "whatBreaksWithout": "consequence", "alternatives": "other options" }
9. "env-var-card": { "type": "env-var-card", "varName": "KEY", "required": true, "purpose": "why", "exampleValue": "value", "whatBreaksWithout": "consequence" }
10. "command-card": { "type": "command-card", "command": "npm run dev", "when": "when to use", "expectedOutput": "what you see", "commonErrors": [{"error": "msg", "fix": "solution"}] }

CRITICAL RULES:
- Code blocks MUST quote EXACTLY from the provided file contents — never invent or modify code
- If a code example isn't in the files, use a callout[tip] instead
- Include exactly ONE mermaid diagram per chapter — choose the type that best fits the abstraction
- Include at least ONE quiz per chapter with 4 options — test application, not memorization. Each option MUST have a detailed explanation (2+ sentences).
- Start with a text block introducing the abstraction — this MUST be at least 4-5 sentences explaining WHAT it does, WHY it exists, and HOW it fits into the bigger picture. Reference specific functions and data flows.
- Include a file-list block listing all files in this abstraction
- Mermaid syntax must be valid: use quotes around node labels with special chars, proper arrow syntax
- Include at least one callout block (tip, warning, or ai-hint) with practical advice
- Include at least 2 code blocks showing key functions or patterns from the files

ANTI-PLACEHOLDER RULES (CRITICAL):
- NEVER write generic filler like "This chapter covers...", "In this section we will explore...", "Let's dive into...", or "This component is responsible for..."
- Every text block MUST contain specific, concrete information: name actual functions, describe real data flows, reference actual variable names and types from the code
- Each text block must be at least 3-5 sentences of substantive technical content
- Quiz scenarios must describe a realistic debugging or development situation, not just "What does X do?"

Return ONLY a valid JSON object (no markdown fences):
{
  "blocks": [ ... array of block objects ... ]
}`;
}

export function getSetupChapterPrompt(audience: TargetAudience): string {
  return `You are writing the "Setup & Installation" chapter of a codebase tutorial.

${PERSONA_CONTEXT[audience]}

Using the package.json data, .env.example data, and Dockerfile data provided, generate a chapter with:
1. A text block with prerequisites (Node version, required tools) — be SPECIFIC about versions and system requirements, at least 4 sentences
2. One env-var-card per environment variable from .env.example
3. One command-card per important package.json script (at minimum: install, dev, build, test)
4. A callout[command] with the full install + start sequence
5. A callout[warning] about common setup pitfalls specific to this project
6. A text block explaining the development workflow after setup is complete

ANTI-PLACEHOLDER: Every text block must contain specific, actionable information. Never write "Set up the project by following these steps..." — instead describe the exact tools, versions, and configuration needed.

Return ONLY a valid JSON object: { "blocks": [ ... ] }`;
}

export function getDependenciesChapterPrompt(audience: TargetAudience): string {
  return `You are writing the "Dependencies Explained" chapter of a codebase tutorial.

${PERSONA_CONTEXT[audience]}

Using the package.json dependencies provided, generate a chapter with:
1. A text block introducing the dependency landscape — explain the overall technology stack philosophy in at least 4 sentences, referencing specific package choices and WHY they were picked over alternatives
2. One dependency-card per significant package (skip trivial type packages) — at minimum 8 cards
3. Group by category: Runtime essentials, Framework, Database, Testing, Build tools, Utilities
4. A mermaid diagram showing how the key dependencies relate to each other (e.g., framework -> ORM -> database driver)
5. A callout[tip] about dependency management best practices specific to this stack
6. A callout[warning] about known compatibility issues or version constraints

ANTI-PLACEHOLDER: Never write "This project uses several dependencies..." — instead name the specific packages and explain the concrete role each plays.

Return ONLY a valid JSON object: { "blocks": [ ... ] }`;
}

export function getTroubleshootingChapterPrompt(audience: TargetAudience): string {
  return `You are writing the "Troubleshooting & Common Errors" chapter of a codebase tutorial.

${PERSONA_CONTEXT[audience]}

Based on the codebase analysis, identify the 5 most likely failure points. Consider:
- Missing environment variables
- Database connection issues
- Authentication failures
- Port conflicts
- CORS errors
- Missing dependencies
- Build failures

For each issue, provide the specific file and function where the error originates.

Generate a chapter with:
1. A text block introducing the troubleshooting approach for this specific codebase — reference the actual tech stack and common failure patterns, at least 4 sentences
2. For each issue: a callout[warning] with the exact error message or symptom the user will see, then a text block with root cause analysis (referencing specific files and functions) and step-by-step fix
3. A command-card for common diagnostic commands relevant to this project's stack
4. A mermaid flowchart showing a debugging decision tree for the most common errors
5. A callout[tip] with debugging strategies specific to this codebase's architecture
6. A quiz testing the reader's ability to diagnose a realistic error scenario

ANTI-PLACEHOLDER: Never write "If you encounter an error..." generically. Reference actual file paths, function names, and error messages from the codebase.

Return ONLY a valid JSON object: { "blocks": [ ... ] }`;
}

export function getOverviewChapterPrompt(audience: TargetAudience): string {
  return `You are writing the "Overview & Architecture" chapter of a codebase tutorial.

${PERSONA_CONTEXT[audience]}

Generate an introductory chapter with:
1. A text block with a substantial summary (at least 5-6 sentences) of what this codebase does — cover its purpose, key features, target users, and the core problem it solves. Reference specific technologies and architectural patterns.
2. A mermaid flowchart (graph TD) showing the high-level architecture — main components and how they connect. Include at least 6 nodes with labeled edges.
3. A file-list block showing the key directories/files and their roles
4. A text block with key statistics: file count, main languages, estimated complexity, and what each language is used for
5. An architecture-card describing the primary architectural decision (e.g., monolith vs microservices, choice of framework)
6. A callout[tip] about how to navigate the course and which chapters to prioritize based on role
7. A quiz asking the reader to identify which component handles a specific responsibility

ANTI-PLACEHOLDER: The overview must contain real, specific information about THIS codebase. Never write "This is a software project that..." — name the actual technologies, patterns, and business domain.

Return ONLY a valid JSON object: { "blocks": [ ... ] }`;
}
