import { NextRequest, NextResponse } from 'next/server';
import { dodo } from '@/lib/dodo';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Convert Headers object to plain record for SDK verification
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let payload: ReturnType<typeof dodo.webhooks.unwrap>;
  try {
    payload = dodo.webhooks.unwrap(rawBody, { headers });
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const { type, data } = payload as {
    type: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: Record<string, any>;
  };

  try {
    if (type === 'subscription.active') {
      // Initial mapping: metadata carries user_id set during checkout session creation
      const userId = data?.metadata?.user_id as string | undefined;
      const dodoCustomerId = data?.customer?.customer_id as string | undefined;

      if (userId && dodoCustomerId) {
        await prisma.user.update({
          where: { id: userId },
          data: { dodo_customer_id: dodoCustomerId, balance_low: false },
        });
      }
    } else if (type === 'credit.added') {
      // Credits refilled — clear any low-balance warning
      const dodoCustomerId = data?.customer_id as string | undefined;

      if (dodoCustomerId) {
        await prisma.user.updateMany({
          where: { dodo_customer_id: dodoCustomerId },
          data: { balance_low: false },
        });
      }
    } else if (type === 'credit.balance_low') {
      const dodoCustomerId = data?.customer_id as string | undefined;

      if (dodoCustomerId) {
        await prisma.user.updateMany({
          where: { dodo_customer_id: dodoCustomerId },
          data: { balance_low: true },
        });
      }
    } else if (type === 'credit.overage_charged') {
      console.log('[dodo] overage_charged', JSON.stringify(data));
    }
  } catch (err) {
    console.error('[dodo] webhook handler error', err);
    // Return 200 so Dodo does not retry on our DB errors
  }

  return NextResponse.json({ received: true });
}
