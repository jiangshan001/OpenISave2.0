/*
 * Remembers, per goal, the highest milestone this device has already shown,
 * so a milestone moment plays once rather than on every visit. Like the
 * appearance preference it lives in the webview's localStorage, never in the
 * vault, and it holds only goal ids and milestone numbers.
 *
 * A goal seen for the first time is recorded silently: the app cannot tell
 * whether its milestones are new, so it does not celebrate them.
 */
import { useEffect, useState } from 'react';

import { highestMilestone, type Milestone } from './goalTheme';

export const MILESTONE_STORAGE_KEY = 'openisave.goalMilestones';

type SeenMap = Record<string, number>;

function readSeen(): SeenMap {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(MILESTONE_STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as SeenMap) : {};
  } catch {
    return {};
  }
}

function writeSeen(seen: SeenMap) {
  try {
    localStorage.setItem(MILESTONE_STORAGE_KEY, JSON.stringify(seen));
  } catch {
    // Storage can be unavailable; the moment is then simply not remembered.
  }
}

/** The milestone newly crossed since this device last showed the goal, if any. */
export function pendingMilestone(goalId: number, percent: number | null): Milestone | null {
  const top = highestMilestone(percent);
  const seen = readSeen()[String(goalId)];
  if (seen === undefined || top === null) return null;
  return top > seen ? top : null;
}

/** Records the milestone as shown. Only ever raises the stored value. */
export function rememberMilestone(goalId: number, percent: number | null) {
  const seen = readSeen();
  const key = String(goalId);
  const top = highestMilestone(percent) ?? 0;
  if (seen[key] === undefined || top > seen[key]) {
    seen[key] = top;
    writeSeen(seen);
  }
}

/** One-shot milestone moment for a goal card; null when there is nothing new. */
export function useMilestoneMoment(goalId: number, percent: number | null): Milestone | null {
  const [moment] = useState(() => pendingMilestone(goalId, percent));
  useEffect(() => {
    rememberMilestone(goalId, percent);
  }, [goalId, percent]);
  return moment;
}
