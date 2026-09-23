import type {Verdict} from '@/lib/labels';

const STAMP: Record<Verdict, {text: string; className: string}> = {
  allow: {text: 'Allowed', className: 'text-allow border-allow'},
  step_up: {text: 'Held', className: 'text-stepup border-stepup'},
  deny: {text: 'Denied', className: 'text-deny border-deny'}
};

/** The verdict as a passport-style stamp. */
export function Stamp({
  verdict,
  size = 'md',
  animate = false
}: {
  verdict: Verdict;
  size?: 'md' | 'lg';
  animate?: boolean;
}) {
  const {text, className} = STAMP[verdict];
  return (
    <span
      className={`stamp inline-flex items-center rounded-md border-2 font-display font-extrabold tracking-wider uppercase ${className} ${
        size === 'lg' ? 'px-3 py-1 text-2xl' : 'px-2 py-0.5 text-sm'
      } ${animate ? 'stamp-in' : ''}`}
      style={{
        boxShadow: 'inset 0 0 0 2px var(--card)',
        outline: '2px solid currentColor',
        outlineOffset: '1px'
      }}
    >
      {text}
    </span>
  );
}
