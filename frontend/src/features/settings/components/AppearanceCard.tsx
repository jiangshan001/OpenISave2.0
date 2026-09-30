import { Card } from 'antd';

import { AppearanceSwitch } from '@/theme/AppearanceSwitch';
import { useAppearance } from '@/theme/themeContext';

/** Settings → Appearance. A display preference only; it never touches the vault. */
export function AppearanceCard() {
  const { preference, resolved } = useAppearance();
  const note =
    preference === 'system'
      ? `Following Windows, currently ${resolved === 'dark' ? 'dark' : 'light'}.`
      : `Always ${preference}, whatever Windows uses.`;

  return (
    <Card title="Appearance" variant="borderless">
      <div className="oi-setting-row">
        <div>
          <div className="oi-setting-label" id="theme-label">
            Theme
          </div>
          <div className="oi-setting-note" data-testid="appearance-note">
            {note}
          </div>
        </div>
        <div aria-labelledby="theme-label">
          <AppearanceSwitch />
        </div>
      </div>
    </Card>
  );
}
