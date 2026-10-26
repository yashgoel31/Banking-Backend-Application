import { ApiError } from './errors';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Required by the API for money-moving requests; reuse the same key when retrying the same intent */
  idempotencyKey?: string;
  /** Attach the access token and refresh it on 401 (default true) */
  auth?: boolean;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface ApiClientConfig {
  baseUrl?: string;
  getAccessToken: () => string | null;
  /** Returns a fresh access token, or null when the session can't be renewed */
  refreshAccessToken: () => Promise<string | null>;
  onSessionExpired: () => void;
  timeoutMs?: number;
}

/** Tells the auth service to keep the refresh token in an HttpOnly cookie, never in a response body */
export const SESSION_TRANSPORT_HEADER = 'X-Session-Transport';

interface ErrorBody {
  error?: { code?: string; message?: string; correlationId?: string; details?: Array<{ field: string; message: string }> };
}

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'BAD_REQUEST',
  429: 'RATE_LIMIT_EXCEEDED',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
  504: 'GATEWAY_TIMEOUT',
};

function buildQuery(query: Record<string, QueryValue> | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ErrorBody | undefined;
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    body = undefined;
  }
  const retryAfter = Number(response.headers.get('Retry-After'));
  return new ApiError({
    status: response.status,
    code: body?.error?.code ?? STATUS_CODES[response.status] ?? (response.status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST'),
    message: body?.error?.message ?? response.statusText ?? 'Request failed',
    correlationId: body?.error?.correlationId ?? response.headers.get('X-Correlation-Id') ?? undefined,
    details: body?.error?.details,
    retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  });
}

const unauthorized = () => new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'Your session has ended' });

export class ApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ApiClientConfig) {
    this.baseUrl = config.baseUrl ?? '/api/v1';
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const useAuth = options.auth ?? true;
    if (!useAuth) return this.send<T>(path, options, null);

    let token = this.config.getAccessToken();
    if (!token) {
      token = await this.config.refreshAccessToken();
      if (!token) {
        this.config.onSessionExpired();
        throw unauthorized();
      }
    }
    try {
      return await this.send<T>(path, options, token);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      // The access token expired or was revoked: renew once, then retry the same request (same idempotency key)
      const renewed = await this.config.refreshAccessToken();
      if (!renewed) {
        this.config.onSessionExpired();
        throw error;
      }
      try {
        return await this.send<T>(path, options, renewed);
      } catch (retryError) {
        if (retryError instanceof ApiError && retryError.status === 401) this.config.onSessionExpired();
        throw retryError;
      }
    }
  }

  private async send<T>(path: string, options: RequestOptions, token: string | null): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      [SESSION_TRANSPORT_HEADER]: 'cookie',
      ...options.headers,
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}${buildQuery(options.query)}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error; // the caller cancelled: let the query layer handle it
      if (timeout.aborted) {
        throw new ApiError({ status: 0, code: 'TIMEOUT', message: 'The request timed out' });
      }
      throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Network request failed' });
    }

    if (!response.ok) throw await toApiError(response);
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}
