'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const MODELS = [
  { id: 'accounts/fireworks/models/deepseek-v3p1', name: 'DeepSeek V3.1' },
  { id: 'accounts/fireworks/models/gpt-oss-20b', name: 'GPT-OSS 20B' },
  { id: 'accounts/fireworks/models/kimi-k2-thinking', name: 'Kimi K2 Thinking' },
  { id: 'accounts/fireworks/models/qwen3-vl-30b-a3b-instruct', name: 'Qwen3 VL 30B' },
];

const STORAGE_KEY = 'chat_messages';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface BalanceInfo {
  balance: number;
  balance_low: boolean;
  subscribed: boolean;
}

export default function Chat({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [isLoading, setIsLoading] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<BalanceInfo | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchBalance = () => {
    fetch('/api/billing/balance')
      .then((r) => r.json())
      .then(setBalanceInfo)
      .catch(() => {});
  };

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    fetchBalance();
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const isBlocked = balanceInfo !== null && (!balanceInfo.subscribed || balanceInfo.balance <= 0);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading || isBlocked) return;

    const userMessage: Message = { role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, model: selectedModel }),
      });

      if (response.status === 402) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'No active subscription. Visit /pricing to subscribe.' },
        ]);
        return;
      }

      if (!response.ok) {
        throw new Error('Request failed');
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let content = '';

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        content += decoder.decode(value, { stream: true });
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: 'assistant', content },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.' },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
      fetchBalance();
    }
  };

  const handleSignOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    router.push('/auth/signin');
  };

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const showTypingDot =
    isLoading && (messages.length === 0 || messages[messages.length - 1]?.role === 'user');

  const formattedBalance =
    balanceInfo !== null ? balanceInfo.balance.toLocaleString() : null;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <span className="font-semibold text-gray-900 mr-auto">Chat AI</span>

        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        <button
          onClick={clearHistory}
          className="text-sm text-gray-500 hover:text-gray-800 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          Clear
        </button>

        {/* Balance pill */}
        {balanceInfo !== null && (
          balanceInfo.subscribed ? (
            <span className="text-sm text-gray-400 hidden sm:block">
              {formattedBalance} credits
            </span>
          ) : (
            <Link
              href="/pricing"
              className="text-sm text-blue-600 hover:underline hidden sm:block"
            >
              0 credits — Subscribe
            </Link>
          )
        )}

        <span className="text-sm text-gray-400 hidden sm:block">{userEmail}</span>

        <button
          onClick={handleSignOut}
          className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          Sign out
        </button>
      </header>

      {/* Low balance warning banner */}
      {balanceInfo?.balance_low && balanceInfo.subscribed && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-sm text-amber-800 text-center shrink-0">
          Your token balance is running low.{' '}
          <Link href="/pricing" className="font-medium underline">
            Upgrade on the pricing page
          </Link>{' '}
          to continue chatting without interruption.
        </div>
      )}

      {/* Messages */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {messages.length === 0 && !isLoading && (
            <div className="text-center py-20 text-gray-400">
              <p className="text-base font-medium">Start a conversation</p>
              <p className="text-sm mt-1">Select a model above and type a message</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-800 border border-gray-200 shadow-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {showTypingDot && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 shadow-sm rounded-2xl px-4 py-3 flex gap-1 items-center">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input */}
      <footer className="bg-white border-t border-gray-200 px-4 py-4 shrink-0">
        <div className="max-w-2xl mx-auto">
          {isBlocked && (
            <div className="mb-3 text-center text-sm text-gray-500">
              No credits remaining.{' '}
              <Link href="/pricing" className="text-blue-600 hover:underline font-medium">
                Subscribe to continue
              </Link>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isBlocked ? 'Subscribe to send messages' : 'Type a message...'}
              disabled={isLoading || isBlocked}
              className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 bg-white"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim() || isBlocked}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
}
