import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chat AI',
  description: 'AI chat with DeepSeek, LLaMA, and Mixtral via Fireworks',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
