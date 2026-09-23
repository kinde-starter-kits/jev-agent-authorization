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
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-accent">{eyebrow}</p>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <div className="text-muted">{children}</div>
    </div>
  );
}
