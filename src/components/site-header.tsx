import {LoginLink, LogoutLink} from '@kinde-oss/kinde-auth-nextjs/components';
import {getKindeServerSession} from '@kinde-oss/kinde-auth-nextjs/server';
import Link from 'next/link';

const NAV = [
  {href: '/', label: 'Ledger'},
  {href: '/console', label: 'Console'},
  {href: '/playground', label: 'Playground'}
];

function GateMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-6 w-6 text-ink"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M4 21V9a8 8 0 0 1 16 0v12" />
      <path d="M9 21v-8a3 3 0 0 1 6 0v8" />
      <path d="M2 21h20" />
    </svg>
  );
}

export async function SiteHeader() {
  const {isAuthenticated} = getKindeServerSession();
  const signedIn = await isAuthenticated();

  return (
    <header className="border-b border-line bg-paper/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 whitespace-nowrap sm:gap-6">
        <Link
          href="/"
          aria-label="Jev Gatehouse home"
          className="flex items-center gap-2 font-semibold"
        >
          <GateMark />
          <span className="hidden sm:inline">Jev Gatehouse</span>
        </Link>
        <nav className="flex flex-1 items-center gap-3 text-sm text-muted sm:gap-4">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-ink">
              {item.label}
            </Link>
          ))}
        </nav>
        {signedIn ? (
          <LogoutLink className="text-sm text-muted hover:text-ink">
            Sign out
          </LogoutLink>
        ) : (
          <LoginLink className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper">
            Sign in
          </LoginLink>
        )}
      </div>
    </header>
  );
}
