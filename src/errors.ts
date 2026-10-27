export interface PaymenkuApiErrorOptions {
  status: number;
  body?: unknown;
  errors?: Record<string, string[]>;
  errorCode?: string | null;
}

/** Galat yang dikembalikan API (HTTP 4xx/5xx atau envelope error). */
export class PaymenkuApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly errors?: Record<string, string[]>;
  readonly errorCode?: string | null;

  constructor(message: string, options: PaymenkuApiErrorOptions) {
    super(message);
    this.name = 'PaymenkuApiError';
    this.status = options.status;
    this.body = options.body;
    this.errors = options.errors;
    this.errorCode = options.errorCode;
  }
}

/** Kegagalan jaringan, timeout, atau respons yang bukan JSON. */
export class PaymenkuNetworkError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'PaymenkuNetworkError';
    this.cause = cause;
  }
}
