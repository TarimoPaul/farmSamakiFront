/**
 * Asset Register CONTENT only. The chrome around it belongs to AppShell.
 *
 * "Mali" throughout, and the nav entry uses the same "Daftari la Mali" as the
 * title, so the screen does not change name between the two.
 *
 * `errorCategoryTaken` is OUR copy, for the same reason as Species: the
 * backend's sentence is specific but leaves out the part that confuses people
 * - a DELETED category still holds its name, because the row is still there
 * and the column is UNIQUE.
 *
 * The backend's VALIDATION_ERROR sentences are shown verbatim instead (see
 * the component): they name the field and the limit - for a future date,
 * both the date sent and the server's today - which no generic line could.
 */
export const ASSETS_I18N = {
  sw: {
    title: 'Daftari la Mali',
    subtitle: 'Kila kitu kampuni inachomiliki, kwenye mashamba yako yote - kimepangwa kwa shamba',
    loading: 'Inapakia...',
    retry: 'Jaribu tena',

    colNumber: 'S/No',
    colName: 'Mali',
    colCategory: 'Aina',
    colCost: 'Bei ya kununulia',
    colSize: 'Ukubwa',
    colAcquired: 'Tarehe ya kupata',
    noSize: '—',

    listTitle: 'Mali zilizoandikishwa',
    listHint:
      'Daftari ni la kampuni nzima, si la shamba teule: linaonyesha mali za kila shamba ulilo mwanachama au mmiliki wake.',
    assetCount: (count: number) => `mali ${count}`,
    farmTotal: 'Jumla ya shamba',
    grandTotal: 'Jumla ya kampuni (mashamba yote)',

    emptyTitle: 'Hakuna mali iliyoandikishwa bado',
    emptyMessage:
      'Andikisha mali ya kwanza kwa fomu iliyo hapa chini - jenereta, pikipiki, tanki, jengo. Jumla ya kila shamba itaonekana hapa.',
    emptyMessageNoCategories:
      'Anza kwa kuunda aina ya mali (mfano: Mashine, Magari, Majengo) hapa chini, kisha andikisha mali ya kwanza. Jumla ya kila shamba itaonekana hapa.',

    categoriesTitle: 'Aina za mali',
    categoriesHint:
      'Aina ni za mfumo mzima na mnaziunda wenyewe. Kila mali lazima iwe na aina moja.',
    categoriesEmpty:
      'Hakuna aina ya mali bado. Unda ya kwanza hapa - fomu ya kuandikisha mali inaihitaji.',
    fieldCategoryName: 'Jina la aina mpya',
    fieldCategoryNameHint: 'Mfano: Mashine',
    addCategory: 'Ongeza aina',
    errorCategoryNameRequired: 'Andika jina la aina ya mali.',
    errorCategoryNameTooLong: 'Jina la aina lisizidi herufi 80.',
    errorCategoryTaken:
      'Jina limechukuliwa. Hata aina iliyofutwa inabaki na jina lake - chagua jina jingine.',
    categoryCreatedToast: 'Aina ya mali imeundwa.',

    needsCategoryTitle: 'Unda aina ya mali kwanza',
    needsCategoryMessage:
      'Kila mali lazima iwe na aina, na bado hakuna aina yoyote. Unda moja kwenye sehemu ya "Aina za mali" hapo juu - fomu ya kuandikisha itatokea hapa mara moja.',

    noFarmTitle: 'Hakuna shamba la kuandikishia mali',
    noFarmMessage:
      'Akaunti yako haijawekwa kwenye shamba lolote bado, na kila mali lazima iwe ya shamba. Mwombe msimamizi akuweke kwenye shamba.',
    noFarmMessageRoot:
      'Chagua shamba kwenye kichaguzi cha juu kwanza - kila mali lazima iwe ya shamba.',

    formTitle: 'Andikisha mali',
    formHint:
      'Tarehe ya zamani inakubalika - daftari linaweza kuanzishwa leo kwa vitu vilivyonunuliwa miaka iliyopita. Tarehe ya baadaye haikubaliki.',
    fieldName: 'Jina la mali',
    fieldNameHint: 'Mfano: Jenereta ya 20HP',
    fieldFarm: 'Shamba',
    fieldFarmPlaceholder: 'Chagua shamba…',
    fieldCategory: 'Aina ya mali',
    fieldCategoryPlaceholder: 'Chagua aina…',
    fieldCost: 'Bei ya kununulia',
    fieldDate: 'Tarehe ya kupata',
    fieldSize: 'Ukubwa (hiari)',
    fieldSizeHint: 'Mfano: 5000L, ekari 2, 20HP',
    submit: 'Andikisha',

    errorNameRequired: 'Andika jina la mali.',
    errorNameTooLong: 'Jina la mali lisizidi herufi 150.',
    errorFarmRequired: 'Chagua shamba la mali hii.',
    errorCategoryRequired: 'Chagua aina ya mali.',
    errorCostRequired: 'Andika bei ya kununulia.',
    errorCostPositive: 'Bei lazima iwe zaidi ya sifuri.',
    errorDateRequired: 'Chagua tarehe ya kupata mali.',
    errorDateFuture:
      'Tarehe ya kupata haiwezi kuwa ya baadaye. Kitu ambacho bado hakijanunuliwa si mali.',
    errorSizeTooLong: 'Lebo ya ukubwa isizidi herufi 80.',

    createdToast: 'Mali imeandikishwa.',
  },
  en: {
    title: 'Asset Register',
    subtitle: 'Everything the company owns, across all your farms - grouped by farm',
    loading: 'Loading...',
    retry: 'Try again',

    colNumber: 'S/No',
    colName: 'Asset',
    colCategory: 'Category',
    colCost: 'Purchase cost',
    colSize: 'Size',
    colAcquired: 'Acquired',
    noSize: '—',

    listTitle: 'Registered assets',
    listHint:
      'The register is company-wide, not the selected farm: it shows the assets of every farm you are a member or owner of.',
    assetCount: (count: number) => (count === 1 ? '1 asset' : `${count} assets`),
    farmTotal: 'Farm total',
    grandTotal: 'Company total (all farms)',

    emptyTitle: 'No assets registered yet',
    emptyMessage:
      'Register the first one with the form below - a generator, a motorbike, a tank, a building. Each farm’s total will appear here.',
    emptyMessageNoCategories:
      'Start by creating an asset category (for example: Machinery, Vehicles, Buildings) below, then register the first asset. Each farm’s total will appear here.',

    categoriesTitle: 'Asset categories',
    categoriesHint:
      'Categories are system-wide and created by you. Every asset needs exactly one.',
    categoriesEmpty:
      'No asset categories yet. Create the first one here - the asset form needs it.',
    fieldCategoryName: 'New category name',
    fieldCategoryNameHint: 'For example: Machinery',
    addCategory: 'Add category',
    errorCategoryNameRequired: 'Enter a name for the category.',
    errorCategoryNameTooLong: 'The category name must be 80 characters or fewer.',
    errorCategoryTaken:
      'That name is taken. Even a deleted category keeps its name - choose a different one.',
    categoryCreatedToast: 'Asset category created.',

    needsCategoryTitle: 'Create an asset category first',
    needsCategoryMessage:
      'Every asset needs a category, and there are none yet. Create one in "Asset categories" above - the registration form will appear here straight away.',

    noFarmTitle: 'No farm to register assets on',
    noFarmMessage:
      'Your account is not assigned to a farm yet, and every asset belongs to a farm. Ask an administrator to add you to one.',
    noFarmMessageRoot: 'Pick a farm in the switcher at the top first - every asset belongs to a farm.',

    formTitle: 'Register an asset',
    formHint:
      'Past dates are fine - the register can be started today for things bought years ago. A future date is not accepted.',
    fieldName: 'Asset name',
    fieldNameHint: 'For example: 20HP generator',
    fieldFarm: 'Farm',
    fieldFarmPlaceholder: 'Select a farm…',
    fieldCategory: 'Category',
    fieldCategoryPlaceholder: 'Select a category…',
    fieldCost: 'Purchase cost',
    fieldDate: 'Date acquired',
    fieldSize: 'Size (optional)',
    fieldSizeHint: 'For example: 5000L, 2 acres, 20HP',
    submit: 'Register',

    errorNameRequired: 'Enter a name for the asset.',
    errorNameTooLong: 'The asset name must be 150 characters or fewer.',
    errorFarmRequired: 'Choose the farm this asset belongs to.',
    errorCategoryRequired: 'Choose a category.',
    errorCostRequired: 'Enter the purchase cost.',
    errorCostPositive: 'The cost must be above zero.',
    errorDateRequired: 'Choose the date the asset was acquired.',
    errorDateFuture:
      'The acquired date cannot be in the future. Something not yet bought is not an asset.',
    errorSizeTooLong: 'The size label must be 80 characters or fewer.',

    createdToast: 'Asset registered.',
  },
} as const;
