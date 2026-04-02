import { describe, it, expect } from "vitest";
import { safeParseJson, escapeControlInJsonStrings } from "@/lib/utils/safe-json-parse";

describe("safeParseJson", () => {
  it("parses valid JSON object", () => {
    const result = safeParseJson<{ a: number; b: string }>('{"a": 1, "b": "hello"}');
    expect(result).toEqual({ a: 1, b: "hello" });
  });

  it("parses valid JSON array", () => {
    const result = safeParseJson<number[]>("[1, 2, 3]");
    expect(result).toEqual([1, 2, 3]);
  });

  it("handles markdown code fences", () => {
    const result = safeParseJson<{ key: string }>('```json\n{"key": "value"}\n```');
    expect(result).toEqual({ key: "value" });
  });

  it("handles markdown code fences without json tag", () => {
    const result = safeParseJson<{ key: string }>('```\n{"key": "value"}\n```');
    expect(result).toEqual({ key: "value" });
  });

  it("extracts JSON from surrounding text", () => {
    const result = safeParseJson<{ x: number }>('Here is the result: {"x": 42}. Done.');
    expect(result).toEqual({ x: 42 });
  });

  it("escapes literal newlines in string values", () => {
    const result = safeParseJson<{ code: string }>('{"code": "line1\nline2"}');
    expect(result).toEqual({ code: "line1\nline2" });
  });

  it("escapes literal tabs in string values", () => {
    const result = safeParseJson<{ code: string }>('{"code": "a\tb"}');
    expect(result).toEqual({ code: "a\tb" });
  });

  it("removes control characters outside strings", () => {
    const raw = '{"a": 1}\x00\x01';
    const result = safeParseJson<{ a: number }>(raw);
    expect(result).toEqual({ a: 1 });
  });

  it("handles nested objects", () => {
    const result = safeParseJson<{ outer: { inner: boolean } }>('{"outer": {"inner": true}}');
    expect(result).toEqual({ outer: { inner: true } });
  });

  it("handles escaped quotes inside strings", () => {
    const result = safeParseJson<{ msg: string }>('{"msg": "say \\"hello\\""}');
    expect(result).toEqual({ msg: 'say "hello"' });
  });

  it("throws descriptive error for completely invalid input", () => {
    expect(() => safeParseJson("not json at all")).toThrow(/Failed to parse/);
  });

  it("throws with first 300 chars of raw input on failure", () => {
    try {
      safeParseJson("abc");
    } catch (e) {
      expect((e as Error).message).toContain("abc");
    }
  });

  it("handles empty object", () => {
    const result = safeParseJson<Record<string, never>>("{}");
    expect(result).toEqual({});
  });

  it("handles empty array", () => {
    const result = safeParseJson<never[]>("[]");
    expect(result).toEqual([]);
  });

  it("handles unicode characters in strings", () => {
    const result = safeParseJson<{ emoji: string }>('{"emoji": "hello"}');
    expect(result).toEqual({ emoji: "hello" });
  });

  it("handles BOM at start of input", () => {
    const result = safeParseJson<{ a: number }>("\uFEFF{\"a\": 1}");
    expect(result).toEqual({ a: 1 });
  });

  it("handles whitespace around JSON", () => {
    const result = safeParseJson<{ a: number }>('  \n  {"a": 1}  \n  ');
    expect(result).toEqual({ a: 1 });
  });
});

describe("escapeControlInJsonStrings", () => {
  it("escapes literal newlines inside strings", () => {
    const result = escapeControlInJsonStrings('{"a": "hello\nworld"}');
    expect(result).toBe('{"a": "hello\\nworld"}');
  });

  it("escapes literal tabs inside strings", () => {
    const result = escapeControlInJsonStrings('{"a": "hello\tworld"}');
    expect(result).toBe('{"a": "hello\\tworld"}');
  });

  it("does not escape control chars outside strings", () => {
    const result = escapeControlInJsonStrings('{"a": 1}\n');
    expect(result).toBe('{"a": 1}\n');
  });

  it("handles already-escaped characters", () => {
    const result = escapeControlInJsonStrings('{"a": "hello\\nworld"}');
    expect(result).toBe('{"a": "hello\\nworld"}');
  });

  it("handles multiple strings", () => {
    const result = escapeControlInJsonStrings('{"a": "x\ny", "b": "p\tq"}');
    expect(result).toBe('{"a": "x\\ny", "b": "p\\tq"}');
  });

  it("handles carriage returns", () => {
    const result = escapeControlInJsonStrings('{"a": "x\ry"}');
    expect(result).toBe('{"a": "x\\ry"}');
  });

  it("handles form feeds", () => {
    const result = escapeControlInJsonStrings('{"a": "x\fy"}');
    expect(result).toBe('{"a": "x\\fy"}');
  });

  it("handles backspace", () => {
    const result = escapeControlInJsonStrings('{"a": "x\by"}');
    expect(result).toBe('{"a": "x\\by"}');
  });
});
