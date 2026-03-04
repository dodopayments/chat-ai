import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { dodo } from '@/lib/dodo';

const fireworks = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY,
  baseURL: 'https://api.fireworks.ai/inference/v1',
});

export async function POST(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const session = await verifyToken(token);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user?.dodo_customer_id) {
    return NextResponse.json({ error: 'subscription_required' }, { status: 402 });
  }

  const { messages, model } = await request.json();

  if (!messages || !model) {
    return NextResponse.json({ error: 'messages and model are required' }, { status: 400 });
  }

  console.log('[chat] using model:', model);

  const stream = await fireworks.chat.completions.create({
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  });

  const dodoCustomerId = user.dodo_customer_id;
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let totalTokens = 0;
      try {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            controller.enqueue(encoder.encode(content));
          }
          if (chunk.usage?.total_tokens) {
            totalTokens = chunk.usage.total_tokens;
          }
        }
      } finally {
        controller.close();
        if (totalTokens > 0) {
          const entitlementId = process.env.DODO_CREDIT_ENTITLEMENT_ID!;
          dodo.creditEntitlements.balances
            .createLedgerEntry(dodoCustomerId, {
              credit_entitlement_id: entitlementId,
              entry_type: 'debit',
              amount: String(totalTokens),
              reason: `chat message — model: ${model}`,
              idempotency_key: `chat_${session.userId}_${Date.now()}`,
            })
            .then((r) => console.log('[dodo] deducted', totalTokens, 'tokens, balance after:', r.balance_after))
            .catch((e) => console.error('[dodo] deduct failed', e));
        }
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
