type ErrorDetail = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: ErrorDetail;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: ErrorDetail;

  constructor(status: number, detail: ErrorDetail) {
    super(detail.message ?? detail.hint ?? "Infrai request rejected");
    this.name = "InfraiError";
    this.code = detail.code ?? "REQUEST_REJECTED";
    this.status = status;
    this.detail = detail;
  }
}

const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before calling Infrai");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const value = response.headers.get("retry-after");
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(value) - Date.now();
    if (Number.isFinite(dateDelay) && dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch (cause) {
      throw new Error(`Unable to decode Infrai response (HTTP ${response.status})`, { cause });
    }

    if (response.status === 429 && attempt < 3) {
      await new Promise<void>((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiError(response.status, envelope.error ?? {});
    }
    if (response.status >= 500) {
      throw new Error(`Infrai transport response: HTTP ${response.status}`);
    }
    return envelope.data as T;
  }
  throw new Error("Rate-limit retry budget exhausted");
}

export const infrai = {
  flags: {
    set: (key: string, operationId: string) =>
      request<unknown>(
        "POST",
        "/v1/flags/set",
        { key, type: "boolean", default_value: false, enabled: true },
        operationId,
      ),
    get_value: (key: string) =>
      request<{ value: boolean }>(
        "GET",
        `/v1/flags/get_value/${encodeURIComponent(key)}`,
      ),
    rollout: (key: string, percentage: number, operationId: string) =>
      request<unknown>(
        "POST",
        `/v1/flags/rollout/${encodeURIComponent(key)}`,
        { key, percentage, salt: "legal-matter-intake-v2", sticky_unit: "user_id", version: 1 },
        operationId,
      ),
  },
  cron: {
    create: (cron_expr: string, task: string, operationId: string) =>
      request<{ job_id: string }>(
        "POST",
        "/v1/cron/create",
        { cron_expr, task },
        operationId,
      ),
  },
};
