import {LoginLink} from '@kinde-oss/kinde-auth-nextjs/components';
import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import {
  heldRequest,
  isFreshFor,
  MAX_AUTH_AGE_SECONDS,
  signInState,
  type HeldCall
} from '@/lib/held';
import {approveHeld, denyHeld} from './actions';

export const metadata: Metadata = {
  title: 'Approve a held call · Jev Gatehouse'
};

const ERROR_TEXT: Record<string, string> = {
  auth_stale: `Your sign-in is older than ${MAX_AUTH_AGE_SECONDS} seconds. Sign in again, then approve.`,
  auth_before_hold:
    'You signed in before the agent made this call. Sign in again, then approve.',
  held_expired: 'This call expired. The agent must ask again.',
  held_not_pending: 'This call is already closed.',
  operation_failed: 'The call ran, but the workspace refused it.'
};

const STATUS_TEXT: Record<HeldCall['status'], string> = {
  pending: 'Waiting for you',
  executed: 'Approved and run',
  failed: 'Approved, but the call failed',
  denied: 'Denied',
  expired: 'Expired'
};

function Shell({children}: {children: ReactNode}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 px-4 py-12">
      <p className="text-sm font-medium tracking-wide text-neutral-500 uppercase">
        Jev Gatehouse
      </p>
      {children}
    </main>
  );
}

function FreshSignIn({id, message}: {id: string; message: string}) {
  return (
    <Shell>
      <h1 className="text-3xl font-semibold tracking-tight">
        Confirm it is you
      </h1>
      <p className="text-neutral-600">{message}</p>
      <LoginLink
        postLoginRedirectURL={`/approve/${id}`}
        authUrlParams={{prompt: 'login', max_age: '0'}}
        className="w-fit rounded-md bg-neutral-900 px-4 py-2 font-medium text-white"
      >
        Sign in again
      </LoginLink>
    </Shell>
  );
}

function Percent({label, value}: {label: string; value: number}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-neutral-600">{label}</span>
      <span className="font-mono">{Math.round(value * 100)}%</span>
    </div>
  );
}

export default async function ApprovePage({
  params,
  searchParams
}: {
  params: Promise<{id: string}>;
  searchParams: Promise<{done?: string; error?: string}>;
}) {
  const {id} = await params;
  const {done, error} = await searchParams;
  const state = await signInState();

  if (!state.signedIn || !state.raw) {
    return (
      <FreshSignIn
        id={id}
        message="An agent wants to run a call that needs your approval. Sign in to review it."
      />
    );
  }

  const held = await heldRequest<HeldCall>(
    'GET',
    encodeURIComponent(id),
    state.raw
  );
  if (!held.ok) {
    return (
      <Shell>
        <h1 className="text-3xl font-semibold tracking-tight">
          Held call not found
        </h1>
        <p className="text-neutral-600">
          There is no held call with this link for your account.
        </p>
      </Shell>
    );
  }
  const call = held.data;
  const fresh = isFreshFor(state.authTime, call.createdAt);

  if (call.status === 'pending' && !fresh) {
    return (
      <FreshSignIn
        id={id}
        message={`To approve "${call.operation.summary}", sign in again now. Approval needs a sign-in from the last ${MAX_AUTH_AGE_SECONDS} seconds, made after the agent asked.`}
      />
    );
  }

  const args = Object.entries(call.args).filter(([key]) => key !== 'reason');

  return (
    <Shell>
      <div className="flex flex-col gap-2">
        <span className="w-fit rounded-full bg-neutral-100 px-3 py-1 text-sm">
          {STATUS_TEXT[call.status]}
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">
          {call.operation.summary}
        </h1>
        <p className="text-neutral-600">{call.operation.effect}</p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {ERROR_TEXT[error] ?? 'The request failed.'}
        </p>
      )}
      {done === 'approve' && call.status === 'executed' && (
        <p className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          The call ran exactly as held. You signed in {call.authAgeSeconds}{' '}
          seconds before you approved it.
        </p>
      )}

      <section className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4">
        <h2 className="text-sm font-medium text-neutral-500">What will run</h2>
        <dl className="flex flex-col gap-1 font-mono text-sm">
          {args.map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <dt className="text-neutral-500">{key}</dt>
              <dd className="break-all">
                {typeof value === 'string' ? value : JSON.stringify(value)}
              </dd>
            </div>
          ))}
        </dl>
        <h2 className="mt-2 text-sm font-medium text-neutral-500">
          Reason the agent gave
        </h2>
        <p className="text-sm">{call.reason ?? 'The agent gave no reason.'}</p>
      </section>

      {call.jev && (
        <section className="flex flex-col gap-1 rounded-lg border border-neutral-200 p-4">
          <h2 className="mb-1 text-sm font-medium text-neutral-500">
            What Jev saw ({call.jev.ms} ms)
          </h2>
          <Percent label="Matches the reason" value={call.jev.matchesIntent} />
          <Percent label="Destructive" value={call.jev.destructive} />
          <Percent
            label="Follows injected instructions"
            value={call.jev.injected}
          />
          <Percent label="Sends data out" value={call.jev.exfiltration} />
        </section>
      )}

      {call.status === 'pending' && (
        <div className="flex gap-3">
          <form action={approveHeld.bind(null, id)}>
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white"
            >
              Approve and run
            </button>
          </form>
          <form action={denyHeld.bind(null, id)}>
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-4 py-2 font-medium"
            >
              Deny
            </button>
          </form>
        </div>
      )}
    </Shell>
  );
}
