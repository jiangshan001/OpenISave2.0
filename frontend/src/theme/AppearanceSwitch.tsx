import { DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Segmented, Tooltip } from 'antd';
import type { ReactNode } from 'react';

import type { AppearancePreference } from './appearance';
import { useAppearance } from './themeContext';

const OPTIONS: { value: AppearancePreference; label: string; icon: ReactNode }[] = [
  { value: 'system', label: 'System', icon: <DesktopOutlined /> },
  { value: 'light', label: 'Light', icon: <SunOutlined /> },
  { value: 'dark', label: 'Dark', icon: <MoonOutlined /> },
];

interface AppearanceSwitchProps {
  /** Icons only, with the names in tooltips and accessible labels. */
  compact?: boolean;
  size?: 'small' | 'middle';
}

/** System / Light / Dark. Changes apply immediately and persist locally. */
export function AppearanceSwitch({ compact = false, size = 'middle' }: AppearanceSwitchProps) {
  const { preference, setPreference } = useAppearance();

  return (
    <Segmented<AppearancePreference>
      size={size}
      value={preference}
      onChange={setPreference}
      aria-label="Theme"
      options={OPTIONS.map((option) => ({
        value: option.value,
        label: compact ? (
          <Tooltip title={option.label} mouseEnterDelay={0.4}>
            <span className="oi-theme-option" aria-label={option.label}>
              {option.icon}
            </span>
          </Tooltip>
        ) : (
          <span className="oi-theme-option">
            {option.icon}
            {option.label}
          </span>
        ),
      }))}
    />
  );
}
