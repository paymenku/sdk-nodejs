import { createHmac, timingSafeEqual } from 'node:crypto';

export interface VerifyWebhookInput {
  /** Body mentah persis seperti diterima, sebelum di-parse JSON. */
  rawBody: string | Buffer;
  timestamp: string;
  signature: string;
  secret: string;
}

/**
 * Memverifikasi header `X-PaymenKu-Signature`.
 * Rumus: HMAC-SHA256(timestamp + "." + rawBody, secret) dalam hex.
 */
export function verifyWebhookSignature(input: VerifyWebhookInput): boolean {
  const { rawBody, timestamp, signature, secret } = input;
  if (!timestamp || !signature || !secret) return false;

  const payload = Buffer.concat([
    Buffer.from(`${timestamp}.`, 'utf8'),
    typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody,
  ]);

  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');

  return a.length === b.length && timingSafeEqual(a, b);
}
