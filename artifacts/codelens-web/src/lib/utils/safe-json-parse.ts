/**
 * Safely parse JSON from AI model output.
 * Models can produce JSON with invalid escape sequences,
 * unescaped control characters, or raw code snippets that
 * break JSON.parse().
 *
 * Repair pipeline:
 * 1. Trim and remove BOM
 * 2. Extract from markdown code fences if present
 * 3. Extract JSON object/array if surrounded by extra text
 * 4. Try direct parse
 * 5. Remove control characters
 * 6. Run escapeControlInJsonStrings
 * 7. Try parsing again
 * 8. Last resort: extract largest valid JSON substring
 */
export function safeParseJson<T = unknown>(raw: string): T {
  // 1. Remove BOM and trim whitespace
  let cleaned = raw.trim().replace(/^\uFEFF/, "");

  // 2. Extract JSON object if wrapped in markdown code fences
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) cleaned = fenced[1].trim();

  // 3. Extract JSON object/array if extra text surrounds it
  const objMatch = cleaned.match(/[{[][\s\S]*[\]}]/);
  if (objMatch) cleaned = objMatch[0];

  // 4. Try direct parse first
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // continue to fixes
  }

  // 5. Fix: remove all control characters (0x00-0x1F) that aren't escaped
  //    These appear in raw code snippets from the model
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

  // 6. Fix: the model sometimes outputs raw newlines inside JSON strings
  //    (e.g., "code": "line1\nline2" where \n is a literal newline)
  //    Strategy: walk through the JSON and escape them
  cleaned = escapeControlInJsonStrings(cleaned);

  // 7. Try parsing again
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // continue to fallback
  }

  // 8. Last resort: extract the largest valid JSON substring
  const start = cleaned.search(/[{[]/);
  const lastClose = Math.max(
    cleaned.lastIndexOf("}"),
    cleaned.lastIndexOf("]"),
  );
  if (start >= 0 && lastClose > start) {
    const slice = cleaned.slice(start, lastClose + 1);
    try {
      return JSON.parse(slice) as T;
    } catch (e) {
      throw new Error(
        `Failed to parse AI response as JSON. Error: ${e instanceof Error ? e.message : "unknown"}. Raw (first 300 chars): ${slice.slice(0, 300)}`,
      );
    }
  }
  throw new Error(
    `Failed to parse AI response as JSON. Raw (first 300 chars): ${cleaned.slice(0, 300)}`,
  );
}

/**
 * Escape control characters (newlines, tabs, etc.) that appear
 * literally inside JSON string values. AI models sometimes output
 * raw code snippets without escaping them properly.
 *
 * Walks character-by-character tracking string state and escapes
 * \n, \r, \t, \b, \f and other control chars (< 0x20).
 */
export function escapeControlInJsonStrings(json: string): string {
  const result: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];

    if (escaped) {
      result.push(ch);
      escaped = false;
      continue;
    }

    if (ch === "\\" && inString) {
      result.push(ch);
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result.push(ch);
      continue;
    }

    if (inString) {
      switch (ch) {
        case "\n":
          result.push("\\n");
          break;
        case "\r":
          result.push("\\r");
          break;
        case "\t":
          result.push("\\t");
          break;
        case "\b":
          result.push("\\b");
          break;
        case "\f":
          result.push("\\f");
          break;
        default:
          if (ch.charCodeAt(0) < 0x20) {
            result.push("\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"));
          } else {
            result.push(ch);
          }
      }
    } else {
      result.push(ch);
    }
  }

  return result.join("");
}
