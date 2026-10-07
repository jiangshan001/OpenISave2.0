import { afterEach, describe, expect, it } from 'vitest';

import {
  goalEncouragement,
  highestMilestone,
  milestoneValueText,
  reachedMilestones,
  resolveGoalTheme,
} from './goalTheme';
import { MILESTONE_STORAGE_KEY, pendingMilestone, rememberMilestone } from './milestoneMemory';

describe('goal visual classification', () => {
  it.each([
    ['Emergency Fund', 'emergency'],
    ['Rainy day buffer', 'emergency'],
    ['应急基金', 'emergency'],
    ['Travel', 'travel'],
    ['Japan trip 2027', 'travel'],
    ['Summer holiday', 'travel'],
    ['旅行', 'travel'],
    ['Home deposit', 'home'],
    ['New house', 'home'],
    ['买房首付', 'home'],
    ['University tuition', 'education'],
    ['School fees', 'education'],
    ['留学', 'education'],
    ['New car', 'car'],
    ['Wedding', 'gift'],
  ] as const)('%s → %s', (name, kind) => {
    expect(resolveGoalTheme(name).kind).toBe(kind);
  });

  it('falls back to general savings when nothing matches', () => {
    expect(resolveGoalTheme('General Savings').kind).toBe('savings');
    expect(resolveGoalTheme('三年存够50万').kind).toBe('savings');
    expect(resolveGoalTheme('').kind).toBe('savings');
  });

  it('does not read words that merely contain a keyword', () => {
    expect(resolveGoalTheme('Career change').kind).toBe('savings');
    expect(resolveGoalTheme('Cardigan fund').kind).toBe('savings');
  });
});

describe('milestones', () => {
  it('reaches each milestone exactly at its boundary', () => {
    expect(reachedMilestones(0)).toEqual([]);
    expect(reachedMilestones(24.99)).toEqual([]);
    expect(reachedMilestones(25)).toEqual([25]);
    expect(reachedMilestones(49.9)).toEqual([25]);
    expect(reachedMilestones(50)).toEqual([25, 50]);
    expect(reachedMilestones(75)).toEqual([25, 50, 75]);
    expect(reachedMilestones(99.99)).toEqual([25, 50, 75]);
    expect(reachedMilestones(100)).toEqual([25, 50, 75, 100]);
    expect(reachedMilestones(107.3)).toEqual([25, 50, 75, 100]);
    expect(reachedMilestones(null)).toEqual([]);
  });

  it('reports the highest milestone', () => {
    expect(highestMilestone(10)).toBeNull();
    expect(highestMilestone(37.1)).toBe(25);
    expect(highestMilestone(100)).toBe(100);
  });

  it('writes calm encouragement at 0 / 25 / 50 / 75 / 100', () => {
    expect(goalEncouragement(0)).toBe('Getting started');
    expect(goalEncouragement(24.9)).toBe('Getting started');
    expect(goalEncouragement(25)).toBe('Momentum building');
    expect(goalEncouragement(50)).toBe('Halfway there');
    expect(goalEncouragement(75)).toBe('Almost there');
    expect(goalEncouragement(99.9)).toBe('Almost there');
    expect(goalEncouragement(100)).toBe('Goal reached');
    expect(goalEncouragement(null)).toBe('Getting started');
  });

  it('states progress in words for assistive technology', () => {
    expect(milestoneValueText(37.1, '37.1%')).toBe('37.1%, 25% milestone reached');
    expect(milestoneValueText(5, '5.0%')).toBe('5.0%, no milestone reached yet');
    expect(milestoneValueText(100, '100.0%')).toBe('100.0%, goal reached');
  });
});

describe('milestone moment memory', () => {
  afterEach(() => localStorage.clear());

  it('records a goal seen for the first time without celebrating', () => {
    expect(pendingMilestone(7, 60)).toBeNull();
    rememberMilestone(7, 60);
    expect(JSON.parse(localStorage.getItem(MILESTONE_STORAGE_KEY) ?? '{}')).toEqual({ 7: 50 });
  });

  it('plays a newly crossed milestone once', () => {
    rememberMilestone(7, 40);
    expect(pendingMilestone(7, 52)).toBe(50);
    rememberMilestone(7, 52);
    expect(pendingMilestone(7, 52)).toBeNull();
    expect(pendingMilestone(7, 100)).toBe(100);
  });

  it('never lowers the stored milestone, so a dip does not replay it', () => {
    rememberMilestone(7, 80);
    rememberMilestone(7, 30);
    expect(pendingMilestone(7, 80)).toBeNull();
  });

  it('survives unreadable storage', () => {
    localStorage.setItem(MILESTONE_STORAGE_KEY, 'not json');
    expect(pendingMilestone(7, 90)).toBeNull();
    rememberMilestone(7, 90);
    expect(pendingMilestone(7, 100)).toBe(100);
  });
});
