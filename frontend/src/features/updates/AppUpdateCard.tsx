import { ExportOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Space, Tag } from 'antd';
import { useAppUpdates } from './AppUpdateProvider';

export function AppUpdateCard() {
  const { supported, state, checking, error, check, dismiss, openRelease } = useAppUpdates();
  const newer = state?.has_update;
  return (
    <Card title="App updates" variant="borderless" className="oi-section-gap">
      <div className="oi-setting-row">
        <div>
          <div className="oi-setting-label">Installed version {__APP_VERSION__}</div>
          <div className="oi-setting-note">
            {supported
              ? 'Checks GitHub for new releases. You choose when to download and install.'
              : 'Update checking is available in the Windows desktop app.'}
          </div>
        </div>
        <Button icon={<ReloadOutlined />} loading={checking} disabled={!supported}
          onClick={() => void check()}>
          Check for updates
        </Button>
      </div>

      {error ? (
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
            <Button type="primary" icon={<ExportOutlined />} onClick={() => void openRelease()}>
              Open download page
            </Button>
            {!state.dismissed ? <Button onClick={() => void dismiss()}>Skip this version</Button> : null}
          </Space>
          <p className="oi-panel-note">
            Download the Windows installer from the release page, close OpenISave, then run it.
          </p>
        </div>
      ) : null}
      {state?.checked_at ? (
        <p className="oi-setting-note">
          Last successful check: {new Date(state.checked_at * 1000).toLocaleString()}
        </p>
      ) : null}
    </Card>
  );
}
