type LlmTask = "stage1" | "stage2" | "stage3" | "summary";

interface GenerateTextOptions {
  task: LlmTask;
  prompt: string;
  maxOutputTokens: number;
  responseMimeType?: "application/json";
}

interface GenerateTextResult {
  text: string;
  provider: "cloudflare";
  model: string;
}

interface ModelConfig {
  model: string;
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
  summary: [
    { model: "@cf/zai-org/glm-4.7-flash" },
    { model: "@cf/openai/gpt-oss-20b" },
  ],
};

const ENV_MODEL_KEYS: Record<LlmTask, string> = {
  stage1: "COURSE_STAGE1_MODEL",
  stage2: "COURSE_STAGE2_MODEL",
  stage3: "COURSE_STAGE3_MODEL",
  summary: "COURSE_SUMMARY_MODEL",
};

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
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const authToken = process.env.CLOUDFLARE_AUTH_TOKEN?.trim();

  if (!accountId || !authToken) {
    throw new Error(
      "Cloudflare Workers AI is not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AUTH_TOKEN.",
    );
  }

  const errors: string[] = [];

  for (const config of getTaskConfigs(options.task)) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const text = await generateWithCloudflare(
          accountId,
          authToken,
          config.model,
          options,
        );

        return { text, provider: "cloudflare", model: config.model };
      } catch (error) {
        const retryDelayMs = getRetryDelayMs(error);
        const shouldRetry =
          attempt < 3 && retryDelayMs !== null && isRetryableError(error);

        if (!shouldRetry) {
          errors.push(
            `cloudflare:${config.model} -> ${getErrorMessage(error)}`,
          );
          break;
        }

        await sleep(retryDelayMs);
      }
    }
  }

  throw new Error(
    `All AI providers failed for ${options.task}. ${errors.join(" | ")}`,
  );
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
          "Return valid JSON only. Do not include markdown fences, commentary, or extra prose.",
      },
      { role: "user", content: options.prompt },
    ];
  }

  if (options.task === "stage3") {
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

function isRetryableError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return /rate limit|too many requests|temporar|capacity|overloaded/i.test(
    message,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
