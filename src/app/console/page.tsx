import {LoginLink} from '@kinde-oss/kinde-auth-nextjs/components';
import {getKindeServerSession} from '@kinde-oss/kinde-auth-nextjs/server';
import type {Metadata} from 'next';
import {Console} from './console';
import {ConvexWithKinde} from '@/components/convex-provider';

export const metadata: Metadata = {title: 'Agent console · Jev Gatehouse'};

export default async function ConsolePage() {
  const {isAuthenticated} = getKindeServerSession();
  const signedIn = await isAuthenticated();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium tracking-wide text-neutral-500 uppercase">
          Jev Gatehouse
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Agent console</h1>
        <p className="text-neutral-600">
          The agent calls the workspace through Kinde MCP with your token. Kinde
          checks the call, Jev judges it, and the guard decides before anything
          runs.
        </p>
      </div>
      {signedIn ? (
        <ConvexWithKinde>
          <Console />
        </ConvexWithKinde>
      ) : (
        <LoginLink
          postLoginRedirectURL="/console"
          className="w-fit rounded-md bg-neutral-900 px-4 py-2 font-medium text-white"
        >
          Sign in to use the agent
        </LoginLink>
      )}
    </main>
  );
}
