/**
 * Approvals copy. Swahili is the primary language of the product; English is
 * the toggle. Nothing user-facing is written inline in the template.
 *
 * Note what is NOT here: the wording for a backend refusal. Those come from
 * core/i18n/error-messages.ts keyed on `errorCode`, so a FORBIDDEN reads the
 * same on this screen as on any other. The strings below are only for states
 * this screen invents.
 */
export const APPROVALS_I18N = {
  sw: {
    title: 'Maombi ya Idhini',
    subtitle: 'Waliojisajili wenyewe na wanasubiri kuidhinishwa',
    loading: 'Inapakia...',
    retry: 'Jaribu tena',
    refresh: 'Onyesha upya',

    colNumber: 'S/No',
    colPosition: 'Nafasi',
    colName: 'Jina',
    colPhone: 'Simu',
    // The backend orders the queue oldest-first but sends no timestamp, so
    // the column says WHERE in the queue somebody is, not when they arrived.
    positionOldest: 'Wa kwanza kusubiri',
    positionNth: 'Nafasi',

    emptyTitle: 'Hakuna maombi yanayosubiri idhini.',
    emptyMessage: 'Mtu akijisajili ataonekana hapa.',

    // Kichwa cha safu, si kitufe: 'Idhinisha' kinaeleza kitendo kimoja,
    // hivyo kingesoma vibaya kama jina la safu.
    actions: 'Vitendo',
    approve: 'Idhinisha',
    approveAndAssign: 'Idhinisha na kumpangia',

    formTitle: 'Idhinisha na kumpangia',
    formFor: 'Unamwidhinisha',
    fieldFarm: 'Shamba',
    fieldRole: 'Nafasi (role)',
    farmPlaceholder: 'Chagua shamba',
    rolePlaceholder: 'Chagua nafasi',
    // Shown INSTEAD of the picker to a manage_users-only caller: they may
    // only assign into their own farm, so there is nothing to choose.
    ownFarmOnly: 'Utampangia kwenye shamba lako:',
    ownFarmUnknown: 'Akaunti yako haiko kwenye shamba lolote, hivyo huwezi kumpangia mtu.',
    loadingPickers: 'Inapakia mashamba na nafasi...',
    errorFarmRequired: 'Chagua shamba.',
    errorRoleRequired: 'Chagua nafasi.',
    save: 'Idhinisha na kumpangia',
    cancel: 'Ghairi',
    close: 'Funga',

    // Outcomes.
    noticeApprovedAssigned: 'ameidhinishwa na amepangiwa shamba.',
    noticeApprovedOnly: 'Ameidhinishwa. Apangiwe shamba na role kupitia Members.',
    noticeApprovedNotAssigned:
      'Ameidhinishwa lakini hajapangiwa shamba — kamilisha kupitia Members.',
    noticeStale:
      'hayuko tena kwenye orodha ya kusubiri — huenda msimamizi mwingine amemshughulikia. Orodha imeonyeshwa upya.',
    noticeDismiss: 'Sawa',
    // Only for the approve-only caller, who cannot assign at all.
    hintApproveOnly:
      'Una ruhusa ya kuidhinisha pekee. Aliyeidhinishwa hapa atakuwa ACTIVE bila shamba wala role — apangiwe kupitia Members.',

    // Rail ya muhtasari. HAKUNA KALENDA: UserSummary haina muhuri wa muda
    // wowote, hivyo hakuna tarehe ya kuchuja nayo - angalia safu ya nafasi.
    introTitle: 'Idhini za Watumiaji',
    introBody:
      'Waliojisajili wenyewe wanasubiri hapa. Kuwaingiza kazini ni hatua mbili: kuidhinisha, kisha kuwapa shamba na nafasi.',
    introStep1: 'Angalia foleni - aliyesubiri muda mrefu yuko juu.',
    introStep2: 'Bofya "Idhinisha na upange" ili kumaliza hatua zote mbili kwa mara moja.',
    introStep3: 'Ukiidhinisha pekee, mtu huyo anabaki bila shamba - kamilisha kupitia Members.',
    railTitle: 'Foleni',
    railPendingAll: 'Wanaosubiri',
    railOldest: 'Amesubiri muda mrefu',
    railQueueEmpty: 'Hakuna',
    railPickersTitle: 'Chaguo za fomu',
    railFarmLabel: 'Shamba',
    railFarmAny: 'Lolote (unachagua)',
    railFarmNone: 'Hujawekwa kwenye shamba',
    railRolesLabel: 'Nafasi zilizopo',
    /** Orodha ya nafasi hushindwa KIMYA (angalia loadPickers) - hapa ndipo inasemwa. */
    railNoRoles: 'Orodha ya nafasi ni tupu. Fomu ya kupanga haitakuwa na cha kuchagua.',
  },
  en: {
    title: 'Approval requests',
    subtitle: 'People who registered themselves and are waiting to be approved',
    loading: 'Loading...',
    retry: 'Try again',
    refresh: 'Refresh',

    colNumber: 'S/No',
    colPosition: 'Position',
    colName: 'Name',
    colPhone: 'Phone',
    positionOldest: 'Waiting longest',
    positionNth: 'Position',

    emptyTitle: 'No approval requests are waiting.',
    emptyMessage: 'Anyone who registers will appear here.',

    actions: 'Actions',
    approve: 'Approve',
    approveAndAssign: 'Approve and assign',

    formTitle: 'Approve and assign',
    formFor: 'Approving',
    fieldFarm: 'Farm',
    fieldRole: 'Role',
    farmPlaceholder: 'Choose a farm',
    rolePlaceholder: 'Choose a role',
    ownFarmOnly: 'They will be assigned to your farm:',
    ownFarmUnknown: 'Your account is not on any farm, so you cannot assign anyone.',
    loadingPickers: 'Loading farms and roles...',
    errorFarmRequired: 'Choose a farm.',
    errorRoleRequired: 'Choose a role.',
    save: 'Approve and assign',
    cancel: 'Cancel',
    close: 'Close',

    noticeApprovedAssigned: 'was approved and assigned to a farm.',
    noticeApprovedOnly: 'Approved. Assign a farm and role from the Members screen.',
    noticeApprovedNotAssigned:
      'Approved, but not assigned to a farm — finish this from the Members screen.',
    noticeStale:
      'is no longer in the pending queue — another administrator may have handled them. The list has been refreshed.',
    noticeDismiss: 'OK',
    hintApproveOnly:
      'You may approve only. Anyone approved here becomes ACTIVE with no farm and no role — assign them from the Members screen.',

    introTitle: 'User Approvals',
    introBody:
      'People who signed up for themselves wait here. Getting them working is two steps: approve them, then give them a farm and a role.',
    introStep1: 'Look at the queue - whoever has waited longest is at the top.',
    introStep2: 'Use "Approve and assign" to do both steps at once.',
    introStep3: 'Approve alone and they stay without a farm - finish it from Members.',
    railTitle: 'The queue',
    railPendingAll: 'Waiting',
    railOldest: 'Waiting longest',
    railQueueEmpty: 'Nobody',
    railPickersTitle: 'What the form offers',
    railFarmLabel: 'Farm',
    railFarmAny: 'Any (you choose)',
    railFarmNone: 'You are not on a farm',
    railRolesLabel: 'Roles available',
    railNoRoles: 'The role list is empty. The assign form will have nothing to choose from.',
  },
} as const;
