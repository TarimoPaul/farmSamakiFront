/**
 * Feeding, in both languages.
 *
 * The two objects carry the SAME KEYS, always - `feeding.spec.ts` asserts it,
 * because a key present in one and missing from the other renders as
 * `undefined` on somebody's screen and nothing else in the build would notice.
 */
export const FEEDING_I18N = {
  sw: {
    title: 'Malisho',
    subtitle: 'Rekodi ya kulisha kwa mzunguko uliochaguliwa',
    loading: 'Inapakia...',
    retry: 'Jaribu tena',

    noCycleTitle: 'Hujachagua mzunguko',
    noCycleMessage:
      'Kulisha ni kwa mzunguko mmoja. Nenda kwenye Uzalishaji, chagua mzunguko, kisha urudi hapa.',
    goToProduction: 'Nenda kwenye Uzalishaji',

    contextLabel: 'Unalisha',
    contextUnit: 'Kitengo',
    contextAge: 'Umri wa samaki',
    // Dirisha la umri kwenye katalogi: "miezi 0-2". Pande zote mbili
    // zinahusishwa, na chakula cha vifaranga [0, 0] kinaonekana "miezi 0-0".
    ageMonths: 'miezi',

    formTitle: 'Rekodi kulisha',
    formHint: 'Chagua chakula, andika kiasi kwa kilo, kisha hifadhi.',
    fieldFeedType: 'Aina ya chakula',
    fieldFeedTypePlaceholder: 'Chagua chakula',
    fieldQuantity: 'Kiasi (kg)',
    fieldDate: 'Tarehe',
    submit: 'Hifadhi',
    submitConfirm: 'Ndiyo, hifadhi',
    cancelConfirm: 'Ghairi',
    savedToast: 'Kulisha kumehifadhiwa.',

    // Ukifika hapa kutoka kwenye kazi ya kulisha (Kazi za Kila Siku).
    taskContextTitle: 'Unarekodi kwa ajili ya kazi',
    taskContextFallback: 'Kazi ya kulisha',
    taskContextHint: 'Ukihifadhi, ulishaji utarekodiwa NA kazi hii itakamilika - kwa pamoja.',
    taskContextAlreadyClosed:
      'Kazi hii tayari imekamilika au imefungwa kwa siku hii. Hakuna cha kuhifadhi hapa.',
    backToTasks: 'Rudi kwenye kazi',

    // Utoshelevu wa chakula kwa umri wa samaki - jibu la seva, si hesabu yetu.
    suitabilitySafeLowerTag: 'chakula cha samaki wadogo',
    suitabilitySafeLowerNote: 'chakula cha samaki wadogo — hawa watakula lakini si bora',
    safeLowerConfirm:
      'Umechagua chakula cha samaki wadogo. Watakula, lakini si bora kwa umri wao. Bonyeza tena kuhifadhi.',
    noSuitableFeedTitle: 'Hakuna chakula sahihi',
    // Sentensi hii HAIMWAMBII msomaji afanye kitu chochote: nani anaweza
    // kukifanya inategemea ruhusa yake, na hilo linasemwa na kitufe au na
    // `noSuitableFeedAskManager` hapa chini, si na ujumbe wenyewe.
    noSuitableFeedMessage: 'hakuna chakula sahihi kwa umri wa cycle hii',
    goToFeedCatalog: 'Sajili aina ya chakula',
    noSuitableFeedAskManager:
      'Mwambie msimamizi wa shamba asajili aina inayofaa umri huu kwenye katalogi ya chakula.',

    errorFeedTypeRequired: 'Chagua aina ya chakula.',
    errorQuantityRequired: 'Andika kiasi cha chakula.',
    errorQuantityPositive: 'Kiasi lazima kiwe zaidi ya sifuri.',
    errorDateRequired: 'Chagua tarehe.',

    stockTitle: 'Chakula kilichobaki',
    stockColFeedType: 'Aina ya chakula',
    stockColRemaining: 'Kilichobaki (kg)',
    stockNegativeNote: 'stock imezidiwa — rekodi manunuzi',
    stockLowBanner: 'Chakula kinakaribia kuisha:',
    stockEmptyTitle: 'Hakuna stock bado',
    stockEmptyMessage: 'Manunuzi ya kwanza ya chakula yataonekana hapa.',

    listTitle: 'Kulisha kwa karibuni',
    // Rail ya muhtasari. Kalenda haigharimu ombi: kila kulisha kuna logDate
    // yake, hivyo tarehe inachuja kilichopo tayari.
    introTitle: 'Malisho',
    introBody: 'Kulisha kwa mzunguko uliouchagua - kiasi, aina ya chakula, na salio lililobaki.',
    introStep1: 'Chagua mzunguko kwenye Uzalishaji - ndio unaolishwa hapa.',
    introStep2: 'Chagua chakula - orodha inaonyesha kinachofaa UMRI wa samaki hawa pekee.',
    introStep3: 'Rekodi kiasi kwa kilo. Salio la stoo linapungua lenyewe.',
    railWeekTitle: 'Chagua tarehe',
    railTitle: 'Muhtasari wa kulisha',
    railFeedingsAll: 'Kulisha kote',
    railFeedingsOnDate: 'Kwa tarehe hii',
    railKgOnDate: 'Kilo za tarehe hii',
    railKgAll: 'Kilo zote',
    railStockTitle: 'Salio la stoo',
    railStockEmpty: 'Hakuna chakula stoo.',
    weekdayLabels: ['Jtat', 'Jnne', 'Jtan', 'Alh', 'Ijm', 'Jmos', 'Jpil'],
    weekPrevious: 'Wiki iliyopita',
    weekNext: 'Wiki ijayo',
    daySelect: 'Onyesha tarehe',
    dayBackToToday: 'Rudi leo',
    dayViewing: 'Unaona tarehe',
    colNumber: 'S/No',
    colDate: 'Tarehe',
    colFeedType: 'Chakula',
    colQuantity: 'Kiasi (kg)',
    colRecordedBy: 'Amerekodi',
    blank: '—',
    listEmptyTitle: 'Hakuna kulisha bado',
    listEmptyMessage: 'Kulisha kwa kwanza kwa mzunguko huu kutaonekana hapa.',
  },
  en: {
    title: 'Feeding',
    subtitle: 'Feeding records for the selected cycle',
    loading: 'Loading...',
    retry: 'Try again',

    noCycleTitle: 'No cycle selected',
    noCycleMessage:
      'A feeding belongs to one cycle. Go to Production, pick a cycle, then come back here.',
    goToProduction: 'Go to Production',

    contextLabel: 'Feeding',
    contextUnit: 'Unit',
    contextAge: 'Fish age',
    // The catalogue's age window: "months 0-2". Both ends inclusive, and fry
    // feed's [0, 0] renders as "months 0-0" rather than as a blank.
    ageMonths: 'months',

    formTitle: 'Record a feeding',
    formHint: 'Pick the feed, enter the amount in kilograms, then save.',
    fieldFeedType: 'Feed type',
    fieldFeedTypePlaceholder: 'Choose a feed',
    fieldQuantity: 'Amount (kg)',
    fieldDate: 'Date',
    submit: 'Save',
    submitConfirm: 'Yes, save it',
    cancelConfirm: 'Cancel',
    savedToast: 'Feeding saved.',

    // Arriving here from a feeding task (Daily Tasks).
    taskContextTitle: 'Recording for a task',
    taskContextFallback: 'Feeding task',
    taskContextHint: 'Saving records the feeding AND completes this task - together.',
    taskContextAlreadyClosed:
      'This task is already done or closed for this day. There is nothing to save here.',
    backToTasks: 'Back to tasks',

    // Suitability is the SERVER'S judgement about the age of the fish in this
    // cycle, not a calculation of ours - these lines only report it.
    suitabilitySafeLowerTag: 'feed for younger fish',
    suitabilitySafeLowerNote: 'feed for younger fish — acceptable, not ideal',
    safeLowerConfirm:
      'This is feed for younger fish. They will eat it, but it is not ideal for their age. Press again to save.',
    noSuitableFeedTitle: 'No suitable feed',
    noSuitableFeedMessage: 'no feed in the store suits the age of this cycle',
    goToFeedCatalog: 'Register a feed type',
    noSuitableFeedAskManager:
      'Ask your farm manager to register a feed type for this age in the feed catalogue.',

    errorFeedTypeRequired: 'Choose a feed type.',
    errorQuantityRequired: 'Enter the amount of feed.',
    errorQuantityPositive: 'The amount must be greater than zero.',
    errorDateRequired: 'Choose a date.',

    stockTitle: 'Feed remaining',
    stockColFeedType: 'Feed type',
    stockColRemaining: 'Remaining (kg)',
    stockNegativeNote: 'stock overdrawn — record a purchase',
    stockLowBanner: 'Running low:',
    stockEmptyTitle: 'No stock yet',
    stockEmptyMessage: 'The first feed purchase will appear here.',

    listTitle: 'Recent feedings',
    introTitle: 'Feeding',
    introBody:
      'The feedings for the cycle you selected - how much, which feed, and what is left in store.',
    introStep1: 'Select a cycle on Production - it is the one fed here.',
    introStep2: 'Pick a feed - the list only offers what suits the AGE of these fish.',
    introStep3: 'Record the amount in kilograms. The stock balance follows by itself.',
    railWeekTitle: 'Pick a date',
    railTitle: 'Feeding summary',
    railFeedingsAll: 'All feedings',
    railFeedingsOnDate: 'On this date',
    railKgOnDate: 'Kg on this date',
    railKgAll: 'Kg in total',
    railStockTitle: 'Stock balance',
    railStockEmpty: 'No feed in store.',
    weekdayLabels: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
    weekPrevious: 'Previous week',
    weekNext: 'Next week',
    daySelect: 'Show date',
    dayBackToToday: 'Back to today',
    dayViewing: 'Showing',
    colNumber: 'S/No',
    colDate: 'Date',
    colFeedType: 'Feed',
    colQuantity: 'Amount (kg)',
    colRecordedBy: 'Recorded by',
    blank: '—',
    listEmptyTitle: 'No feedings yet',
    listEmptyMessage: 'The first feeding for this cycle will appear here.',
  },
} as const;
