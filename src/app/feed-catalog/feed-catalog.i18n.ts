/**
 * Feed Catalogue CONTENT only. The chrome around it belongs to AppShell.
 *
 * "Aina ya chakula" throughout, matching the Feeding screen's dropdown label -
 * the thing being registered here is the thing that fills that dropdown, and
 * it must not change name between the two screens.
 *
 * THE AGE WINDOW IS THE POINT, and the copy says so rather than leaving it to
 * be inferred from two number boxes. It is the only field on a feed type that
 * decides anything: it is what makes a feed EXACT for one pond and SAFE_LOWER
 * for the next, and it is why a cycle can end up with no suitable feed at all.
 * Both ends are INCLUSIVE - fry feed is 0 to 0, which is a real window and not
 * an unfilled form - and the hints say that in words, because "0 hadi 0" looks
 * like a mistake to somebody who has not been told.
 *
 * `errorNameTaken` is OUR copy, not the backend's. A duplicate name is a
 * database unique constraint, so it arrives as a generic CONFLICT ("Taarifa
 * hizi zinagongana na zilizopo tayari") that never mentions the name. The
 * max<min refusal is the opposite case and keeps the backend's sentence: it
 * names both numbers, which is more than anything written here could.
 */
export const FEED_CATALOG_I18N = {
  sw: {
    title: 'Katalogi ya Chakula',
    subtitle: 'Aina za chakula zinazopatikana kwa mashamba yote, na umri zinaofaa',
    loading: 'Inapakia...',
    retry: 'Jaribu tena',

    colNumber: 'S/No',
    colName: 'Aina ya chakula',
    colAgeWindow: 'Umri unaofaa',
    colStatus: 'Hali',
    statusActive: 'Inatumika',
    statusInactive: 'Imezimwa',
    /** Kiambishi cha dirisha la umri: "miezi 0-3". */
    ageWindowUnit: 'miezi',

    emptyTitle: 'Hakuna aina ya chakula bado',
    emptyMessage:
      'Sajili aina ya kwanza hapa chini. Hadi ifanyike, hakuna chakula cha kuchagua kwenye ukurasa wa Malisho.',

    listTitle: 'Aina zilizosajiliwa',

    formTitle: 'Sajili aina ya chakula',
    formHint: 'Katalogi ni ya mfumo mzima: aina utakayosajili itaonekana kwa kila shamba.',
    fieldName: 'Jina la aina',
    fieldNameHint: 'Mfano: Pellet 3mm',
    fieldMinAge: 'Umri wa chini (miezi)',
    fieldMaxAge: 'Umri wa juu (miezi)',
    ageHint:
      'Pande zote mbili zinahusishwa. Chakula cha vifaranga ni 0 hadi 0 - si fomu isiyojazwa.',
    submit: 'Sajili',

    errorNameRequired: 'Andika jina la aina ya chakula.',
    errorNameTooLong: 'Jina lisizidi herufi 80.',
    errorNameTaken: 'Aina yenye jina hili tayari ipo kwenye katalogi.',
    errorAgeRequired: 'Jaza umri wa chini na wa juu.',
    errorAgeInteger: 'Umri uwe namba nzima ya miezi, si sehemu.',
    errorAgeNegative: 'Umri hauwezi kuwa pungufu ya sifuri.',
    errorMaxBelowMin: 'Umri wa juu hauwezi kuwa chini ya umri wa chini.',

    createdToast: 'Aina ya chakula imesajiliwa.',

    // ------------------------------------------------------------ vitendo
    actions: 'Vitendo',
    close: 'Funga',
    cancel: 'Ghairi',
    save: 'Hifadhi',

    edit: 'Hariri',
    editTitle: 'Hariri aina ya chakula',
    // Onyo la kweli: kubadilisha dirisha kunabadilisha kinachopendekezwa
    // kesho kwa kila shamba, ingawa historia inabaki ilivyo.
    editWarning:
      'Katalogi ni ya mfumo mzima. Kubadilisha dirisha la umri kunabadilisha chakula kinachopendekezwa kwa kila mzunguko, kwenye kila shamba - rekodi za zamani hazibadiliki.',
    savedToast: 'Aina ya chakula imehifadhiwa.',

    deactivate: 'Zima',
    activate: 'Rudisha',
    deactivatedToast: 'Aina imezimwa. Haitachaguliwa tena kwa ulishaji mpya.',
    activatedToast: 'Aina imerudishwa.',
    inactiveNotice:
      'Aina hii imezimwa: rekodi za zamani zinaisoma kama kawaida, lakini haiwezi kuchaguliwa kwa ulishaji mpya hadi irudishwe.',

    delete: 'Futa',
    deleteTitle: 'Futa aina ya chakula?',
    deleteMessage:
      'itatoweka kwenye katalogi. Inafaa tu kwa aina iliyosajiliwa kimakosa - ikiwa iliwahi kutumika, itumie "Zima" badala yake.',
    deleteConfirm: 'Ndiyo, ifute',
    deletedToast: 'Aina ya chakula imefutwa.',
  },
  en: {
    title: 'Feed Catalogue',
    subtitle: 'The feed types every farm can draw from, and the ages they suit',
    loading: 'Loading...',
    retry: 'Try again',

    colNumber: 'S/No',
    colName: 'Feed type',
    colAgeWindow: 'Suits ages',
    colStatus: 'Status',
    statusActive: 'Active',
    statusInactive: 'Disabled',
    /** Prefix for the age window: "months 0-3". */
    ageWindowUnit: 'months',

    emptyTitle: 'No feed types yet',
    emptyMessage:
      'Register the first one below. Until you do, there is nothing to choose from on the Feeding screen.',

    listTitle: 'Registered types',

    formTitle: 'Register a feed type',
    formHint: 'The catalogue is system-wide: what you register here appears on every farm.',
    fieldName: 'Type name',
    fieldNameHint: 'For example: Pellet 3mm',
    fieldMinAge: 'Youngest age (months)',
    fieldMaxAge: 'Oldest age (months)',
    ageHint:
      'Both ends are included. Fry feed is 0 to 0 - that is a real window, not a blank form.',
    submit: 'Register',

    errorNameRequired: 'Enter a name for the feed type.',
    errorNameTooLong: 'The name must be 80 characters or fewer.',
    errorNameTaken: 'A feed type with this name is already in the catalogue.',
    errorAgeRequired: 'Fill in both the youngest and the oldest age.',
    errorAgeInteger: 'Ages are whole months, not fractions.',
    errorAgeNegative: 'An age cannot be below zero.',
    errorMaxBelowMin: 'The oldest age cannot be below the youngest age.',

    createdToast: 'Feed type registered.',

    actions: 'Actions',
    close: 'Close',
    cancel: 'Cancel',
    save: 'Save',

    edit: 'Edit',
    editTitle: 'Edit feed type',
    editWarning:
      'The catalogue is system-wide. Changing the age window changes which feed is suggested for every cycle, on every farm - past records are unaffected.',
    savedToast: 'Feed type saved.',

    deactivate: 'Disable',
    activate: 'Enable',
    deactivatedToast: 'Feed type disabled. It will not be offered for new feedings.',
    activatedToast: 'Feed type enabled again.',
    inactiveNotice:
      'This type is disabled: past records still read it normally, but it cannot be chosen for a new feeding until it is enabled again.',

    delete: 'Delete',
    deleteTitle: 'Delete this feed type?',
    deleteMessage:
      'will be gone from the catalogue. This is only for a type registered by mistake - if it has ever been used, use "Disable" instead.',
    deleteConfirm: 'Yes, delete it',
    deletedToast: 'Feed type deleted.',
  },
} as const;
