import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import Chat from '@/components/Chat';

export default async function Home() {
  const session = await getSession();
  if (!session) redirect('/auth/signin');

  return <Chat userEmail={session.email} />;
}
