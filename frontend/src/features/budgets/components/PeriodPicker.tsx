import { Select, Space } from 'antd';

import { MONTH_OPTIONS, YEAR_OPTIONS } from '@/utils/dates';

interface PeriodPickerProps {
  year: number;
  month: number;
  onChange: (period: { year: number; month: number }) => void;
}

export function PeriodPicker({ year, month, onChange }: PeriodPickerProps) {
  return (
    <Space size={8}>
      <Select
        value={month}
        style={{ width: 140 }}
        onChange={(value) => onChange({ year, month: value })}
        options={MONTH_OPTIONS}
      />
      <Select
        value={year}
        style={{ width: 100 }}
        onChange={(value) => onChange({ year: value, month })}
        options={YEAR_OPTIONS.map((option) => ({ value: option, label: String(option) }))}
      />
    </Space>
  );
}
