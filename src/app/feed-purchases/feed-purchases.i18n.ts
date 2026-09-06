/**
 * Feed Purchases CONTENT only. The chrome around it belongs to AppShell.
 *
 * "Aina ya chakula" and "Katalogi ya Chakula" are the Feed Catalogue's words,
 * reused unchanged: the dropdown here is filled from that catalogue, and the
 * empty-catalogue message sends people to that screen by name. A thing must
 * not change name between the screen that CREATES it and the screen that
 * SPENDS money on it.
 *
 * `costHidden` IS THE EM-DASH, and it is a real piece of copy rather than a
 * literal buried in the template. A missing price here does not mean zero and
 * does not mean nobody entered one - it means the backend withheld it from
 * this reader (`view_feed_cost`, V18). The dash says "not shown to you"
 * without pretending to be a number, which "0" or an empty cell would.
 *
 * `totalConfirm` exists because the total is the one number the form does NOT
 * ask for: the database computes it. Showing it back after a save is how the
 * buyer checks they typed the price they meant, before it becomes a financial
 * record.
 */
export const FEED_PURCHASES_I18N = {
  sw: {
    title: 'Manunuzi ya Chakula',
    subtitle: 'Chakula kilichonunuliwa kwa shamba hili, na kilichoingia stoo',
    loading: 'Inapakia...',
    retry: 'Jaribu tena',
    close: 'Funga',

    colNumber: 'S/No',
    colDate: 'Tarehe',
    colFeedType: 'Aina ya chakula',
    colQuantity: 'Kiasi (kg)',
    colUnitCost: 'Bei kwa kilo',
    colTotalCost: 'Jumla',
    colSupplier: 'Muuzaji',
    /** Bei iliyofichwa na server - SI sifuri, na si "haijawekwa". */
    costHidden: '—',
    noSupplier: 'Haijaandikwa',

    listTitle: 'Manunuzi yaliyorekodiwa',
    emptyTitle: 'Hakuna manunuzi bado',
    emptyMessage: 'Rekodi ununuzi wa kwanza hapa chini. Kila ununuzi unaongeza kilo kwenye stoo.',

    formTitle: 'Rekodi ununuzi',
    formHint: 'Kiasi ulichonunua kinaingia stoo mara moja, kwa aina uliyochagua.',
    fieldFeedType: 'Aina ya chakula',
    fieldFeedTypePlaceholder: 'Chagua aina',
    fieldQuantity: 'Kiasi (kg)',
    fieldUnitCost: 'Bei kwa kilo',
    fieldSupplier: 'Muuzaji',
    fieldSupplierHint: 'Hiari',
    fieldDate: 'Tarehe ya ununuzi',
    submit: 'Rekodi ununuzi',

    errorFeedTypeRequired: 'Chagua aina ya chakula.',
    errorQuantityRequired: 'Andika kiasi cha chakula.',
    errorQuantityPositive: 'Kiasi kiwe zaidi ya sifuri.',
    errorUnitCostRequired: 'Andika bei kwa kilo.',
    errorUnitCostPositive: 'Bei iwe zaidi ya sifuri.',
    errorDateRequired: 'Chagua tarehe ya ununuzi.',

    savedRecordToast: 'Ununuzi umerekodiwa.',
    /** Uthibitisho baada ya kuhifadhi: kiasi x bei = jumla. */
    totalConfirmTitle: 'Ununuzi umerekodiwa',
    totalConfirmTotal: 'Jumla',
    kg: 'kg',
    times: 'x',

    // Katalogi tupu: fomu haiwezi kufanya kazi, na jibu lipo skrini nyingine.
    noFeedTypesTitle: 'Hakuna aina ya chakula kwenye katalogi',
    noFeedTypesMessage:
      'Huwezi kurekodi ununuzi bila aina ya chakula. Sajili aina kwenye katalogi kwanza, kisha urudi hapa.',
    goToFeedCatalog: 'Nenda kwenye katalogi',

    // ------------------------------------------------------------ vitendo
    actions: 'Vitendo',
    cancel: 'Ghairi',
    save: 'Hifadhi',
    colStatus: 'Hali',
    statusActive: 'Hai',
    statusReversed: 'Umebatilishwa',

    edit: 'Rekebisha',
    editTitle: 'Rekebisha ununuzi',
    // Ndilo jambo la msingi la skrini hii: kilo, si safu.
    editWarning:
      'Kurekebisha kunabatilisha ununuzi wa zamani na kurekodi mpya, kwa hatua moja. Salio la stoo linahamia kwenye kiasi kipya, na ununuzi wa zamani unabaki kwenye orodha ukiwa umebatilishwa.',
    savedToast: 'Ununuzi umerekebishwa.',

    reverse: 'Batilisha',
    reverseTitle: 'Batilisha ununuzi?',
    reverseMessage:
      'Kilo zake zitatolewa kwenye salio la stoo kwa rekodi ya kurekebisha. Ununuzi hautafutwa - utabaki kwenye orodha ukionyesha kwamba ulibatilishwa.',
    reverseConfirm: 'Ndiyo, ubatilishe',
    reversedToast: 'Ununuzi umebatilishwa. Kilo zake zimetolewa stoo.',

    // Ununuzi uliobatilishwa hauna kitendo kingine chochote.
    alreadyReversedNotice:
      'Ununuzi huu umebatilishwa, hivyo hauwezi kurekebishwa wala kubatilishwa tena.',
  },
  en: {
    title: 'Feed Purchases',
    subtitle: 'Feed bought for this farm, and what went into the store',
    loading: 'Loading...',
    retry: 'Try again',
    close: 'Close',

    colNumber: 'S/No',
    colDate: 'Date',
    colFeedType: 'Feed type',
    colQuantity: 'Quantity (kg)',
    colUnitCost: 'Price per kg',
    colTotalCost: 'Total',
    colSupplier: 'Supplier',
    /** A price withheld by the server - NOT zero, and not "left blank". */
    costHidden: '—',
    noSupplier: 'Not recorded',

    listTitle: 'Recorded purchases',
    emptyTitle: 'No purchases yet',
    emptyMessage: 'Record the first purchase below. Every purchase adds kilos to the store.',

    formTitle: 'Record a purchase',
    formHint: 'What you bought goes into the store straight away, under the type you choose.',
    fieldFeedType: 'Feed type',
    fieldFeedTypePlaceholder: 'Choose a type',
    fieldQuantity: 'Quantity (kg)',
    fieldUnitCost: 'Price per kg',
    fieldSupplier: 'Supplier',
    fieldSupplierHint: 'Optional',
    fieldDate: 'Purchase date',
    submit: 'Record purchase',

    errorFeedTypeRequired: 'Choose a feed type.',
    errorQuantityRequired: 'Enter the quantity bought.',
    errorQuantityPositive: 'The quantity must be more than zero.',
    errorUnitCostRequired: 'Enter the price per kg.',
    errorUnitCostPositive: 'The price must be more than zero.',
    errorDateRequired: 'Choose the purchase date.',

    savedRecordToast: 'Purchase recorded.',
    totalConfirmTitle: 'Purchase recorded',
    totalConfirmTotal: 'Total',
    kg: 'kg',
    times: 'x',

    noFeedTypesTitle: 'No feed types in the catalogue',
    noFeedTypesMessage:
      'A purchase needs a feed type. Register one in the catalogue first, then come back here.',
    goToFeedCatalog: 'Go to the catalogue',

    actions: 'Actions',
    cancel: 'Cancel',
    save: 'Save',
    colStatus: 'Status',
    statusActive: 'Active',
    statusReversed: 'Reversed',

    edit: 'Correct',
    editTitle: 'Correct this purchase',
    editWarning:
      'Correcting cancels the old purchase and records a new one, in a single step. The stock balance moves to the new quantity, and the old purchase stays in the list marked as reversed.',
    savedToast: 'Purchase corrected.',

    reverse: 'Reverse',
    reverseTitle: 'Reverse this purchase?',
    reverseMessage:
      'Its kilos will be taken back out of the stock balance by a correcting entry. The purchase is not deleted - it stays in the list, shown as reversed.',
    reverseConfirm: 'Yes, reverse it',
    reversedToast: 'Purchase reversed. Its kilos are out of the store.',

    alreadyReversedNotice:
      'This purchase has been reversed, so it cannot be corrected or reversed again.',
  },
} as const;
