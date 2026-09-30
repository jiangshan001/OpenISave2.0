/*
 * Savings-goal presentation: a visual kind guessed from the goal's name,
 * the milestone ladder and short encouragement copy. Presentation only: the
 * kind is never stored, and progress always comes from the backend's
 * `progress_percent` (nothing is recomputed here).
 */

export type GoalKind = 'emergency' | 'travel' | 'home' | 'education' | 'car' | 'gift' | 'savings';

export interface GoalTheme {
  /** Rendered as `data-goal`; colours live in styles/goals.css. */
  kind: GoalKind;
  label: string;
}

/** First match wins, so the more specific intentions come first. */
const GOAL_KEYWORDS: readonly { kind: GoalKind; label: string; match: RegExp }[] = [
  {
    kind: 'emergency',
    label: 'Safety net',
    match: /emergenc|rainy[\s-]?day|safety net|buffer|应急|紧急|备用金/i,
  },
  {
    kind: 'education',
    label: 'Education',
    match: /educat|school|tuition|universit|college|course|study|学费|教育|留学|读书/i,
  },
  {
    kind: 'travel',
    label: 'Travel',
    match: /travel|trip|holiday|vacation|flight|journey|旅行|旅游|度假|机票/i,
  },
  {
    kind: 'home',
    label: 'Home',
    match: /\bhome|house|\bflat\b|apartment|mortgage|renovat|买房|首付|房子|装修|住房/i,
  },
  { kind: 'car', label: 'Car', match: /\bcars?\b|vehicle|买车|汽车|车辆/i },
  { kind: 'gift', label: 'Occasion', match: /gift|wedding|birthday|christmas|礼物|婚礼|生日/i },
];

export const GOAL_KINDS: readonly GoalKind[] = [
  ...GOAL_KEYWORDS.map((entry) => entry.kind),
  'savings',
];

export function resolveGoalTheme(name: string): GoalTheme {
  const hit = GOAL_KEYWORDS.find((entry) => entry.match.test(name));
  return hit ? { kind: hit.kind, label: hit.label } : { kind: 'savings', label: 'Savings' };
}

export const GOAL_MILESTONES = [25, 50, 75, 100] as const;
export type Milestone = (typeof GOAL_MILESTONES)[number];

/** Milestones at or below the backend's progress figure. */
export function reachedMilestones(percent: number | null | undefined): Milestone[] {
  const value = percent ?? 0;
  return GOAL_MILESTONES.filter((milestone) => value >= milestone);
}

export function highestMilestone(percent: number | null | undefined): Milestone | null {
  const reached = reachedMilestones(percent);
  return reached.length ? reached[reached.length - 1] : null;
}

/** Calm, short progress copy. Thresholds are inclusive at the lower bound. */
export function goalEncouragement(percent: number | null | undefined): string {
  const value = percent ?? 0;
  if (value >= 100) return 'Goal reached';
  if (value >= 75) return 'Almost there';
  if (value >= 50) return 'Halfway there';
  if (value >= 25) return 'Momentum building';
  return 'Getting started';
}

/** Screen-reader wording for a milestone track. */
export function milestoneValueText(percent: number | null | undefined, formatted: string): string {
  const top = highestMilestone(percent);
  if (top === 100) return `${formatted}, goal reached`;
  return top ? `${formatted}, ${top}% milestone reached` : `${formatted}, no milestone reached yet`;
}
