import {
  BookOutlined,
  CarOutlined,
  GiftOutlined,
  GlobalOutlined,
  HomeOutlined,
  SafetyOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';

import type { GoalKind } from '@/theme/goalTheme';

const GLYPHS: Record<GoalKind, ReactNode> = {
  emergency: <SafetyOutlined />,
  travel: <GlobalOutlined />,
  home: <HomeOutlined />,
  education: <BookOutlined />,
  car: <CarOutlined />,
  gift: <GiftOutlined />,
  savings: <WalletOutlined />,
};

/** Goal icon in a soft tinted well; decorative, the goal name carries meaning. */
export function GoalGlyph({ kind, size = 'md' }: { kind: GoalKind; size?: 'md' | 'sm' }) {
  return (
    <span
      className={`oi-goal-glyph${size === 'sm' ? ' oi-goal-glyph--sm' : ''}`}
      data-goal={kind}
      aria-hidden="true"
    >
      {GLYPHS[kind]}
    </span>
  );
}
