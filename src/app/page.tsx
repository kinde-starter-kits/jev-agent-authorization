import {LoginLink, LogoutLink} from '@kinde-oss/kinde-auth-nextjs/components';
import {getKindeServerSession} from '@kinde-oss/kinde-auth-nextjs/server';

export default async function Home() {
  const {isAuthenticated, getUser} = getKindeServerSession();
  const signedIn = await isAuthenticated();
  const user = signedIn ? await getUser() : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-4">
      <h1 className="text-4xl font-semibold tracking-tight">Jev Gatehouse</h1>
      <p className="text-lg">
        Kinde checks who the agent acts for and what that user can do. Jev
        judges each tool call before it runs.
      </p>
      {user ? (
        <p>
          Signed in as {user.email}.{' '}
          <LogoutLink className="underline">Sign out</LogoutLink>
        </p>
      ) : (
        <LoginLink className="w-fit rounded-md bg-black px-4 py-2 text-white">
          Sign in
        </LoginLink>
      )}
    </main>
  );
}
