/**
 * The Daily Tasks screen's copy, Swahili first.
 *
 * The two halves must hold the SAME keys - a missing one is a blank on
 * screen, not a compile error, because both objects are read through the same
 * `t()` computed. daily-tasks.spec.ts asserts the parity.
 */
export const DAILY_TASKS_I18N = {
  sw: {
    title: 'Kazi za Kila Siku',
    subtitle: 'Kazi za shamba zima - mizunguko yote inayoendelea - kwa siku uliyochagua',
    loading: 'Inapakia...',
    retry: 'Jaribu tena',

    dateLabel: 'Tarehe',
    /** Rudi leo kwa mbofyo mmoja baada ya kuangalia siku za nyuma. */
    today: 'Leo',
    progressLabel: 'Zimefanyika',
    prevDay: 'Siku iliyopita',
    nextDay: 'Siku inayofuata',

    filterLabel: 'Chuja kazi',
    filterAll: 'Zote',
    filterOutstanding: 'Hazijafanyika',
    filterDone: 'Zimefanyika',
    filterEmptyOutstanding: 'Kazi zote za siku hii zimefanyika.',
    filterEmptyDone: 'Hakuna kazi iliyofanyika bado kwa siku hii.',
    /** Si hali ya backend - ni alama ya kuona tu: muda umepita na bado haijafanyika. */
    timePassed: 'Muda umepita',

    railTitle: 'Muhtasari wa siku',
    railAll: 'Kazi zote',
    railDone: 'Zimefanyika',
    railOutstanding: 'Hazijafanyika',
    railTimePassed: 'Muda umepita',
    railNextTitle: 'Kazi inayofuata',
    railNextNone: 'Hakuna kazi iliyobaki leo.',
    railByUnitTitle: 'Maendeleo kwa kitengo',

    futureTitle: 'Siku hii bado haijafika',
    futureMessage:
      'Kazi ya siku ijayo haiwezi kuwekwa imefanyika. Unaweza kuiona, lakini kuiweka alama ni kwa leo au siku zilizopita tu.',
    futureTooltip: 'Siku ijayo haiwezi kuwekwa imefanyika',

    unitLabel: 'Kitengo',
    noUnit: 'Bila kitengo',
    noSpecies: 'Bila aina ya samaki',

    statusDone: 'Imefanyika',
    statusOutstanding: 'Haijafanyika',
    statusPending: 'Inasubiri',
    statusMissed: 'Imekosekana',
    statusLate: 'Imechelewa',

    /** "imefanywa na Juma, 07:14" */
    doneBy: 'imefanywa na',
    /** Rekodi ya kufanyika ipo lakini haina jina - hii pekee ndiyo huonyeshwa. */
    doneAnonymous: 'imefanyika',
    assignedLabel: 'Imepangiwa',
    notesLabel: 'Maelezo',

    mark: 'Weka imefanyika',
    markedToast: 'Kazi imewekwa imefanyika.',

    emptyTitle: 'Hakuna kazi kwa siku hii',
    emptyMessage:
      'Kazi hutengenezwa na mzunguko unaoendelea. Nenda kwenye Uzalishaji, anzisha mzunguko kwenye kitengo - kazi za kulisha na kuangalia maji zitajitokeza hapa zenyewe kila siku.',
    goToProduction: 'Nenda kwenye Uzalishaji',
  },
  en: {
    title: 'Daily Tasks',
    subtitle: "The whole farm's tasks - every active cycle - for the day you pick",
    loading: 'Loading...',
    retry: 'Try again',

    dateLabel: 'Date',
    /** One click back to today after looking at past days. */
    today: 'Today',
    progressLabel: 'Done',
    prevDay: 'Previous day',
    nextDay: 'Next day',

    filterLabel: 'Filter tasks',
    filterAll: 'All',
    filterOutstanding: 'Outstanding',
    filterDone: 'Done',
    filterEmptyOutstanding: 'Every task for this day is done.',
    filterEmptyDone: 'No task has been done yet for this day.',
    /** Not a backend status - a visual cue only: time has passed and it is still undone. */
    timePassed: 'Time passed',

    railTitle: 'Day summary',
    railAll: 'All tasks',
    railDone: 'Done',
    railOutstanding: 'Outstanding',
    railTimePassed: 'Time passed',
    railNextTitle: 'Next task',
    railNextNone: 'Nothing left to do today.',
    railByUnitTitle: 'Progress by unit',

    futureTitle: 'This day has not arrived yet',
    futureMessage:
      'A task on a future day cannot be marked done. You can look at it, but marking is for today and past days only.',
    futureTooltip: 'A future day cannot be marked done',

    unitLabel: 'Unit',
    noUnit: 'No unit',
    noSpecies: 'No species',

    statusDone: 'Done',
    statusOutstanding: 'Outstanding',
    statusPending: 'Pending',
    statusMissed: 'Missed',
    statusLate: 'Late',

    /** "done by Juma, 07:14" */
    doneBy: 'done by',
    /** A completion record with no name on it - this alone is shown. */
    doneAnonymous: 'done',
    assignedLabel: 'Assigned to',
    notesLabel: 'Notes',

    mark: 'Mark done',
    markedToast: 'Task marked done.',

    emptyTitle: 'No tasks for this day',
    emptyMessage:
      'Tasks come from a running cycle. Go to Production and start a cycle in a unit - its feeding and water checks will appear here on their own, every day.',
    goToProduction: 'Go to Production',
  },
} as const;
