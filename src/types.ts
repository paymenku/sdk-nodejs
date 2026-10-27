export type TransactionStatus =
  | 'pending'
  | 'paid'
  | 'expired'
  | 'failed'
  | 'cancelled'
  | 'refunded';

export type FeeMode = 'merchant' | 'customer' | 'split';
export type FlowType = 'direct' | 'redirect';
export type ChannelType = 'va' | 'qris' | 'ewallet' | 'cstore';

export interface OrderItem {
  name: string;
  quantity?: number;
}

export interface CreateTransactionInput {
  channel_code: string;
  /** Nominal dasar dalam rupiah. */
  amount: number;
  reference_id: string;
  customer_name: string;
  customer_email: string;
  /** Wajib untuk OVO. */
  customer_phone?: string;
  return_url: string;
  order_items?: OrderItem[];
}

/**
 * Bentuknya bergantung kanal. `transaction_id` tidak selalu ada
 * (QRIS Custom tidak mengembalikannya).
 */
export interface PaymentInfo {
  transaction_id?: string | null;
  transaction_status?: string | null;
  va_number?: string | null;
  bank?: string | null;
  payment_code?: string | null;
  store?: string | null;
  checkout_url?: string | null;
  checkout_url_app?: string | null;
  payment_actions?: unknown[] | null;
  qr_url?: string | null;
  qr_string?: string | null;
  merchant_name?: string | null;
  expiration_date?: string | null;
  sandbox?: boolean | null;
  simulator_url?: string | null;
  [key: string]: unknown;
}

export interface CreatedTransaction {
  trx_id: string;
  reference_id: string;
  /** String desimal, mis. "15305.00". */
  amount: string;
  status: 'pending';
  pay_url: string;
  payment_info: PaymentInfo;
  sandbox_mode?: boolean | null;
  sandbox_notice?: string | null;
}

export interface PaymentChannelSummary {
  code: string;
  name: string;
  type: ChannelType;
}

export interface Transaction {
  trx_id: string;
  reference_id: string;
  amount: string;
  total_fee: string;
  amount_received: string;
  status: TransactionStatus;
  is_sandbox: boolean;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  order_items: OrderItem[] | null;
  payment_channel: PaymentChannelSummary | null;
  pay_url: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Pagination {
  current_page: number;
  per_page: number;
  total: number;
  total_pages: number;
  has_more: boolean;
}

export interface ListTransactionsParams {
  page?: number;
  per_page?: number;
  status?: TransactionStatus;
  channel_code?: string;
  reference_id?: string;
  date_from?: string;
  date_to?: string;
  is_sandbox?: boolean;
  sort_by?: 'created_at' | 'amount' | 'status' | 'paid_at';
  sort_order?: 'asc' | 'desc';
}

export interface TransactionList {
  data: Transaction[];
  pagination: Pagination;
}

export interface PaymentChannel {
  code: string;
  name: string;
  type: ChannelType;
  group: string | null;
  flow_type: FlowType;
  icon: string | null;
  fee_mode: FeeMode;
  fee_flat: number;
  fee_percent: number;
  min_amount: number | null;
  max_amount: number | null;
}

export interface FeeEstimate {
  code: string;
  name: string;
  group: string | null;
  type: ChannelType;
  flow: FlowType;
  fee: { flat: number; percent: number };
  total_fee: { merchant: number; customer: number };
  fee_mode: FeeMode;
  limits: {
    min_amount: number;
    max_amount: number | null;
    min_expiry_minutes: number;
    max_expiry_minutes: number;
  };
}

export interface PaymentInstruction {
  title: string;
  /** Langkah berisi tag HTML sederhana kecuali allow_html=false. */
  steps: string[];
}

export interface PaymentInstructionOptions {
  pay_code?: string;
  amount?: number;
  allow_html?: boolean;
}

export interface CreatePaymentLinkInput {
  amount: number;
  title?: string;
  description?: string;
  customer_name: string;
  customer_email: string;
  return_url?: string;
  /** 5 menit – 30 hari, bawaan 1440 menit. */
  expires_in_minutes?: number;
  /** Bawaan true. */
  is_single_use?: boolean;
  order_items?: OrderItem[];
}

export interface PaymentLink {
  link_id: string;
  payment_url: string;
  title: string;
  description: string | null;
  amount: number;
  items: OrderItem[] | null;
  status: string;
  is_single_use: boolean;
  expires_at: string;
  expires_in_minutes: number | null;
  customer_name: string;
  customer_email: string;
  return_url: string | null;
  created_at: string;
}

export interface PaymentLinkDetail extends PaymentLink {
  tersedia: boolean;
  transaksi: {
    trx_id: string;
    status: TransactionStatus;
    paid_at: string | null;
  } | null;
}

export interface WalletBalance {
  balance: string;
  currency: string;
  formatted: string;
}

export interface PendingBalance {
  pending_balance: string;
  currency: string;
  formatted: string;
  clearing_days: number;
  note: string;
}

export interface CancelResult {
  trx_id: string;
  status: 'cancelled';
  message?: string;
}

export interface RefundResult {
  trx_id: string;
  status: 'refunded';
  refund_amount: number;
  merchant_refund_no?: string;
  message?: string;
}

export interface RequestOptions {
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface RawResponse<T = unknown> {
  status: number;
  headers: Headers;
  data: T;
  body: unknown;
}
