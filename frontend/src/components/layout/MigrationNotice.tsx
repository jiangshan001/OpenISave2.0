import { Alert, Button } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useSecurityStatus } from '@/hooks/useSecurity';

const DISMISS_KEY = 'oi-migration-notice-dismissed';

function dismissedThisSession(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Tells the user the 2.0 plaintext copy still exists until they remove it. */
export function MigrationNotice() {
  const navigate = useNavigate();
  const { data } = useSecurityStatus();
  const [dismissed, setDismissed] = useState(dismissedThisSession);

  if (!data?.migration.plaintext_backup_exists || dismissed) return null;

  return (
    <Alert
      type={data.migration.just_migrated ? 'success' : 'warning'}
      showIcon
      closable
      banner
      onClose={() => {
        try {
          sessionStorage.setItem(DISMISS_KEY, '1');
        } catch {
          // Storage unavailable: the notice simply returns next time.
        }
        setDismissed(true);
      }}
      message="Encryption migration successful. An unencrypted migration backup exists."
      action={
        <Button size="small" onClick={() => navigate('/settings')}>
          Review in Data &amp; Security
        </Button>
      }
    />
  );
}
