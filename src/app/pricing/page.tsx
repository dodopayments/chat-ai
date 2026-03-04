'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Pricing() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubscribe = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/billing/checkout', { method: 'POST' });

      if (res.status === 401) {
        router.push('/auth/signin');
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.checkout_url) {
        setError(data.error || 'Failed to start checkout');
        return;
      }

      window.location.href = data.checkout_url;
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
            Back to chat
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 mt-4">Simple pricing</h1>
          <p className="text-gray-500 mt-1 text-sm">Pay once, chat all month.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-6 border-b border-gray-100">
            <p className="text-sm font-medium text-blue-600 uppercase tracking-wide">Pro Plan</p>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-bold text-gray-900">$10</span>
              <span className="text-gray-500 text-sm">/ month</span>
            </div>
          </div>

          <div className="px-6 py-5 space-y-3">
            <Feature text="10,000 AI credits per month" />
            <Feature text="DeepSeek V3.1, GPT-OSS, Kimi K2, Qwen3" />
            <Feature text="Streaming responses" />
            <Feature text="Tokens auto-deducted per message" />
          </div>

          <div className="px-6 pb-6">
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <button
              onClick={handleSubscribe}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Redirecting...' : 'Subscribe'}
            </button>
            <p className="text-xs text-center text-gray-400 mt-3">
              Secure checkout via Dodo Payments
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-600">
      <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      {text}
    </div>
  );
}
