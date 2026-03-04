import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { dodo } from '@/lib/dodo';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const session = await verifyToken(token);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (!user.dodo_customer_id) {
    return NextResponse.json({ balance: 0, balance_low: false, subscribed: false });
  }

  try {
    const entitlementId = process.env.DODO_CREDIT_ENTITLEMENT_ID!;
    const balanceData = await dodo.creditEntitlements.balances.retrieve(
      user.dodo_customer_id,
      { credit_entitlement_id: entitlementId },
    );

    return NextResponse.json({
      balance: parseFloat(balanceData.balance),
      balance_low: user.balance_low,
      subscribed: true,
    });
  } catch {
    // Entitlement or customer not found — treat as zero balance
    return NextResponse.json({
      balance: 0,
      balance_low: user.balance_low,
      subscribed: true,
    });
  }
}
