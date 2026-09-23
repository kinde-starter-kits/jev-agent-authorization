import type {ReactNode} from 'react';

export function PageIntro({
  eyebrow,
  title,
  children
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-xs text-muted">{eyebrow}</p>
      <h1 className="font-display text-4xl leading-none font-extrabold tracking-tight text-balance sm:text-5xl">
        {title}
      </h1>
      <div className="max-w-2xl text-muted">{children}</div>
    </div>
  );
}
