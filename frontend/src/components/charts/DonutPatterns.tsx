import type { CSSProperties } from 'react';

interface DonutPatternsProps { prefix: string; count: number; color: string; ink: string }

/** Child categories keep their parent's hue; texture distinguishes siblings. */
export function DonutPatterns({ prefix, count, color, ink }: DonutPatternsProps) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <pattern key={index} id={`${prefix}-${index}`} width={8 + Math.floor(index / 7) * 2}
          height={8 + Math.floor(index / 7) * 2} patternUnits="userSpaceOnUse">
          <rect width="100%" height="100%" fill={color} />
          <g stroke={ink} strokeWidth={1.3} opacity={0.55}>
            {index % 7 === 1 ? <path d="M-2 2L2-2M0 8L8 0M6 10L10 6" /> : null}
            {index % 7 === 2 ? <path d="M-2 6L2 10M0 0L8 8M6-2L10 2" /> : null}
            {index % 7 === 3 ? <path d="M0 4H20" /> : null}
            {index % 7 === 4 ? <path d="M4 0V20" /> : null}
            {index % 7 === 5 ? <path d="M0 4H20M4 0V20" /> : null}
            {index % 7 === 6 ? <circle cx={4} cy={4} r={1.4} fill={ink} stroke="none" /> : null}
          </g>
        </pattern>
      ))}
    </>
  );
}

export function patternSwatch(color: string, ink: string, index: number): CSSProperties {
  const stripe = (angle: number) =>
    `repeating-linear-gradient(${angle}deg, transparent 0px 5px, ${ink} 5px 6px, transparent 6px 8px)`;
  const images = [undefined, stripe(45), stripe(135), stripe(0), stripe(90),
    `${stripe(0)}, ${stripe(90)}`, `radial-gradient(${ink} 1px, transparent 1px)`];
  return { backgroundColor: color, backgroundImage: images[index % 7], backgroundSize: '8px 8px' };
}
