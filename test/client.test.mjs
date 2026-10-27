import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import http from 'node:http';
import { createHmac } from 'node:crypto';

import { Paymenku, PaymenkuApiError, verifyWebhookSignature } from '../dist/esm/index.js';

let server;
let baseUrl;
/** @type {{method: string, path: string, headers: http.IncomingHttpHeaders, body: any}[]} */
const requests = [];

function json(status, payload) {
  return { status, payload };
}

const routes = {
  'POST /transaction/create': (body) =>
    json(200, {
      status: 'success',
      data: {
        trx_id: 'IDP202610271005522956',
        reference_id: body.reference_id,
        amount: '15305.00',
        status: 'pending',
        pay_url: 'https://paymenku.com/pay/IDP202610271005522956',
        payment_info: {
          transaction_id: 'provider-ref',
          transaction_status: 'pending',
          qr_url: 'https://paymenku.com/api/qris/IDP202610271005522956',
          qr_string: '00020101',
          expiration_date: '2026-10-27T10:20:40+07:00',
        },
      },
    }),
  'GET /check-status/INV-20261027-001': () =>
    json(200, {
      status: 'success',
      data: {
        trx_id: 'IDP1',
        reference_id: 'INV-20261027-001',
        amount: '15305.00',
        total_fee: '305.00',
        amount_received: '15000.00',
        status: 'pending',
        is_sandbox: false,
        customer_name: 'Budi',
        customer_email: 'budi@example.com',
        customer_phone: null,
        order_items: null,
        payment_channel: { code: 'qris', name: 'QRIS', type: 'qris' },
        pay_url: 'https://paymenku.com/pay/IDP1',
        paid_at: null,
        created_at: '2026-10-27T09:12:04+07:00',
        updated_at: '2026-10-27T09:12:05+07:00',
      },
    }),
  'GET /transactions': () =>
    json(200, {
      status: 'success',
      data: [],
      pagination: { current_page: 2, per_page: 5, total: 12, total_pages: 3, has_more: true },
    }),
  'POST /transaction/cancel': (body) =>
    json(200, {
      status: 'success',
      message: 'Transaction cancelled successfully',
      data: { trx_id: body.trx_id, status: 'cancelled' },
    }),
  'POST /transaction/refund': (body) =>
    json(200, {
      status: 'success',
      message: 'Transaction refunded successfully',
      data: {
        trx_id: body.trx_id,
        status: 'refunded',
        refund_amount: body.refund_amount,
        merchant_refund_no: 'REF1',
      },
    }),
  'GET /payment-channels': () =>
    json(200, {
      status: 'success',
      data: [
        {
          code: 'qris',
          name: 'QRIS',
          type: 'qris',
          group: 'QRIS',
          flow_type: 'direct',
          icon: null,
          fee_mode: 'customer',
          fee_flat: 200,
          fee_percent: 0.7,
          min_amount: 1000,
          max_amount: 10000000,
        },
      ],
    }),
  'GET /merchant/fee-calculator': () =>
    json(200, {
      success: true,
      data: [
        {
          code: 'qris',
          name: 'QRIS',
          group: 'QRIS',
          type: 'qris',
          flow: 'direct',
          fee: { flat: 200, percent: 0.7 },
          total_fee: { merchant: 0, customer: 900 },
          fee_mode: 'customer',
          limits: {
            min_amount: 1000,
            max_amount: 10000000,
            min_expiry_minutes: 1440,
            max_expiry_minutes: 1440,
          },
        },
      ],
    }),
  'GET /payment/instruction': () =>
    json(200, {
      success: true,
      message: '',
      data: [{ title: 'ATM BCA', steps: ['Masukkan kartu'] }],
    }),
  'POST /payment-link/create': (body) =>
    json(201, {
      status: 'success',
      message: 'Payment link berhasil dibuat',
      data: {
        link_id: 'PL1',
        payment_url: 'https://paymenku.com/link/PL1',
        title: body.title ?? 'Pembayaran',
        description: null,
        amount: body.amount,
        items: null,
        status: 'active',
        is_single_use: true,
        expires_at: '2026-10-28T09:00:00+07:00',
        expires_in_minutes: 1440,
        customer_name: body.customer_name,
        customer_email: body.customer_email,
        return_url: null,
        created_at: '2026-10-27T09:00:00+07:00',
      },
    }),
  'GET /payment-link/PL1': () =>
    json(200, {
      status: 'success',
      data: {
        link_id: 'PL1',
        payment_url: 'https://paymenku.com/link/PL1',
        title: 'Invoice',
        description: null,
        amount: 150000,
        items: null,
        status: 'active',
        is_single_use: true,
        expires_at: '2026-10-28T09:00:00+07:00',
        expires_in_minutes: 1440,
        customer_name: 'Budi',
        customer_email: 'budi@example.com',
        return_url: null,
        created_at: '2026-10-27T09:00:00+07:00',
        tersedia: true,
        transaksi: null,
      },
    }),
  'GET /wallet/balance': () =>
    json(200, {
      success: true,
      data: { balance: '36793.00', currency: 'IDR', formatted: 'Rp 36.793' },
    }),
  'GET /wallet/balance/pending': () =>
    json(200, {
      success: true,
      data: {
        pending_balance: '0.00',
        currency: 'IDR',
        formatted: 'Rp 0',
        clearing_days: 2,
        note: 'Funds will be available after 2 business days',
      },
    }),
};

before(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : undefined;
      const url = new URL(req.url, 'http://localhost');
      requests.push({ method: req.method, path: url.pathname + url.search, headers: req.headers, body });

      if (url.pathname === '/api/v1/transaction/create' && body?.amount === 1) {
        res.writeHead(422, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'error',
            message: 'Validation failed',
            errors: { amount: ['validation.min'] },
          }),
        );
        return;
      }

      if (url.pathname === '/api/v1/flag') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Wallet not found' }));
        return;
      }

      const key = `${req.method} ${url.pathname.replace('/api/v1', '')}`;
      const handler = routes[key];
      if (!handler) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: 'not found' }));
        return;
      }

      const result = handler(body);
      res.writeHead(result.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result.payload));
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}/api/v1`;
});

after(() => {
  server.close();
});

function client() {
  return new Paymenku('sk_test_example', { baseUrl });
}

test('create mengirim body, header, dan mengembalikan data', async () => {
  const api = client();
  const result = await api.transactions.create(
    {
      channel_code: 'qris',
      amount: 15000,
      reference_id: 'INV-20261027-001',
      customer_name: 'Budi Santoso',
      customer_email: 'budi@example.com',
      return_url: 'https://tokoanda.com/selesai',
      order_items: [{ name: 'Paket', quantity: 1 }],
    },
    { idempotencyKey: 'INV-20261027-001' },
  );

  const sent = requests.at(-1);
  assert.equal(sent.method, 'POST');
  assert.equal(sent.path, '/api/v1/transaction/create');
  assert.equal(sent.headers.authorization, 'Bearer sk_test_example');
  assert.equal(sent.headers['content-type'], 'application/json');
  assert.equal(sent.headers['idempotency-key'], 'INV-20261027-001');
  assert.equal(sent.body.amount, 15000);
  assert.equal(sent.body.order_items[0].name, 'Paket');

  assert.equal(result.trx_id, 'IDP202610271005522956');
  assert.equal(result.amount, '15305.00');
  assert.equal(result.payment_info.transaction_id, 'provider-ref');
});

test('galat 422 menjadi PaymenkuApiError dengan errors per field', async () => {
  const api = client();
  await assert.rejects(
    () =>
      api.transactions.create({
        channel_code: 'qris',
        amount: 1,
        reference_id: 'INV-1',
        customer_name: 'Budi',
        customer_email: 'budi@example.com',
        return_url: 'https://tokoanda.com/selesai',
      }),
    (error) => {
      assert.ok(error instanceof PaymenkuApiError);
      assert.equal(error.status, 422);
      assert.equal(error.message, 'Validation failed');
      assert.deepEqual(error.errors, { amount: ['validation.min'] });
      return true;
    },
  );
});

test('envelope success:false pada HTTP 200 tetap dianggap galat', async () => {
  const api = client();
  await assert.rejects(
    () => api.request('GET', '/flag'),
    (error) => error instanceof PaymenkuApiError && error.status === 200,
  );
});

test('check-status meng-encode order id dan mengembalikan transaksi', async () => {
  const api = client();
  const trx = await api.transactions.get('INV-20261027-001');

  assert.equal(trx.status, 'pending');
  assert.equal(trx.amount_received, '15000.00');
  assert.equal(requests.at(-1).path, '/api/v1/check-status/INV-20261027-001');
});

test('list mengirim query boolean dan mengembalikan pagination', async () => {
  const api = client();
  const result = await api.transactions.list({
    status: 'paid',
    per_page: 5,
    page: 2,
    is_sandbox: true,
  });

  const sent = requests.at(-1);
  assert.match(sent.path, /status=paid/);
  assert.match(sent.path, /per_page=5/);
  assert.match(sent.path, /is_sandbox=true/);
  assert.deepEqual(result.pagination, {
    current_page: 2,
    per_page: 5,
    total: 12,
    total_pages: 3,
    has_more: true,
  });
});

test('cancel dan refund mengembalikan data beserta message', async () => {
  const api = client();
  const cancelled = await api.transactions.cancel('IDP1');
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.message, 'Transaction cancelled successfully');

  const refunded = await api.transactions.refund('IDP1', 25950, 'Pesanan dibatalkan');
  assert.equal(refunded.status, 'refunded');
  assert.equal(refunded.refund_amount, 25950);
  assert.equal(requests.at(-1).body.reason, 'Pesanan dibatalkan');
});

test('kanal, fee, dan instruksi memakai parameter yang benar', async () => {
  const api = client();
  const channels = await api.paymentChannels.list();
  assert.equal(channels[0].max_amount, 10000000);

  await api.fees.calculate(100000, 'qris');
  assert.match(requests.at(-1).path, /amount=100000/);
  assert.match(requests.at(-1).path, /code=qris/);

  await api.paymentInstructions.get('bca_va', { pay_code: '123', amount: 100000, allow_html: false });
  const sent = requests.at(-1).path;
  assert.match(sent, /code=bca_va/);
  assert.match(sent, /pay_code=123/);
  assert.match(sent, /allow_html=0/);
});

test('payment link dan wallet', async () => {
  const api = client();
  const link = await api.paymentLinks.create({
    amount: 150000,
    title: 'Invoice #1024',
    customer_name: 'Budi',
    customer_email: 'budi@example.com',
  });
  assert.equal(link.link_id, 'PL1');

  const detail = await api.paymentLinks.get('PL1');
  assert.equal(detail.tersedia, true);

  const balance = await api.wallet.balance();
  assert.equal(balance.balance, '36793.00');

  const pending = await api.wallet.pendingBalance();
  assert.equal(pending.clearing_days, 2);
});

test('verifikasi tanda tangan webhook', () => {
  const rawBody = JSON.stringify({ event: 'payment.status_updated', status: 'paid' });
  const timestamp = '1793067181';
  const secret = 'whsec_contoh';
  const signature = '8d0e4b1d4f0f6a5d3c2b1a0f9e8d7c6b5a4938271605f4e3d2c1b0a9f8e7d6c5';
  const valid = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');

  assert.equal(verifyWebhookSignature({ rawBody, timestamp, secret, signature: valid }), true);
  assert.equal(verifyWebhookSignature({ rawBody, timestamp, secret, signature: valid + '0' }), false);
  assert.equal(verifyWebhookSignature({ rawBody, timestamp, secret, signature }), false);
});
