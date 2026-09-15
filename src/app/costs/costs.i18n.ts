/**
 * Operational Costs CONTENT only. The chrome around it belongs to AppShell.
 *
 * "Gharama za Uendeshaji" throughout, and the nav entry uses the same words.
 *
 * `wholeFarm` is THE marker of this screen: a cost with no cycle is a
 * whole-farm cost (umeme, kodi, mshahara wa mlinzi), not a cost whose cycle
 * went missing - so it is named, never left blank.
 *
 * `errorCategoryTaken` is OUR copy, for the same reason as Assets: a DELETED
 * category still holds its name. The backend's VALIDATION_ERROR sentences are
 * shown verbatim instead (see the component).
 */
export const COSTS_I18N = {
  sw: {
    title: 'Gharama za Uendeshaji',
    subtitle: 'Fedha zilizotumika kuendesha mashamba yako yote - kwa mzunguko, au kwa shamba zima',
    loading: 'Inapakia...',
    retry: 'Jaribu tena',

    colNumber: 'S/No',
    colCategory: 'Aina',
    colAttribution: 'Ya nini',
    colAmount: 'Kiasi',
    colDate: 'Tarehe',
    colDescription: 'Maelezo',
    noDescription: '—',
    wholeFarm: 'Shamba zima',

    listTitle: 'Gharama zilizorekodiwa',
    listHint:
      'Daftari ni la kampuni nzima, si la shamba teule. Ndani ya kila shamba, gharama za kila mzunguko zinajumlishwa peke yake, na gharama za shamba zima (umeme, kodi) peke yake.',
    costCount: (count: number) => `gharama ${count}`,
    breakdownTitle: 'Mgawanyo',
    wholeFarmSubtotal: 'Gharama za shamba zima',
    cycleSubtotal: (label: string) => `Mzunguko ${label}`,
    farmTotal: 'Jumla ya shamba',
    grandTotal: 'Jumla ya kampuni (mashamba yote)',

    emptyTitle: 'Hakuna gharama iliyorekodiwa bado',
    emptyMessage:
      'Rekodi gharama ya kwanza kwa fomu iliyo hapa chini - bili ya umeme, mafuta, mshahara, dawa. Jumla ya kila shamba na kila mzunguko itaonekana hapa.',
    emptyMessageNoCategories:
      'Anza kwa kuunda aina ya gharama (mfano: Umeme, Mishahara, Dawa) hapa chini, kisha rekodi gharama ya kwanza. Jumla ya kila shamba itaonekana hapa.',

    categoriesTitle: 'Aina za gharama',
    categoriesHint:
      'Aina ni za mfumo mzima na mnaziunda wenyewe. Kila gharama lazima iwe na aina moja.',
    categoriesEmpty:
      'Hakuna aina ya gharama bado. Unda ya kwanza hapa - fomu ya kurekodi gharama inaihitaji.',
    fieldCategoryName: 'Jina la aina mpya',
    fieldCategoryNameHint: 'Mfano: Umeme',
    addCategory: 'Ongeza aina',
    errorCategoryNameRequired: 'Andika jina la aina ya gharama.',
    errorCategoryNameTooLong: 'Jina la aina lisizidi herufi 80.',
    errorCategoryTaken:
      'Jina limechukuliwa. Hata aina iliyofutwa inabaki na jina lake - chagua jina jingine.',
    categoryCreatedToast: 'Aina ya gharama imeundwa.',

    needsCategoryTitle: 'Unda aina ya gharama kwanza',
    needsCategoryMessage:
      'Kila gharama lazima iwe na aina, na bado hakuna aina yoyote. Unda moja kwenye sehemu ya "Aina za gharama" hapo juu - fomu ya kurekodi itatokea hapa mara moja.',

    noFarmTitle: 'Hakuna shamba la kurekodia gharama',
    noFarmMessage:
      'Akaunti yako haijawekwa kwenye shamba lolote bado, na kila gharama lazima iwe ya shamba. Mwombe msimamizi akuweke kwenye shamba.',
    noFarmMessageRoot:
      'Chagua shamba kwenye kichaguzi cha juu kwanza - kila gharama lazima iwe ya shamba.',

    formTitle: 'Rekodi gharama',
    formHint:
      'Tarehe ya zamani inakubalika - bili ya mwezi uliopita inaingizwa leo. Tarehe ya baadaye haikubaliki: gharama isiyotokea bado ni bajeti.',
    fieldFarm: 'Shamba',
    fieldFarmPlaceholder: 'Chagua shamba…',
    fieldAttribution: 'Gharama hii ni ya nini?',
    attributionCycle: 'Ni ya mzunguko mmoja maalum',
    attributionCycleHint: 'Mfano: vifaranga, dawa ya tanki moja',
    attributionFarm: 'Ni ya shamba zima',
    attributionFarmHint: 'Mfano: umeme, kodi, mshahara wa mlinzi',
    fieldCycle: 'Mzunguko',
    fieldCyclePlaceholder: 'Chagua mzunguko…',
    cycleHint: 'Mizunguko iliyofungwa imo pia - bili nyingi hufika baada ya mavuno.',
    cyclesLoading: 'Inapakia mizunguko ya shamba hili...',
    cyclesEmpty: 'Shamba hili halina mzunguko wowote bado. Rekodi gharama hii kama ya shamba zima.',
    chooseFarmFirst: 'Chagua shamba kwanza ili kuona mizunguko yake.',
    fieldCategory: 'Aina ya gharama',
    fieldCategoryPlaceholder: 'Chagua aina…',
    fieldAmount: 'Kiasi',
    fieldDate: 'Tarehe ya gharama',
    fieldDescription: 'Maelezo (hiari)',
    fieldDescriptionHint: 'Mfano: LUKU ya Machi',
    submit: 'Rekodi gharama',

    errorFarmRequired: 'Chagua shamba la gharama hii.',
    errorAttributionRequired: 'Chagua kama gharama hii ni ya mzunguko mmoja au ya shamba zima.',
    errorCycleRequired: 'Chagua mzunguko - au badilisha iwe gharama ya shamba zima.',
    errorCategoryRequired: 'Chagua aina ya gharama.',
    errorAmountRequired: 'Andika kiasi cha gharama.',
    errorAmountPositive: 'Kiasi lazima kiwe zaidi ya sifuri.',
    errorAmountTooLarge: 'Kiasi hakiwezi kuzidi 999,999,999,999.99.',
    errorDateRequired: 'Chagua tarehe ya gharama.',
    errorDateFuture:
      'Tarehe ya gharama haiwezi kuwa ya baadaye. Gharama isiyotokea bado ni bajeti, si matumizi.',

    createdToast: 'Gharama imerekodiwa.',

    // Rail ya muhtasari. Kalenda haigharimu ombi: kila gharama ina `costDate`
    // yake, hivyo tarehe ni chujio la taarifa zilizopo skrini tayari.
    introTitle: 'Gharama za Uendeshaji',
    introBody:
      'Fedha zinazotoka kuendesha mashamba - na kama gharama ni ya mzunguko mmoja au ya shamba zima.',
    introStep1: 'Unda aina ya gharama (Umeme, Usafiri, Mishahara) kama haipo.',
    introStep2: 'Chagua shamba, kisha sema ni ya mzunguko gani au ya shamba zima.',
    introStep3: 'Andika kiasi na tarehe. Jumla za kila mzunguko zinajihesabu zenyewe.',
    railWeekTitle: 'Chagua tarehe',
    railTitle: 'Muhtasari wa gharama',
    railCostsAll: 'Gharama zote',
    railCostsOnDate: 'Za tarehe hii',
    railAmountOnDate: 'Kiasi cha tarehe hii',
    railAmountAll: 'Kiasi chote',
    railSplitTitle: 'Mgawanyo wa fedha',
    railSplitCycle: 'Za mizunguko',
    railSplitFarm: 'Za shamba zima',
    /** Mgawanyo na aina ni sura ya daftari zima, si ya siku moja - angalia component. */
    railSplitHint: 'Kadi hii na ya aina zinahesabu daftari zima, si tarehe uliyochagua.',
    railCategoriesTitle: 'Fedha zinakoenda',
    railCategoriesEmpty: 'Hakuna gharama iliyorekodiwa bado.',
    railCategoriesMore: (count: number) => `na aina nyingine ${count}`,
    weekdayLabels: ['Jtat', 'Jnne', 'Jtan', 'Alh', 'Ijm', 'Jmos', 'Jpil'],
    weekPrevious: 'Wiki iliyopita',
    weekNext: 'Wiki ijayo',
    daySelect: 'Onyesha tarehe',
    dayBackToToday: 'Rudi leo',
    dayViewing: 'Unaona tarehe',
  },
  en: {
    title: 'Operational Costs',
    subtitle: 'Money spent running all your farms - per cycle, or for the whole farm',
    loading: 'Loading...',
    retry: 'Try again',

    colNumber: 'S/No',
    colCategory: 'Category',
    colAttribution: 'For',
    colAmount: 'Amount',
    colDate: 'Date',
    colDescription: 'Description',
    noDescription: '—',
    wholeFarm: 'Whole farm',

    listTitle: 'Recorded costs',
    listHint:
      'The register is company-wide, not the selected farm. Within each farm, each cycle’s costs are subtotalled on their own, and the whole-farm costs (electricity, rent) on their own.',
    costCount: (count: number) => (count === 1 ? '1 cost' : `${count} costs`),
    breakdownTitle: 'Breakdown',
    wholeFarmSubtotal: 'Whole-farm costs',
    cycleSubtotal: (label: string) => `Cycle ${label}`,
    farmTotal: 'Farm total',
    grandTotal: 'Company total (all farms)',

    emptyTitle: 'No costs recorded yet',
    emptyMessage:
      'Record the first one with the form below - an electricity bill, fuel, wages, medicine. Each farm’s and each cycle’s total will appear here.',
    emptyMessageNoCategories:
      'Start by creating a cost category (for example: Electricity, Wages, Medicine) below, then record the first cost. Each farm’s total will appear here.',

    categoriesTitle: 'Cost categories',
    categoriesHint: 'Categories are system-wide and created by you. Every cost needs exactly one.',
    categoriesEmpty: 'No cost categories yet. Create the first one here - the cost form needs it.',
    fieldCategoryName: 'New category name',
    fieldCategoryNameHint: 'For example: Electricity',
    addCategory: 'Add category',
    errorCategoryNameRequired: 'Enter a name for the category.',
    errorCategoryNameTooLong: 'The category name must be 80 characters or fewer.',
    errorCategoryTaken:
      'That name is taken. Even a deleted category keeps its name - choose a different one.',
    categoryCreatedToast: 'Cost category created.',

    needsCategoryTitle: 'Create a cost category first',
    needsCategoryMessage:
      'Every cost needs a category, and there are none yet. Create one in "Cost categories" above - the form will appear here straight away.',

    noFarmTitle: 'No farm to record costs on',
    noFarmMessage:
      'Your account is not assigned to a farm yet, and every cost belongs to a farm. Ask an administrator to add you to one.',
    noFarmMessageRoot:
      'Pick a farm in the switcher at the top first - every cost belongs to a farm.',

    formTitle: 'Record a cost',
    formHint:
      'Past dates are fine - last month’s bill gets entered today. A future date is not accepted: a cost that has not happened yet is a budget.',
    fieldFarm: 'Farm',
    fieldFarmPlaceholder: 'Select a farm…',
    fieldAttribution: 'What is this cost for?',
    attributionCycle: 'This cost is for a specific cycle',
    attributionCycleHint: 'For example: fingerlings, one tank’s medicine',
    attributionFarm: 'This is a whole-farm cost',
    attributionFarmHint: 'For example: electricity, rent, a guard’s wage',
    fieldCycle: 'Cycle',
    fieldCyclePlaceholder: 'Select a cycle…',
    cycleHint: 'Closed cycles are listed too - many bills arrive after the harvest.',
    cyclesLoading: 'Loading this farm’s cycles...',
    cyclesEmpty: 'This farm has no cycles yet. Record this as a whole-farm cost.',
    chooseFarmFirst: 'Choose a farm first to see its cycles.',
    fieldCategory: 'Category',
    fieldCategoryPlaceholder: 'Select a category…',
    fieldAmount: 'Amount',
    fieldDate: 'Cost date',
    fieldDescription: 'Description (optional)',
    fieldDescriptionHint: 'For example: March electricity',
    submit: 'Record cost',

    errorFarmRequired: 'Choose the farm this cost belongs to.',
    errorAttributionRequired: 'Choose whether this cost is for one cycle or the whole farm.',
    errorCycleRequired: 'Choose a cycle - or make it a whole-farm cost.',
    errorCategoryRequired: 'Choose a category.',
    errorAmountRequired: 'Enter the amount.',
    errorAmountPositive: 'The amount must be above zero.',
    errorAmountTooLarge: 'The amount cannot exceed 999,999,999,999.99.',
    errorDateRequired: 'Choose the date of the cost.',
    errorDateFuture:
      'The cost date cannot be in the future. A cost that has not happened yet is a budget, not spending.',

    createdToast: 'Cost recorded.',

    introTitle: 'Operational Costs',
    introBody:
      'The money it takes to run the farms - and whether a cost belongs to one cycle or to the whole farm.',
    introStep1: 'Create a cost category (Electricity, Transport, Wages) if there is none.',
    introStep2: 'Pick the farm, then say whether it is a cycle cost or a whole-farm cost.',
    introStep3: 'Enter the amount and the date. Every subtotal is worked out for you.',
    railWeekTitle: 'Pick a date',
    railTitle: 'Cost summary',
    railCostsAll: 'All costs',
    railCostsOnDate: 'On this date',
    railAmountOnDate: 'Amount on this date',
    railAmountAll: 'Amount in total',
    railSplitTitle: 'Where it is charged',
    railSplitCycle: 'To cycles',
    railSplitFarm: 'To whole farms',
    railSplitHint:
      'This card and the categories below count the whole register, not the date you picked.',
    railCategoriesTitle: 'Where the money goes',
    railCategoriesEmpty: 'No costs recorded yet.',
    railCategoriesMore: (count: number) =>
      `and ${count} more ${count === 1 ? 'category' : 'categories'}`,
    weekdayLabels: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
    weekPrevious: 'Previous week',
    weekNext: 'Next week',
    daySelect: 'Show date',
    dayBackToToday: 'Back to today',
    dayViewing: 'Showing',
  },
} as const;
