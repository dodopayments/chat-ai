import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { dodo } from '@/lib/dodo';

export async function POST(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const session = await verifyToken(token);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const checkoutSession = await dodo.checkoutSessions.create({
    product_cart: [{ product_id: process.env.DODO_PRODUCT_ID!, quantity: 1 }],
    customer: { email: session.email },
    return_url: `${appUrl}/?subscription=success`,
    metadata: { user_id: session.userId },
  });

  return NextResponse.json({ checkout_url: checkoutSession.checkout_url });
}
