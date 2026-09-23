import {LoginLink} from '@kinde-oss/kinde-auth-nextjs/components';
import {getKindeServerSession} from '@kinde-oss/kinde-auth-nextjs/server';
import type {Metadata} from 'next';
import {ConvexWithKinde} from '@/components/convex-provider';
import {PageIntro} from '@/components/page-intro';
import {Console} from './console';

export const metadata: Metadata = {title: 'Agent console · Jev Gatehouse'};

export default async function ConsolePage() {
  const {isAuthenticated} = getKindeServerSession();
  const signedIn = await isAuthenticated();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <PageIntro eyebrow="Agent console" title="Ask the agent">
        <p>
          The agent calls the workspace through Kinde MCP with your token. Kinde
          checks the call, Jev judges it, and the guard decides before anything
          runs.
        </p>
      </PageIntro>
      {signedIn ? (
        <ConvexWithKinde>
          <Console />
        </ConvexWithKinde>
      ) : (
        <LoginLink
          postLoginRedirectURL="/console"
          className="w-fit rounded-md bg-ink px-4 py-2 font-medium text-paper"
        >
          Sign in to use the agent
        </LoginLink>
      )}
    </main>
  );
}
