import { Button, Checkbox } from 'antd';
import { useState } from 'react';

import type { ImportSummary } from '@/types/imports';

interface ConfirmBarProps {
  summary: ImportSummary;
  busy: boolean;
  onConfirm: (options: { rememberMappings: boolean; skipUnresolved: boolean }) => void;
  onCancel: () => void;
}

/** Final step. The import is one database transaction: all rows or none. */
export function ConfirmBar({ summary, busy, onConfirm, onCancel }: ConfirmBarProps) {
  const [rememberMappings, setRememberMappings] = useState(true);
  const [skipUnresolved, setSkipUnresolved] = useState(false);
  const unresolved = summary.needs_review;
  const blocked = unresolved > 0 && !skipUnresolved;
  const nothing = summary.ready === 0 && summary.to_ignore === 0;

  let hint = `${summary.ready} will be imported in one step — all of them, or none if anything fails.`;
  if (summary.to_ignore) {
    hint += ` ${summary.to_ignore} will be ignored permanently.`;
  }
  if (blocked) hint = `Resolve ${unresolved} row${unresolved === 1 ? '' : 's'} first, or skip them.`;
  else if (unresolved) hint += ` ${unresolved} unresolved row${unresolved === 1 ? '' : 's'} will be skipped.`;

  return (
    <div className="oi-import-confirm">
      <div className="oi-import-confirm-options">
        <Checkbox checked={rememberMappings} onChange={(e) => setRememberMappings(e.target.checked)}>
          Remember account mappings
        </Checkbox>
        <Checkbox
          checked={skipUnresolved}
          disabled={unresolved === 0}
          onChange={(e) => setSkipUnresolved(e.target.checked)}
        >
          Skip unresolved rows{unresolved ? ` (${unresolved})` : ''}
        </Checkbox>
        <span className={blocked ? 'oi-row-meta oi-warning' : 'oi-row-meta'}>{hint}</span>
      </div>
      <div className="oi-import-confirm-actions">
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          type="primary"
          loading={busy}
          disabled={blocked || nothing}
          onClick={() => onConfirm({ rememberMappings, skipUnresolved })}
        >
          {summary.ready === 0 && summary.to_ignore > 0
            ? `Ignore ${summary.to_ignore} row${summary.to_ignore === 1 ? '' : 's'} permanently`
            : `Import ${summary.ready} transaction${summary.ready === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  );
}
