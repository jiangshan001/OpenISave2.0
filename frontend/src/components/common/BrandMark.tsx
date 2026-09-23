import logoUrl from '@/assets/logo.png';

/**
 * The OpenISave logo. `src/assets/logo.png` is the 256 px icon generated from
 * the repository's canonical `logo.png` (see desktop/icons/128x128@2x.png).
 */
interface BrandMarkProps {
  className: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  return <img src={logoUrl} alt="OpenISave" className={className} draggable={false} />;
}
