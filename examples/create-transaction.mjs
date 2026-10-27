import { Paymenku } from '@paymenku/sdk-nodejs';

const paymenku = new Paymenku(process.env.PAYMENKU_API_KEY ?? 'sk_test_xxx');

const transaksi = await paymenku.transactions.create(
  {
    channel_code: 'qris',
    amount: 15000,
    reference_id: `INV-${Date.now()}`,
    customer_name: 'Budi Santoso',
    customer_email: 'budi@example.com',
    return_url: 'https://tokoanda.com/selesai',
  },
  { idempotencyKey: `INV-${Date.now()}` },
);

console.log(transaksi);
