import { PaymenkuApiError, PaymenkuNetworkError } from './errors.js';
import { verifyWebhookSignature, type VerifyWebhookInput } from './webhooks.js';
import type {
  CancelResult,
  CreatePaymentLinkInput,
  CreateTransactionInput,
  CreatedTransaction,
  FeeEstimate,
  ListTransactionsParams,
  Pagination,
  PaymentChannel,
  PaymentInstruction,
  PaymentInstructionOptions,
  PaymentLink,
  PaymentLinkDetail,
  PendingBalance,
  RawResponse,
  RefundResult,
  RequestOptions,
  Transaction,
  TransactionList,
  WalletBalance,
} from './types.js';

const DEFAULT_BASE_URL = 'https://paymenku.com/api/v1';
const DEFAULT_TIMEOUT_MS = 30_000;
const VERSION = '0.1.0';

export interface PaymenkuOptions {
  /** Bawaan: https://paymenku.com/api/v1 */
  baseUrl?: string;
  /** Bawaan: 30000 ms. */
  timeoutMs?: number;
  /** Untuk pengujian atau runtime khusus. */
  fetch?: typeof globalThis.fetch;
  userAgent?: string;
}

interface RequestArgs {
  query?: Record<string, unknown>;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

function buildQuery(query?: Record<string, unknown>): string {
  if (!query) return '';

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'boolean') {
      params.set(key, value ? 'true' : 'false');
    } else {
      params.set(key, String(value));
    }
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

function isErrorEnvelope(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const record = body as Record<string, unknown>;
  return record.status === 'error' || record.success === false;
}

function hasDataEnvelope(body: unknown): body is { data: unknown } {
  return !!body && typeof body === 'object' && 'data' in (body as Record<string, unknown>);
}

function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const message = (body as Record<string, unknown>).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return fallback;
}

export class Paymenku {
  readonly transactions: TransactionsResource;
  readonly paymentChannels: PaymentChannelsResource;
  readonly fees: FeesResource;
  readonly paymentInstructions: PaymentInstructionsResource;
  readonly paymentLinks: PaymentLinksResource;
  readonly wallet: WalletResource;
  readonly webhooks: WebhooksResource;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly userAgent: string;

  constructor(apiKey: string, options: PaymenkuOptions = {}) {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new TypeError('API key Paymenku wajib diisi');
    }

    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.userAgent = options.userAgent ?? `paymenku-node/${VERSION}`;

    if (typeof this.fetchImpl !== 'function') {
      throw new TypeError('fetch tidak tersedia; gunakan Node.js 18+ atau kirim opsi fetch');
    }

    this.transactions = new TransactionsResource(this);
    this.paymentChannels = new PaymentChannelsResource(this);
    this.fees = new FeesResource(this);
    this.paymentInstructions = new PaymentInstructionsResource(this);
    this.paymentLinks = new PaymentLinksResource(this);
    this.wallet = new WalletResource(this);
    this.webhooks = new WebhooksResource();
  }

  /** Escape hatch: kirim permintaan sendiri dan terima envelope lengkap. */
  async request<T = unknown>(
    method: 'GET' | 'POST',
    path: string,
    args: RequestArgs = {},
  ): Promise<RawResponse<T>> {
    if (!path.startsWith('/')) {
      throw new TypeError('path harus dimulai dengan "/"');
    }

    const url = `${this.baseUrl}${path}${buildQuery(args.query)}`;
    const headers = new Headers({
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
      'User-Agent': this.userAgent,
    });

    if (args.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    if (args.idempotencyKey) {
      headers.set('Idempotency-Key', args.idempotencyKey);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), this.timeoutMs);
    const onAbort = () => controller.abort(args.signal?.reason);
    args.signal?.addEventListener('abort', onAbort, { once: true });

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: args.body === undefined ? undefined : JSON.stringify(args.body),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new PaymenkuNetworkError(
          args.signal?.aborted
            ? 'Permintaan dibatalkan'
            : `Permintaan melebihi batas waktu ${this.timeoutMs} ms`,
          error,
        );
      }
      throw new PaymenkuNetworkError('Gagal menghubungi API Paymenku', error);
    } finally {
      clearTimeout(timer);
      args.signal?.removeEventListener('abort', onAbort);
    }

    const text = await response.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new PaymenkuNetworkError(
          `Respons bukan JSON (HTTP ${response.status})`,
          text.slice(0, 500),
        );
      }
    }

    if (!response.ok || isErrorEnvelope(body)) {
      const record = (body ?? {}) as Record<string, unknown>;
      throw new PaymenkuApiError(extractMessage(body, `HTTP ${response.status}`), {
        status: response.status,
        body,
        errors: record.errors as Record<string, string[]> | undefined,
        errorCode: typeof record.error_code === 'string' ? record.error_code : null,
      });
    }

    return {
      status: response.status,
      headers: response.headers,
      data: (hasDataEnvelope(body) ? body.data : body) as T,
      body,
    };
  }
}

class TransactionsResource {
  constructor(private readonly client: Paymenku) {}

  create(input: CreateTransactionInput, options: RequestOptions = {}): Promise<CreatedTransaction> {
    return this.client
      .request<CreatedTransaction>('POST', '/transaction/create', {
        body: input,
        idempotencyKey: options.idempotencyKey,
        signal: options.signal,
      })
      .then((response) => response.data);
  }

  /** Cari berdasarkan `trx_id` atau `reference_id`. */
  get(orderId: string, options: RequestOptions = {}): Promise<Transaction> {
    return this.client
      .request<Transaction>('GET', `/check-status/${encodeURIComponent(orderId)}`, {
        signal: options.signal,
      })
      .then((response) => response.data);
  }

  async list(
    params: ListTransactionsParams = {},
    options: RequestOptions = {},
  ): Promise<TransactionList> {
    const response = await this.client.request<Transaction[]>('GET', '/transactions', {
      query: params as Record<string, unknown>,
      signal: options.signal,
    });
    const pagination = (response.body as { pagination: Pagination }).pagination;

    return { data: response.data, pagination };
  }

  async cancel(trxId: string, options: RequestOptions = {}): Promise<CancelResult> {
    const response = await this.client.request<Omit<CancelResult, 'message'>>(
      'POST',
      '/transaction/cancel',
      { body: { trx_id: trxId }, signal: options.signal },
    );
    const message = extractMessage(response.body, '');

    return message ? { ...response.data, message } : response.data;
  }

  async refund(
    trxId: string,
    refundAmount: number,
    reason?: string,
    options: RequestOptions = {},
  ): Promise<RefundResult> {
    const response = await this.client.request<Omit<RefundResult, 'message'>>(
      'POST',
      '/transaction/refund',
      {
        body: { trx_id: trxId, refund_amount: refundAmount, reason },
        signal: options.signal,
      },
    );
    const message = extractMessage(response.body, '');

    return message ? { ...response.data, message } : response.data;
  }
}

class PaymentChannelsResource {
  constructor(private readonly client: Paymenku) {}

  list(options: RequestOptions = {}): Promise<PaymentChannel[]> {
    return this.client
      .request<PaymentChannel[]>('GET', '/payment-channels', { signal: options.signal })
      .then((response) => response.data);
  }
}

class FeesResource {
  constructor(private readonly client: Paymenku) {}

  calculate(amount: number, code?: string, options: RequestOptions = {}): Promise<FeeEstimate[]> {
    return this.client
      .request<FeeEstimate[]>('GET', '/merchant/fee-calculator', {
        query: { amount, code },
        signal: options.signal,
      })
      .then((response) => response.data);
  }
}

class PaymentInstructionsResource {
  constructor(private readonly client: Paymenku) {}

  get(
    code: string,
    options: PaymentInstructionOptions & RequestOptions = {},
  ): Promise<PaymentInstruction[]> {
    return this.client
      .request<PaymentInstruction[]>('GET', '/payment/instruction', {
        query: {
          code,
          pay_code: options.pay_code,
          amount: options.amount,
          allow_html:
            options.allow_html === undefined ? undefined : options.allow_html ? '1' : '0',
        },
        signal: options.signal,
      })
      .then((response) => response.data);
  }
}

class PaymentLinksResource {
  constructor(private readonly client: Paymenku) {}

  create(input: CreatePaymentLinkInput, options: RequestOptions = {}): Promise<PaymentLink> {
    return this.client
      .request<PaymentLink>('POST', '/payment-link/create', {
        body: input,
        idempotencyKey: options.idempotencyKey,
        signal: options.signal,
      })
      .then((response) => response.data);
  }

  get(linkId: string, options: RequestOptions = {}): Promise<PaymentLinkDetail> {
    return this.client
      .request<PaymentLinkDetail>('GET', `/payment-link/${encodeURIComponent(linkId)}`, {
        signal: options.signal,
      })
      .then((response) => response.data);
  }
}

class WalletResource {
  constructor(private readonly client: Paymenku) {}

  balance(options: RequestOptions = {}): Promise<WalletBalance> {
    return this.client
      .request<WalletBalance>('GET', '/wallet/balance', { signal: options.signal })
      .then((response) => response.data);
  }

  pendingBalance(options: RequestOptions = {}): Promise<PendingBalance> {
    return this.client
      .request<PendingBalance>('GET', '/wallet/balance/pending', { signal: options.signal })
      .then((response) => response.data);
  }
}

class WebhooksResource {
  /** Verifikasi tanda tangan webhook Paymenku. */
  verify(input: VerifyWebhookInput): boolean {
    return verifyWebhookSignature(input);
  }
}
