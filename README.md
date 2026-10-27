# @paymenku/sdk-nodejs

SDK Node.js untuk [API Paymenku](https://paymenku.com). Tanpa dependensi runtime,
mendukung Node.js 18+ (fetch bawaan), ESM dan CommonJS.

## Instalasi

```bash
npm install @paymenku/sdk-nodejs
```

## Mulai cepat

```js
import { Paymenku } from '@paymenku/sdk-nodejs';

const paymenku = new Paymenku(process.env.PAYMENKU_API_KEY);

const transaksi = await paymenku.transactions.create({
  channel_code: 'qris',
  amount: 15000,
  reference_id: 'INV-20261027-001',
  customer_name: 'Budi Santoso',
  customer_email: 'budi@example.com',
  return_url: 'https://tokoanda.com/selesai',
});

console.log(transaksi.trx_id, transaksi.pay_url);
console.log(transaksi.payment_info.qr_url);
```

Kunci `sk_test_...` membuat transaksi sandbox; `sk_live_...` memakai dana nyata
dan memerlukan KYC yang disetujui.

## Transaksi

```js
// Cek status berdasarkan trx_id atau reference_id
const trx = await paymenku.transactions.get('INV-20261027-001');

// Daftar transaksi
const { data, pagination } = await paymenku.transactions.list({
  status: 'paid',
  per_page: 50,
  date_from: '2026-10-01',
  is_sandbox: false,
});

// Batalkan transaksi pending
await paymenku.transactions.cancel(trx.trx_id);

// Refund transaksi paid
await paymenku.transactions.refund(trx.trx_id, 25950, 'Pesanan dibatalkan');
```

## Kanal, fee, dan instruksi

```js
const channels = await paymenku.paymentChannels.list();

const fee = await paymenku.fees.calculate(100000, 'qris');

const langkah = await paymenku.paymentInstructions.get('bca_va', {
  pay_code: '1234567890',
  amount: 100000,
  allow_html: false,
});
```

## Payment link

```js
const link = await paymenku.paymentLinks.create({
  amount: 150000,
  title: 'Invoice #1024',
  customer_name: 'Budi Santoso',
  customer_email: 'budi@example.com',
  expires_in_minutes: 1440,
  is_single_use: true,
});

const detail = await paymenku.paymentLinks.get(link.link_id);
```

Payment link hanya menerima kunci live (`sk_live_`).

## Wallet

```js
const saldo = await paymenku.wallet.balance();
const kliring = await paymenku.wallet.pendingBalance();
```

## Idempotensi

```js
await paymenku.transactions.create(input, {
  idempotencyKey: 'INV-20261027-001',
});
```

Kunci yang sama dalam 24 jam akan memutar ulang respons tersimpan, bukan
membuat transaksi baru. Gunakan nilai yang stabil untuk satu maksud pembayaran.

## Galat

```js
import { PaymenkuApiError, PaymenkuNetworkError } from '@paymenku/sdk-nodejs';

try {
  await paymenku.transactions.create(input);
} catch (error) {
  if (error instanceof PaymenkuApiError) {
    console.error(error.status);   // 422
    console.error(error.message);  // Validation failed
    console.error(error.errors);   // { amount: ['validation.min'] }
    console.error(error.errorCode);
  } else if (error instanceof PaymenkuNetworkError) {
    console.error('Jaringan/timeout:', error.message);
  }
}
```

- `PaymenkuApiError` dilempar untuk HTTP 4xx/5xx **dan** envelope
  `status: "error"` / `success: false` meskipun HTTP 200.
- `PaymenkuNetworkError` untuk timeout, koneksi gagal, atau respons bukan JSON.

SDK tidak melakukan percobaan ulang otomatis. Untuk `429`, hormati header
`Retry-After`; untuk `5xx`, ulangi dengan backoff dan `Idempotency-Key`.

## Webhook

Verifikasi header `X-PaymenKu-Signature` dengan body **mentah**:

```js
import { verifyWebhookSignature } from '@paymenku/sdk-nodejs';

app.post('/webhook/paymenku', express.raw({ type: 'application/json' }), (req, res) => {
  const valid = verifyWebhookSignature({
    rawBody: req.body,
    timestamp: req.get('X-PaymenKu-Timestamp'),
    signature: req.get('X-PaymenKu-Signature'),
    secret: process.env.PAYMENKU_WEBHOOK_SECRET,
  });

  if (!valid) return res.status(401).end();
  res.status(200).end();

  const payload = JSON.parse(req.body.toString());
  // idempoten per trx_id; hanya status "paid" yang memenuhi pesanan
});
```

Jangan parse JSON lalu serialisasi ulang sebelum verifikasi — urutan kunci dan
spasi akan berubah dan tanda tangan tidak cocok.

## Konfigurasi

```js
const paymenku = new Paymenku(apiKey, {
  baseUrl: 'https://paymenku.com/api/v1', // bawaan
  timeoutMs: 30000,                       // bawaan
  fetch: globalThis.fetch,                // opsional
});
```

## Catatan

- Nominal pada respons berupa **string desimal** (`"15305.00"`). Jangan
  menghitung dengan float.
- `payment_info` berbeda per kanal; `transaction_id` tidak selalu ada.
- Status resmi datang dari webhook, bukan polling.
- Setiap response menyertakan header `X-RateLimit-*`; akses lewat
  `client.request()` bila perlu membaca headers mentah.

## Pengembangan

```bash
npm install
npm test        # build + 9 pengujian dengan server mock
npm run build   # dist/esm dan dist/cjs
```

Lisensi MIT.
