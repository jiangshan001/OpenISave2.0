import { Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAppUpdates } from './AppUpdateProvider';

export function AppUpdateBadge() {
  const navigate = useNavigate();
  const { state } = useAppUpdates();
  if (!state?.has_update || state.dismissed) return null;
  return (
    <Button className="oi-update-badge" size="small" type="link"
      title={`Version ${state.latest_version} is available`}
      onClick={() => navigate('/settings')}>
      Update available
    </Button>
  );
}
