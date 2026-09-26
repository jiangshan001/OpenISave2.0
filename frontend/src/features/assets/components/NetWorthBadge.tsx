import { Tag, Tooltip } from 'antd';

import type { Asset } from '@/types/asset';

/**
 * Shows how the backend classified an asset. The classification itself is a
 * backend rule (category default or manual choice); this only displays it.
 */
export function NetWorthBadge({
  asset,
}: {
  asset: Pick<Asset, 'include_in_net_worth' | 'include_in_net_worth_source'>;
}) {
  const how =
    asset.include_in_net_worth_source === 'manual'
      ? 'Set manually on this asset.'
      : 'Follows the default for its category.';
  if (asset.include_in_net_worth) {
    return (
      <Tooltip title={`Counted in Total Assets and Net Worth. ${how}`}>
        <Tag color="blue" bordered={false}>
          Included in Net Worth
        </Tag>
      </Tooltip>
    );
  }
  return (
    <Tooltip
      title={`Tracked for holding cost and value, but not part of Net Worth. ${how}`}
    >
      <Tag bordered={false}>Personal Possession — excluded from Net Worth</Tag>
    </Tooltip>
  );
}
