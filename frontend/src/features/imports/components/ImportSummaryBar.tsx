import type { ImportPreview } from '@/types/imports';
import { formatDate } from '@/utils/dates';

interface Stat {
  label: string;
  value: number;
  tone?: string;
}

export function ImportSummaryBar({ preview }: { preview: ImportPreview }) {
  const { summary } = preview;
  const stats: Stat[] = [
    { label: 'New', value: summary.new },
    { label: 'Already imported', value: summary.duplicates },
    { label: 'Auto-classified', value: summary.auto_classified, tone: 'oi-positive' },
    {
      label: 'Needs review',
      value: summary.needs_review,
      tone: summary.needs_review ? 'oi-warning' : undefined,
    },
    { label: 'Ignored', value: summary.ignored },
  ];
  if (summary.invalid) stats.push({ label: 'Unreadable', value: summary.invalid, tone: 'oi-negative' });

  return (
    <div className="oi-import-summary">
      <div>
        <div className="oi-import-summary-count">
          {summary.detected} transaction{summary.detected === 1 ? '' : 's'} detected
        </div>
        <div className="oi-row-meta">
          {preview.file_name ?? 'WeChat Pay statement'}
          {preview.period_start
            ? ` · ${formatDate(preview.period_start)} – ${formatDate(preview.period_end)}`
            : ''}
          {` · header found on row ${preview.header_row}`}
        </div>
      </div>
      <dl className="oi-import-stats">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt>{stat.label}</dt>
            <dd className={stat.tone}>{stat.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
