import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Progress, Space, Tag } from 'antd';
import { useAppUpdates } from './AppUpdateProvider';

export function AppUpdateCard() {
  const { supported, state, checking, error, check, dismiss, install, updating, update } = useAppUpdates();
  const newer = state?.has_update;
  const phaseLabels = {
    idle: 'Update now', preparing: 'Preparing update…', downloading: 'Downloading update…',
    verifying: 'Verifying update…', installing: 'Installing and reopening…', failed: 'Retry update',
  };
  const megabytes = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;
  return (
    <Card title="App updates" variant="borderless" className="oi-section-gap">
      <div className="oi-setting-row">
        <div>
          <div className="oi-setting-label">Installed version {__APP_VERSION__}</div>
          <div className="oi-setting-note">
            {supported
              ? 'Get updates here. You choose when to download, install and reopen OpenISave.'
              : 'Update checking is available in the Windows desktop app.'}
          </div>
        </div>
        <Button icon={<ReloadOutlined />} loading={checking} disabled={!supported || updating}
          onClick={() => void check()}>
          Check for updates
        </Button>
      </div>

      {error && !updating ? (
        <Alert className="oi-section-gap" type="warning" showIcon
          message="Could not check for updates" description={error} />
      ) : state?.checked_at ? (
        <p className="oi-panel-note" role="status">
          {newer ? (
            <Tag color="blue">Version {state.latest_version} available{state.dismissed ? ' · skipped' : ''}</Tag>
          ) : 'No newer version is available.'}
        </p>
      ) : supported ? (
        <p className="oi-panel-note" role="status">
          {checking ? 'Checking for updates…' : 'Not checked yet.'}
        </p>
      ) : null}

      {newer && state ? (
        <div className="oi-section-gap">
          {error ? <p>Last known available version: {state.latest_version}</p> : null}
          {state.notes ? (
            <details className="oi-update-notes">
              <summary>Release notes</summary>
              <p>{state.notes}</p>
            </details>
          ) : null}
          <Space wrap>
            <Button type="primary" icon={<DownloadOutlined />} loading={updating}
              disabled={!state.can_install || checking || updating} onClick={() => void update()}>
              {phaseLabels[install.phase]}
            </Button>
            {!state.dismissed ? <Button disabled={updating} onClick={() => void dismiss()}>Skip this version</Button> : null}
          </Space>
          <p className="oi-panel-note">
            {state.can_install
              ? 'OpenISave will download and verify the update, then close briefly to install and reopen.'
              : 'Check for updates again to prepare a signed in-app update.'}
          </p>
        </div>
      ) : null}
      {updating ? (
        <div className="oi-section-gap" role="status" aria-live="polite">
          <p className="oi-setting-label">{phaseLabels[install.phase]}</p>
          {install.phase === 'downloading' ? <>
            <Progress aria-label="Update download progress" showInfo={Boolean(install.total)}
              percent={install.total ? Math.min(100, Math.floor(install.downloaded / install.total * 100)) : 0} />
            <p className="oi-setting-note">{megabytes(install.downloaded)}
              {install.total ? ` of ${megabytes(install.total)}` : ' downloaded'}</p>
          </> : null}
        </div>
      ) : null}
      {install.phase === 'failed' ? <Alert className="oi-section-gap" type="error" showIcon
        message="Update failed" description={install.error} /> : null}
      {state?.checked_at ? (
        <p className="oi-setting-note">
          Last successful check: {new Date(state.checked_at * 1000).toLocaleString()}
        </p>
      ) : null}
    </Card>
  );
}
