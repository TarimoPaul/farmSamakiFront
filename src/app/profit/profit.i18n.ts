/**
 * Profit report CONTENT only. The chrome around it belongs to AppShell.
 *
 * Two labels carry the screen's meaning and must never be softened:
 *  - `capitalTitle`: capital is INVESTMENT, shown beside profit, never in it.
 *  - `cycleBeforeFeedLabel`: a cycle's profit is BEFORE feed and whole-farm
 *    costs - it is not the farm's final profit.
 *
 * The backend's VALIDATION_ERROR sentence is shown verbatim (it names the two
 * dates); `errorDateRange` is our own copy for the same rule, caught first.
 */
export const PROFIT_I18N = {
  sw: {
    title: 'Ripoti ya Faida',
    subtitle: 'Mapato, gharama na faida ya shamba kwa kipindi - kila chanzo cha gharama peke yake',
    loading: 'Inapakia...',
    retry: 'Jaribu tena',

    filterTitle: 'Shamba na kipindi',
    filterHint:
      'Mapato ni ya mizunguko ILIYOFUNGWA ambayo tarehe ya mavuno iko ndani ya kipindi. Tarehe zote mbili zimo.',
    fieldFarm: 'Shamba',
    fieldFarmPlaceholder: 'Chagua shamba…',
    fieldFrom: 'Kuanzia tarehe',
    fieldTo: 'Hadi tarehe',
    runReport: 'Onyesha ripoti',
    errorFarmRequired: 'Chagua shamba.',
    errorFromRequired: 'Chagua tarehe ya mwanzo.',
    errorToRequired: 'Chagua tarehe ya mwisho.',
    errorDateRange: 'Tarehe ya mwanzo haiwezi kuwa baada ya tarehe ya mwisho.',

    noFarmTitle: 'Hakuna shamba la kuonyesha',
    noFarmMessage: 'Akaunti yako haijawekwa kwenye shamba lolote bado.',
    promptRun: 'Chagua shamba na kipindi, kisha bofya "Onyesha ripoti".',
    reportLoading: 'Inapakia ripoti...',
    reportFor: (farm: string, from: string, to: string) => `${farm} · ${from} hadi ${to}`,

    headRevenue: 'Mapato',
    headCosts: 'Gharama zote',
    headNet: 'Faida halisi',
    netProfit: 'Faida',
    netLoss: 'Hasara',
    incompleteNotice: (count: number) =>
      `Mizunguko ${count} ina taarifa pungufu (mapato au gharama ya vifaranga haikurekodiwa) - faida inaweza isiwe sahihi: mapato yasiyorekodiwa huifanya ionekane ndogo, vifaranga visivyorekodiwa huifanya ionekane kubwa.`,
    reversedNote: (count: number) =>
      `Manunuzi ${count} ya chakula yaliyobatilishwa hayakuhesabiwa.`,

    breakdownTitle: 'Gharama kwa chanzo',
    breakdownHint:
      'Kila chanzo kiko peke yake. Ukiona aina kama "Chakula" kwenye gharama za uendeshaji PAMOJA na mstari wa manunuzi ya chakula, huenda chakula kimehesabiwa mara mbili.',
    srcCycleCosts: 'Gharama za mizunguko',
    srcFingerling: 'Vifaranga',
    srcCycleOperational: 'Gharama za uendeshaji za mizunguko',
    srcFeed: 'Manunuzi ya chakula',
    srcFarmOperational: 'Gharama za uendeshaji za shamba zima',
    srcTotal: 'Jumla ya gharama',

    capitalTitle: 'Mtaji uliowekezwa',
    capitalHint:
      'Mali zilizonunuliwa ndani ya kipindi. Ni UWEKEZAJI - haumo kwenye gharama wala kwenye faida iliyo juu.',

    cyclesTitle: 'Faida kwa kila mzunguko',
    cyclesHint:
      'Mizunguko iliyofungwa ndani ya kipindi. Faida hapa ni KABLA ya chakula na gharama za shamba zima.',
    cyclesEmpty: 'Hakuna mzunguko uliofungwa ndani ya kipindi hiki.',
    colCycle: 'Mzunguko',
    colHarvestDate: 'Mavuno',
    colRevenue: 'Mapato',
    colFingerling: 'Vifaranga',
    colOperational: 'Uendeshaji',
    colNet: 'Faida (kabla ya chakula)',
    colActions: 'Kitendo',
    viewCycle: 'Angalia',
    flagRevenueMissing: 'Mapato hayakurekodiwa (yamehesabiwa 0)',
    flagFingerlingMissing: 'Gharama ya vifaranga haikurekodiwa (imehesabiwa 0)',

    cycleTitle: 'Faida ya mzunguko mmoja',
    cycleHint: 'Mzunguko wowote wa shamba hili - unaoendelea au uliofungwa.',
    fieldCycle: 'Mzunguko',
    fieldCyclePlaceholder: 'Chagua mzunguko…',
    cyclesLoading: 'Inapakia mizunguko...',
    cyclePickEmpty: 'Shamba hili halina mzunguko wowote bado.',
    cyclePrompt: 'Chagua mzunguko, au bofya "Angalia" kwenye jedwali la mizunguko.',
    cycleLoading: 'Inapakia faida ya mzunguko...',
    cycleHarvestDate: 'Tarehe ya mavuno',
    cycleRevenue: 'Mapato',
    cycleFingerling: 'Gharama ya vifaranga',
    cycleOperational: 'Gharama za uendeshaji za mzunguko',
    cycleBeforeFeedLabel: 'Faida kabla ya chakula na gharama za shamba',
    cycleBeforeFeedNote:
      'Hii SI faida ya mwisho ya shamba: chakula na gharama za pamoja za shamba zima hazimo.',
    cycleActive: 'Mzunguko bado hai - faida itapatikana ukifungwa.',
  },
  en: {
    title: 'Profit Report',
    subtitle: 'A farm’s revenue, costs and profit over a period - each cost source on its own',
    loading: 'Loading...',
    retry: 'Try again',

    filterTitle: 'Farm and period',
    filterHint:
      'Revenue is from CLOSED cycles whose harvest date falls in the period. Both dates are included.',
    fieldFarm: 'Farm',
    fieldFarmPlaceholder: 'Select a farm…',
    fieldFrom: 'From date',
    fieldTo: 'To date',
    runReport: 'Show report',
    errorFarmRequired: 'Choose a farm.',
    errorFromRequired: 'Choose a start date.',
    errorToRequired: 'Choose an end date.',
    errorDateRange: 'The start date cannot be after the end date.',

    noFarmTitle: 'No farm to report on',
    noFarmMessage: 'Your account is not assigned to a farm yet.',
    promptRun: 'Choose a farm and a period, then press "Show report".',
    reportLoading: 'Loading the report...',
    reportFor: (farm: string, from: string, to: string) => `${farm} · ${from} to ${to}`,

    headRevenue: 'Revenue',
    headCosts: 'Total costs',
    headNet: 'Net profit',
    netProfit: 'Profit',
    netLoss: 'Loss',
    incompleteNotice: (count: number) =>
      `${count} ${count === 1 ? 'cycle has' : 'cycles have'} incomplete data (missing revenue or fingerling cost) - profit may be wrong: missing revenue understates it, a missing fingerling cost overstates it.`,
    reversedNote: (count: number) =>
      `${count} reversed feed ${count === 1 ? 'purchase was' : 'purchases were'} excluded.`,

    breakdownTitle: 'Costs by source',
    breakdownHint:
      'Each source stands on its own. If a category like "Chakula" (feed) shows under operational costs AS WELL AS the feed purchases line, feed may be counted twice.',
    srcCycleCosts: 'Cycle costs',
    srcFingerling: 'Fingerlings',
    srcCycleOperational: 'Cycle operational costs',
    srcFeed: 'Feed purchases',
    srcFarmOperational: 'Whole-farm operational costs',
    srcTotal: 'Total costs',

    capitalTitle: 'Capital invested',
    capitalHint:
      'Assets acquired in the period. This is INVESTMENT - it is in neither the costs nor the profit above.',

    cyclesTitle: 'Profit per cycle',
    cyclesHint:
      'Cycles closed in the period. Profit here is BEFORE feed and whole-farm costs.',
    cyclesEmpty: 'No cycle was closed in this period.',
    colCycle: 'Cycle',
    colHarvestDate: 'Harvest',
    colRevenue: 'Revenue',
    colFingerling: 'Fingerlings',
    colOperational: 'Operational',
    colNet: 'Profit (before feed)',
    colActions: 'Action',
    viewCycle: 'View',
    flagRevenueMissing: 'Revenue not recorded (counted as 0)',
    flagFingerlingMissing: 'Fingerling cost not recorded (counted as 0)',

    cycleTitle: 'Single-cycle profit',
    cycleHint: 'Any cycle on this farm - running or closed.',
    fieldCycle: 'Cycle',
    fieldCyclePlaceholder: 'Select a cycle…',
    cyclesLoading: 'Loading cycles...',
    cyclePickEmpty: 'This farm has no cycles yet.',
    cyclePrompt: 'Pick a cycle, or press "View" in the per-cycle table.',
    cycleLoading: 'Loading cycle profit...',
    cycleHarvestDate: 'Harvest date',
    cycleRevenue: 'Revenue',
    cycleFingerling: 'Fingerling cost',
    cycleOperational: 'Cycle operational costs',
    cycleBeforeFeedLabel: 'Profit before farm-level feed & shared costs',
    cycleBeforeFeedNote:
      'This is NOT the farm’s final profit: feed and shared whole-farm costs are not in it.',
    cycleActive: 'This cycle is still running - its profit will be available once it is closed.',
  },
} as const;
