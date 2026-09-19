import { DailyTaskStatus } from './models/daily-task';
import { groupTasksByUnit, twinGroups, twinLabel } from './daily-task-sheet';

function task(taskId: string, cycleId: number | null, unitCode = 'P1'): DailyTaskStatus {
  return {
    taskId,
    cycleId,
    unitCode,
    speciesName: 'Kambale',
    taskType: 'Kulisha - Asubuhi',
    scheduledTime: '07:00',
    frequency: 'DAILY',
    assignedRoleName: null,
    date: '2026-09-19',
    status: 'OUTSTANDING',
    done: false,
    completedAt: null,
    completedByName: null,
    notes: null,
    taskKind: 'FEEDING',
    feedingLogId: null,
    closureReason: null,
    closureNote: null,
  };
}

const WORDS = { stocked: 'imepandwa', locale: 'en-GB' };

describe('the task sheet\'s twin cycles', () => {
  // Two cycles of Kambale in P1 used to be ONE group, their identical rows
  // side by side with nothing to tell them apart.
  it('keeps two cycles in one unit as two groups, the older first', () => {
    const groups = groupTasksByUnit([task('1', 12), task('2', 7), task('3', 12)]);

    expect(groups.map((group) => [group.cycleId, group.tasks.length])).toEqual([
      [7, 1],
      [12, 2],
    ]);
  });

  it('names a twin by its stocking date, and leaves every other heading alone', () => {
    const groups = groupTasksByUnit([task('1', 7), task('2', 12), task('3', 20, 'T1')]);
    const twins = twinGroups(groups);
    const dates = new Map([
      [7, '2026-09-15'],
      [12, '2026-09-16'],
      [20, '2026-09-01'],
    ]);

    expect(groups.map((group) => twinLabel(group, twins, dates, WORDS))).toEqual([
      'imepandwa 15 Sept',
      'imepandwa 16 Sept',
      null, // T1 has one cycle: its unit already names it
    ]);
  });

  it('falls back to the twin\'s place when its date is not to hand', () => {
    const groups = groupTasksByUnit([task('1', 7), task('2', 12)]);

    expect(groups.map((group) => twinLabel(group, twinGroups(groups), new Map(), WORDS))).toEqual([
      '(1)',
      '(2)',
    ]);
  });
});
