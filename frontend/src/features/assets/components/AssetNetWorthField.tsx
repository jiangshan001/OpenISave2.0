import { Button, Form, Switch } from 'antd';

interface AssetNetWorthFieldProps {
  /** The selected category's default, or null when no category is chosen. */
  categoryDefault: boolean;
  categoryName: string | null;
  /** True once the user has chosen explicitly (a manual override). */
  manual: boolean;
  onManualChange: (manual: boolean) => void;
  onReset: () => void;
}

/**
 * "Include in net worth" toggle. It starts at the category default and keeps
 * following the category until the user flips it; the backend applies the
 * same rule, so an untouched toggle is sent as "follow the category".
 */
export function AssetNetWorthField({
  categoryDefault,
  categoryName,
  manual,
  onManualChange,
  onReset,
}: AssetNetWorthFieldProps) {
  const defaultText = categoryName
    ? `${categoryName} ${categoryDefault ? 'counts' : 'does not count'} by default.`
    : 'Uncategorised assets do not count by default.';

  return (
    <Form.Item
      label="Include in net worth"
      extra={
        <span>
          {manual ? 'Set manually. ' : `${defaultText} `}
          Personal possessions stay fully tracked but are not part of net worth.
          {manual ? (
            <Button type="link" size="small" onClick={onReset} style={{ paddingInline: 4 }}>
              Use category default
            </Button>
          ) : null}
        </span>
      }
    >
      <Form.Item name="include_in_net_worth" valuePropName="checked" noStyle>
        <Switch aria-label="Include in net worth" onChange={() => onManualChange(true)} />
      </Form.Item>
    </Form.Item>
  );
}
