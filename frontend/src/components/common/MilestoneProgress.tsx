import { StarFilled } from '@ant-design/icons';

import {
  GOAL_MILESTONES,
  milestoneValueText,
  reachedMilestones,
  type Milestone,
} from '@/theme/goalTheme';
import { formatPercent } from '@/utils/money';

interface MilestoneProgressProps {
  /** Backend `progress_percent`; values above 100 fill the track. */
  percent: number | null;
  label: string;
  size?: 'md' | 'sm';
  /** Show the 25 / 50 / 75 / 100% scale under the track. */
  showScale?: boolean;
  /** A milestone crossed since the last visit: it plays one soft moment. */
  moment?: Milestone | null;
}

/**
 * Savings progress as a track with milestone stops at 25, 50 and 75% and a
 * star at 100%. Reached stops turn into light beads on the fill; the scale
 * and the progressbar's value text state the same in words.
 */
export function MilestoneProgress({
  percent,
  label,
  size = 'md',
  showScale = false,
  moment = null,
}: MilestoneProgressProps) {
  const width = Math.max(0, Math.min(percent ?? 0, 100));
  const reached = new Set<Milestone>(reachedMilestones(percent));

  return (
    <div className={`oi-ms oi-ms--${size}`}>
      <div
        className="oi-ms-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(width)}
        aria-valuetext={milestoneValueText(percent, formatPercent(percent))}
      >
        <span className="oi-ms-fill" style={{ width: `${width}%` }} />
        {GOAL_MILESTONES.map((milestone) => (
          <span
            key={milestone}
            className={milestone === 100 ? 'oi-ms-star' : 'oi-ms-stop'}
            data-m={milestone}
            data-reached={reached.has(milestone)}
            data-moment={moment === milestone || undefined}
            aria-hidden="true"
          >
            {milestone === 100 ? <StarFilled /> : null}
            {milestone === 100 && moment === 100
              ? [0, 1, 2, 3, 4].map((spark) => <i key={spark} className="oi-ms-spark" />)
              : null}
          </span>
        ))}
      </div>
      {showScale ? (
        <div className="oi-ms-scale" aria-hidden="true">
          {GOAL_MILESTONES.map((milestone) => (
            <span key={milestone} data-m={milestone} data-reached={reached.has(milestone)}>
              {milestone}%
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
