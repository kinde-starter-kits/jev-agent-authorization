import {LoginLink} from '@kinde-oss/kinde-auth-nextjs/components';
import {getKindeServerSession} from '@kinde-oss/kinde-auth-nextjs/server';
import type {Metadata} from 'next';
import {ConvexWithKinde} from '@/components/convex-provider';
import {PageIntro} from '@/components/page-intro';
import {Playground} from './playground';

export const metadata: Metadata = {title: 'Attack playground · Jev Gatehouse'};

export default async function PlaygroundPage() {
  const {isAuthenticated} = getKindeServerSession();
  const signedIn = await isAuthenticated();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10">
      <PageIntro eyebrow="Attack playground" title="Try to trick the agent">
        <p>
          Each scenario plays the tool calls an agent makes after a planted
          instruction fools it. The calls go through Kinde MCP with your token,
          so the real guard decides. No model runs, so the result does not
          depend on how careful the model is.
        </p>
      </PageIntro>
      {signedIn ? (
        <ConvexWithKinde>
          <Playground />
        </ConvexWithKinde>
      ) : (
        <LoginLink
          postLoginRedirectURL="/playground"
          className="w-fit rounded-md bg-ink px-4 py-2 font-medium text-paper"
        >
          Sign in to run scenarios
        </LoginLink>
      )}
    </main>
  );
}
