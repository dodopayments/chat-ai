import DodoPayments from 'dodopayments';

const globalForDodo = globalThis as unknown as { dodo: DodoPayments };

export const dodo =
  globalForDodo.dodo ||
  new DodoPayments({
    bearerToken: process.env.DODO_API_KEY,
    webhookKey: process.env.DODO_WEBHOOK_SECRET,
    environment: 'test_mode',
  });

if (process.env.NODE_ENV !== 'production') globalForDodo.dodo = dodo;

export default dodo;
