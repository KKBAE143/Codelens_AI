import { Redis } from "@upstash/redis";
import { db } from "@workspace/db";
import { aiPoolStats } from "@workspace/db/schema";

export type LlmTask = "stage1" | "stage2" | "stage3" | "stage4" | "summary";

interface GenerateTextOptions {
  task: LlmTask;
  prompt: string;
  maxOutputTokens: number;
  responseMimeType?: "application/json";
  accountLabel?: string;
}

interface GenerateTextResult {
  text: string;
  provider: "cloudflare";
  model: string;
  accountLabel?: string;
}

interface ModelConfig {
  model: string;
}

export interface CloudflarePoolAccount {
  accountId: string;
  authToken: string;
  label: string;
  stages?: string[];
}

interface AccountHealth {
  quarantinedUntil: number;
  errorCount: number;
  totalTokensToday: number;
  lastSuccess: number;
  weight: number;
}

interface CloudflareRunSuccess {
  success?: boolean;
  result?: unknown;
  errors?: Array<{ message?: string }>;
  messages?: Array<{ message?: string }>;
}

const DEFAULT_MODELS: Record<LlmTask, ModelConfig[]> = {
  stage1: [
    { model: "@cf/zai-org/glm-4.7-flash" },
    { model: "@cf/openai/gpt-oss-20b" },
  ],
  stage2: [
    { model: "@cf/zai-org/glm-4.7-flash" },
    { model: "@cf/openai/gpt-oss-20b" },
  ],
  stage3: [
    { model: "@cf/openai/gpt-oss-120b" },
    { model: "@cf/zai-org/glm-4.7-flash" },
    { model: "@cf/openai/gpt-oss-20b" },
  ],
  stage4: [
    { model: "@cf/openai/gpt-oss-120b" },
    { model: "@cf/zai-org/glm-4.7-flash" },
    { model: "@cf/openai/gpt-oss-20b" },
  ],
  summary: [
    { model: "@cf/zai-org/glm-4.7-flash" },
    { model: "@cf/openai/gpt-oss-20b" },
  ],
};

const ENV_MODEL_KEYS: Record<LlmTask, string> = {
  stage1: "COURSE_STAGE1_MODEL",
  stage2: "COURSE_STAGE2_MODEL",
  stage3: "COURSE_STAGE3_MODEL",
  stage4: "COURSE_STAGE4_MODEL",
  summary: "COURSE_SUMMARY_MODEL",
};

const RATE_LIMIT_QUARANTINE_MS = 5 * 60 * 1000;
const QUOTA_QUARANTINE_MS = 60 * 60 * 1000;
const DEFAULT_WEIGHT = 100;
const MIN_WEIGHT = 10;
const DAILY_TOKEN_QUOTA_ESTIMATE = 500_000;

let poolRedis: Redis | null = null;
let poolRedisChecked = false;

function getPoolRedis(): Redis | null {
  if (poolRedisChecked) return poolRedis;
  poolRedisChecked = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  poolRedis = new Redis({ url, token });
  return poolRedis;
}

const inMemoryHealth = new Map<string, AccountHealth>();

function getDefaultHealth(): AccountHealth {
  return {
    quarantinedUntil: 0,
    errorCount: 0,
    totalTokensToday: 0,
    lastSuccess: 0,
    weight: DEFAULT_WEIGHT,
  };
}

async function getAccountHealth(label: string): Promise<AccountHealth> {
  const redis = getPoolRedis();
  if (!redis) {
    return inMemoryHealth.get(label) || getDefaultHealth();
  }
  try {
    const data = await redis.get<AccountHealth>(`pool:health:${label}`);
    return data || getDefaultHealth();
  } catch {
    return inMemoryHealth.get(label) || getDefaultHealth();
  }
}

async function setAccountHealth(label: string, health: AccountHealth): Promise<void> {
  inMemoryHealth.set(label, health);
  const redis = getPoolRedis();
  if (!redis) return;
  try {
    await redis.set(`pool:health:${label}`, health, { ex: 86400 });
  } catch {
    /* silent fallback to in-memory */
  }
}

async function quarantineAccount(label: string, isQuota: boolean): Promise<void> {
  const health = await getAccountHealth(label);
  health.quarantinedUntil = Date.now() + (isQuota ? QUOTA_QUARANTINE_MS : RATE_LIMIT_QUARANTINE_MS);
  health.errorCount += 1;
  health.weight = Math.max(MIN_WEIGHT, Math.floor(health.weight * 0.5));
  await setAccountHealth(label, health);
  console.log(`[Pool] Quarantined ${label} until ${new Date(health.quarantinedUntil).toISOString()} (${isQuota ? "quota" : "rate-limit"})`);
}

async function recordSuccess(label: string, tokensUsed: number): Promise<void> {
  const health = await getAccountHealth(label);
  health.lastSuccess = Date.now();
  health.totalTokensToday += tokensUsed;
  health.errorCount = Math.max(0, health.errorCount - 1);
  health.weight = Math.min(DEFAULT_WEIGHT, health.weight + 10);
  if (health.quarantinedUntil > 0 && Date.now() >= health.quarantinedUntil) {
    health.quarantinedUntil = 0;
  }
  await setAccountHealth(label, health);
}

function isAccountHealthy(health: AccountHealth): boolean {
  return health.quarantinedUntil === 0 || Date.now() >= health.quarantinedUntil;
}

let cachedAccounts: CloudflarePoolAccount[] | null = null;

export function getPoolAccounts(): CloudflarePoolAccount[] {
  if (cachedAccounts) return cachedAccounts;

  const jsonEnv = process.env.CLOUDFLARE_POOL_ACCOUNTS;
  if (jsonEnv) {
    try {
      const parsed = JSON.parse(jsonEnv);
      if (Array.isArray(parsed) && parsed.length > 0) {
        cachedAccounts = parsed.map((entry: Record<string, unknown>, i: number) => ({
          accountId: String(entry.accountId || ""),
          authToken: String(entry.authToken || ""),
          label: String(entry.label || `account-${i + 1}`),
          stages: Array.isArray(entry.stages) ? entry.stages.map(String) : undefined,
        })).filter((a: CloudflarePoolAccount) => a.accountId && a.authToken);

        if (cachedAccounts.length > 0) return cachedAccounts;
      }
    } catch {
      console.warn("[Pool] Failed to parse CLOUDFLARE_POOL_ACCOUNTS JSON, falling back to numbered env vars");
    }
  }

  const accounts: CloudflarePoolAccount[] = [];

  const sharedAccountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const sharedAuthToken = process.env.CLOUDFLARE_AUTH_TOKEN?.trim();
  if (sharedAccountId && sharedAuthToken) {
    accounts.push({ accountId: sharedAccountId, authToken: sharedAuthToken, label: "shared" });
  }

  let consecutiveMisses = 0;
  for (let i = 1; consecutiveMisses < 5; i++) {
    const accountId = process.env[`CLOUDFLARE_ACCOUNT_ID_${i}`]?.trim();
    const authToken = process.env[`CLOUDFLARE_AUTH_TOKEN_${i}`]?.trim();
    if (!accountId && !authToken) {
      consecutiveMisses++;
      continue;
    }
    consecutiveMisses = 0;
    if (!accountId || !authToken) {
      console.warn(`[Pool] Incomplete credential pair for CLOUDFLARE_ACCOUNT_ID_${i}`);
      continue;
    }
    accounts.push({ accountId, authToken, label: `account-${i}` });
  }

  for (const stage of ["STAGE1", "STAGE2", "STAGE3", "STAGE4", "SUMMARY"] as const) {
    const accountId = process.env[`CLOUDFLARE_${stage}_ACCOUNT_ID`]?.trim();
    const authToken = process.env[`CLOUDFLARE_${stage}_AUTH_TOKEN`]?.trim();
    if (!accountId || !authToken) continue;
    const stageLabel = stage.toLowerCase().replace("stage", "stage-");
    const existing = accounts.find(a => a.accountId === accountId);
    if (existing) {
      if (!existing.stages) existing.stages = [];
      existing.stages.push(stage.toLowerCase());
    } else {
      accounts.push({
        accountId,
        authToken,
        label: stageLabel,
        stages: [stage.toLowerCase()],
      });
    }
  }

  if (accounts.length === 0) {
    throw new Error(
      "No Cloudflare Workers AI accounts configured. Set CLOUDFLARE_POOL_ACCOUNTS JSON, or CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_AUTH_TOKEN, or numbered CLOUDFLARE_ACCOUNT_ID_N/CLOUDFLARE_AUTH_TOKEN_N."
    );
  }

  cachedAccounts = accounts;
  return accounts;
}

export function clearPoolCache(): void {
  cachedAccounts = null;
}

export function getAccountsForStage(stage: LlmTask): CloudflarePoolAccount[] {
  const all = getPoolAccounts();
  const stageKey = stage === "summary" ? "summary" : stage;
  const tagged = all.filter(a => a.stages && a.stages.includes(stageKey));
  return tagged.length > 0 ? tagged : all;
}

function computeEffectiveWeight(health: AccountHealth): number {
  const baseWeight = health.weight;
  const usageRatio = Math.min(1, health.totalTokensToday / DAILY_TOKEN_QUOTA_ESTIMATE);
  const usagePenalty = 1 - (usageRatio * 0.8);
  return Math.max(MIN_WEIGHT, Math.floor(baseWeight * usagePenalty));
}

async function selectAccountWeightedRR(
  accounts: CloudflarePoolAccount[],
  excludeLabels?: Set<string>,
): Promise<{ account: CloudflarePoolAccount; health: AccountHealth } | null> {
  const candidates: Array<{ account: CloudflarePoolAccount; health: AccountHealth; weight: number }> = [];
  let totalWeight = 0;

  for (const account of accounts) {
    if (excludeLabels?.has(account.label)) continue;
    const health = await getAccountHealth(account.label);
    if (!isAccountHealthy(health)) continue;
    const w = computeEffectiveWeight(health);
    candidates.push({ account, health, weight: w });
    totalWeight += w;
  }

  if (candidates.length === 0) return null;

  let random = Math.random() * totalWeight;
  for (const candidate of candidates) {
    random -= candidate.weight;
    if (random <= 0) {
      return { account: candidate.account, health: candidate.health };
    }
  }

  return candidates[candidates.length - 1];
}

export async function getHealthyAccountCount(stage?: LlmTask): Promise<number> {
  const accounts = stage ? getAccountsForStage(stage) : getPoolAccounts();
  let count = 0;
  for (const account of accounts) {
    const health = await getAccountHealth(account.label);
    if (isAccountHealthy(health)) count++;
  }
  return count;
}

export async function getAllAccountHealths(): Promise<Array<{ account: CloudflarePoolAccount; health: AccountHealth }>> {
  const accounts = getPoolAccounts();
  const results: Array<{ account: CloudflarePoolAccount; health: AccountHealth }> = [];
  for (const account of accounts) {
    const health = await getAccountHealth(account.label);
    results.push({ account, health });
  }
  return results;
}

async function logPoolStat(
  accountLabel: string,
  stage: string,
  model: string,
  tokensUsed: number,
  latencyMs: number,
  success: boolean,
  errorCode?: string,
): Promise<void> {
  try {
    await db.insert(aiPoolStats).values({
      accountLabel,
      stage,
      model,
      tokensUsed,
      latencyMs,
      success,
      errorCode: errorCode || null,
    });
  } catch (err) {
    console.warn("[Pool] Failed to log stat:", err);
  }
}

function getTaskConfigs(task: LlmTask): ModelConfig[] {
  const overrideModel = process.env[ENV_MODEL_KEYS[task]]?.trim();
  if (overrideModel) {
    return [{ model: overrideModel }];
  }
  return DEFAULT_MODELS[task];
}

export async function generateText(
  options: GenerateTextOptions,
): Promise<GenerateTextResult> {
  const stageAccounts = getAccountsForStage(options.task);
  const errors: string[] = [];
  const triedLabels = new Set<string>();

  if (options.accountLabel) {
    const specific = stageAccounts.find(a => a.label === options.accountLabel);
    if (specific) {
      const health = await getAccountHealth(specific.label);
      if (isAccountHealthy(health)) {
        const result = await tryAccountWithModels(specific, options, errors);
        if (result) return result;
      }
      triedLabels.add(specific.label);
    }
  }

  for (let round = 0; round < stageAccounts.length; round++) {
    const selected = await selectAccountWeightedRR(stageAccounts, triedLabels);
    if (!selected) break;

    triedLabels.add(selected.account.label);
    const result = await tryAccountWithModels(selected.account, options, errors);
    if (result) return result;
  }

  const quotaHits = errors.filter((e) => e.includes("[quota]"));
  if (quotaHits.length > 0 && quotaHits.length === errors.length) {
    throw new Error(
      `All Cloudflare accounts have exhausted their daily free quota. ` +
        `Add more accounts via CLOUDFLARE_POOL_ACCOUNTS or upgrade to a paid plan.`,
    );
  }

  throw new Error(
    `All AI providers failed for ${options.task}. ${errors.join(" | ")}`,
  );
}

async function tryAccountWithModels(
  account: CloudflarePoolAccount,
  options: GenerateTextOptions,
  errors: string[],
): Promise<GenerateTextResult | null> {
  for (const config of getTaskConfigs(options.task)) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const startMs = Date.now();
      try {
        await waitForBackpressure();
        const text = await generateWithCloudflare(
          account.accountId,
          account.authToken,
          config.model,
          options,
        );

        const latency = Date.now() - startMs;
        const estimatedTokens = Math.ceil(text.length / 4);
        await recordSuccess(account.label, estimatedTokens);
        logPoolStat(account.label, options.task, config.model, estimatedTokens, latency, true);

        return { text, provider: "cloudflare", model: config.model, accountLabel: account.label };
      } catch (error) {
        const latency = Date.now() - startMs;
        const message = getErrorMessage(error);

        if (isQuotaError(message)) {
          errors.push(`cloudflare:${account.label}:${config.model}[quota] -> ${message}`);
          await quarantineAccount(account.label, true);
          logPoolStat(account.label, options.task, config.model, 0, latency, false, "quota");
          return null;
        }

        if (isRateLimitError(message)) {
          errors.push(`cloudflare:${account.label}:${config.model}[rate-limit] -> ${message}`);
          await quarantineAccount(account.label, false);
          logPoolStat(account.label, options.task, config.model, 0, latency, false, "rate-limit");

          const retryDelayMs = getRetryDelayMs(error);
          if (retryDelayMs !== null && attempt < 3) {
            applyBackpressure(retryDelayMs);
            await sleep(retryDelayMs);
            continue;
          }
          return null;
        }

        const retryDelayMs = getRetryDelayMs(error);
        const shouldRetry = attempt < 3 && retryDelayMs !== null;

        logPoolStat(account.label, options.task, config.model, 0, latency, false, shouldRetry ? "retry" : "error");

        if (!shouldRetry) {
          errors.push(`cloudflare:${account.label}:${config.model} -> ${message}`);
          break;
        }

        applyBackpressure(retryDelayMs);
        await sleep(retryDelayMs);
      }
    }
  }
  return null;
}

export async function testCloudflareCredentials(
  accountId: string,
  authToken: string,
): Promise<{ success: boolean; error?: string; model?: string; latencyMs?: number }> {
  const startMs = Date.now();
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/zai-org/glm-4.7-flash`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Say hello in one word." }],
          max_completion_tokens: 10,
          temperature: 0,
          chat_template_kwargs: { enable_thinking: false },
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    const data = (await response.json()) as CloudflareRunSuccess;
    if (!response.ok || data.success === false) {
      return { success: false, error: extractCloudflareError(data, response.status) };
    }
    return { success: true, model: "@cf/zai-org/glm-4.7-flash", latencyMs: Date.now() - startMs };
  } catch (err) {
    return { success: false, error: getErrorMessage(err) };
  }
}

const AI_FETCH_TIMEOUT_MS = 120_000;

async function generateWithCloudflare(
  accountId: string,
  authToken: string,
  model: string,
  options: GenerateTextOptions,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(buildCloudflareBody(model, options)),
        signal: controller.signal,
      },
    );
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`AI request timed out after ${AI_FETCH_TIMEOUT_MS / 1000}s for model ${model}`);
    }
    throw err;
  }
  clearTimeout(timeoutId);

  const data = (await response.json()) as CloudflareRunSuccess;

  if (!response.ok || data.success === false) {
    throw new Error(extractCloudflareError(data, response.status));
  }

  return extractCloudflareText(data.result);
}

function buildCloudflareBody(model: string, options: GenerateTextOptions) {
  const messages = buildMessages(options);

  if (model.startsWith("@cf/openai/")) {
    return {
      messages,
      max_tokens: options.maxOutputTokens,
      temperature: 0,
      ...(options.responseMimeType === "application/json"
        ? { response_format: { type: "json_object" } }
        : {}),
    };
  }

  return {
    messages,
    max_completion_tokens: options.maxOutputTokens,
    temperature: 0,
    ...(model === "@cf/zai-org/glm-4.7-flash"
      ? { chat_template_kwargs: { enable_thinking: false } }
      : {}),
    ...(options.responseMimeType === "application/json"
      ? { response_format: { type: "json_object" } }
      : {}),
  };
}

function buildMessages(options: GenerateTextOptions) {
  if (options.responseMimeType === "application/json") {
    return [
      {
        role: "system",
        content:
          `You are a world-class technical writer creating detailed, production-quality educational content about codebases. Return valid JSON only — no markdown fences, no commentary, no prose outside the JSON structure.

CRITICAL: Every response must contain SUBSTANTIAL, DETAILED content. Never produce placeholder text. Never write generic summaries like "This chapter covers..." or "In this section we will..." or "Let's explore...". Instead, write real technical explanations with specific details from the actual code provided.

Each text block must contain multiple paragraphs of real technical explanation. Each code block must quote EXACT code from the files provided. Each mermaid diagram must show REAL relationships between components in the codebase.`,
      },
      { role: "user", content: options.prompt },
    ];
  }

  if (options.task === "stage3" || options.task === "stage4") {
    return [
      {
        role: "system",
        content:
          "Return only the final HTML document. Do not add markdown fences or explanation.",
      },
      { role: "user", content: options.prompt },
    ];
  }

  return [{ role: "user", content: options.prompt }];
}

function extractCloudflareText(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }

  if (!result || typeof result !== "object") {
    return "";
  }

  const record = result as Record<string, unknown>;

  if (typeof record.response === "string") {
    return record.response;
  }

  const resultText = record.result;
  if (typeof resultText === "string") {
    return resultText;
  }

  const choices = Array.isArray(record.choices)
    ? (record.choices as Array<Record<string, unknown>>)
    : [];
  const message = choices[0]?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  const reasoningContent = message?.reasoning_content;

  if (typeof content === "string") {
    return content;
  }

  if (typeof reasoningContent === "string") {
    return reasoningContent;
  }

  if (Array.isArray(content)) {
    const joined = content
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const text = (item as Record<string, unknown>).text;
        return typeof text === "string" ? text : "";
      })
      .join("");

    if (joined) {
      return joined;
    }
  }

  const output = Array.isArray(record.output)
    ? (record.output as Array<Record<string, unknown>>)
    : [];
  const outputText = output
    .flatMap((item) => {
      const contentParts = Array.isArray(item.content)
        ? (item.content as Array<Record<string, unknown>>)
        : [];
      return contentParts.map((part) =>
        typeof part.text === "string" ? part.text : "",
      );
    })
    .join("");

  return outputText;
}

function extractCloudflareError(
  data: CloudflareRunSuccess,
  status: number,
): string {
  const errors =
    data.errors?.map((error) => error.message).filter(Boolean) ?? [];
  const messages =
    data.messages?.map((message) => message.message).filter(Boolean) ?? [];
  const combined = [...errors, ...messages].join(" | ");

  return combined || `Cloudflare Workers AI request failed (${status})`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

function isQuotaError(message: string): boolean {
  return /free allocation|neurons.*upgrade|daily.*limit.*exceeded/i.test(message);
}

function isRateLimitError(message: string): boolean {
  return /rate limit|too many requests|429/i.test(message);
}

function getRetryDelayMs(error: unknown): number | null {
  const message = getErrorMessage(error);
  const match = message.match(/(?:retry|try again) in\s+([0-9.]+)s/i);

  if (match) {
    return Math.min(Math.ceil(Number(match[1]) * 1000) + 250, 30000);
  }

  if (
    /rate limit|too many requests|temporar|capacity|overloaded/i.test(message)
  ) {
    return 3000;
  }

  return null;
}

let lastBackoffUntil = 0;

async function waitForBackpressure(): Promise<void> {
  const now = Date.now();
  if (now < lastBackoffUntil) {
    const waitMs = lastBackoffUntil - now;
    console.log(`[LLM] Backpressure: waiting ${waitMs}ms before next request`);
    await sleep(waitMs);
  }
}

function applyBackpressure(delayMs: number): void {
  const until = Date.now() + delayMs;
  if (until > lastBackoffUntil) {
    lastBackoffUntil = until;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { sleep };
