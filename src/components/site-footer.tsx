import Link from 'next/link';

const CREDITS = [
  {role: 'Identity and MCP', name: 'Kinde', href: 'https://kinde.com'},
  {
    role: 'Judgment',
    name: 'Jev by TypeSafe AI',
    href: 'https://typesafe.ai/blog/introducing-system-one-models-and-jev'
  },
  {role: 'Back end', name: 'Convex', href: 'https://convex.dev'}
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {CREDITS.map((credit) => (
            <li key={credit.name} className="flex gap-2">
              <span className="text-faint">{credit.role}</span>
              <a href={credit.href} className="font-medium hover:underline">
                {credit.name}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex gap-4 text-muted">
          <Link href="/connect" className="hover:text-ink">
            Connect your agent
          </Link>
          <a
            href="https://github.com/kinde-starter-kits/jev-agent-authorization"
            className="hover:text-ink"
          >
            Source on GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
