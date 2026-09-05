/**
 * Members CONTENT only. The chrome around it - brand, nav, topbar, farm
 * switcher - belongs to AppShell and lives in app-shell.i18n.ts.
 *
 * "Nafasi" (position/seat) is used for a role rather than the loan-word
 * "role", matching the Farms screen's members panel so the same column does
 * not change name between two screens showing the same people.
 */
export const MEMBERS_I18N = {
  sw: {
    title: 'Wanachama wa Shamba',
    subtitleOf: 'Watu walioko',
    subtitle: 'Watu walioko kwenye shamba unalofanyia kazi',
    loading: 'Inapakia...',
    retry: 'Jaribu tena',

    colNumber: 'S/No',
    colName: 'Jina',
    colPhone: 'Simu',
    colRole: 'Nafasi',
    colStatus: 'Hali',
    actions: 'Vitendo',
    noRole: 'Hana nafasi bado',

    statusActive: 'Yupo hai',
    statusPending: 'Anasubiri idhini',
    statusDisabled: 'Amezuiwa',

    emptyTitle: 'Hakuna mtu kwenye shamba hili bado',
    emptyMessage: 'Waidhinishe kwenye ukurasa wa Maombi ya Idhini, kisha watatokea hapa.',

    // "Huna shamba" - si kosa, ni hali halali (ROOT, au msimamizi
    // ambaye bado hajawekwa kwenye shamba lolote).
    noFarmTitle: 'Hakuna shamba lililochaguliwa',
    noFarmAdminBody:
      'Ukurasa huu unaonyesha watu wa shamba MOJA. Chagua shamba kwenye kichagua-shamba juu ili kuona wanachama wake.',
    noFarmBody:
      'Akaunti yako haijawekwa kwenye shamba lolote, hivyo hakuna wanachama wa kuonyesha. Wasiliana na msimamizi wako.',

    changeRole: 'Badilisha nafasi',
    changeRoleTitle: 'Badilisha nafasi ya',
    fieldRole: 'Nafasi',
    rolePlaceholder: 'Chagua nafasi...',
    rolesUnavailable: 'Orodha ya nafasi haikupatikana. Jaribu tena.',
    errorRoleRequired: 'Chagua nafasi.',
    errorSameRole: 'Huyu tayari ana nafasi hii.',
    save: 'Hifadhi',
    cancel: 'Ghairi',
    close: 'Funga',
    roleChangedToast: 'Nafasi imebadilishwa.',

    // ---------------------------------------------------- kuongeza mtu mpya
    addMember: 'Mwanachama Mpya',
    addTitle: 'Ongeza mwanachama',
    addIntro:
      'Akaunti hii itaanza ikiwa hai mara moja - hakuna kusubiri idhini, wewe ndiye idhini yenyewe. Password unayoweka hapa ni yake ya kwanza; itabidi umkabidhi mwenyewe.',
    fieldNewName: 'Jina kamili',
    fieldNewPhone: 'Namba ya simu',
    fieldNewPhoneHint: 'Mfano: 0788200111',
    fieldNewEmail: 'Barua pepe (si lazima)',
    fieldNewPassword: 'Password ya kwanza',
    fieldNewPasswordHint: 'Angalau herufi 6',
    errorNameRequired: 'Andika jina.',
    errorPhoneRequired: 'Andika namba ya simu.',
    errorPasswordShort: 'Password iwe angalau herufi 6.',
    createdToast: 'Mwanachama ameongezwa.',
    // Hatua mbili, na ya pili ikishindwa akaunti tayari ipo - hivyo lazima
    // ieleweke kilichofanikiwa na kilichobaki.
    partialWarning:
      'Akaunti imetengenezwa, lakini bado haijawekwa kwenye shamba hili. Chagua nafasi kisha bonyeza Hifadhi tena kumalizia - hakuna akaunti mpya itakayotengenezwa.',
    add: 'Ongeza',

    // ------------------------------------------------- kuhariri utambulisho
    edit: 'Hariri taarifa',
    editTitle: 'Hariri taarifa za',
    editIntro:
      'Jina, simu na barua pepe pekee. Nafasi yake, shamba lake na hali ya akaunti havibadiliki hapa - kila kimoja kina kitendo chake.',
    savedToast: 'Taarifa zimehifadhiwa.',

    // ------------------------------------------------------- kuzima akaunti
    disableAccount: 'Zima akaunti',
    enableAccount: 'Rudisha akaunti',
    disabledToast: 'Akaunti imezimwa. Hataweza kuingia kwenye mfumo.',
    enabledToast: 'Akaunti imerudishwa.',

    // -------------------------------------------------------- kufuta mtu
    deleteAccount: 'Futa akaunti',
    deleteTitle: 'Futa akaunti kabisa?',
    deleteMessage:
      'atafutwa kwenye mfumo mzima, si kwenye shamba hili tu, na hataweza kuingia tena kamwe. Kama unataka tu aondoke kwenye shamba hili, tumia "Mtoe kwenye shamba".',
    deleteConfirm: 'Ndiyo, ifute',
    deletedToast: 'Akaunti imefutwa.',

    remove: 'Mtoe kwenye shamba',
    removeTitle: 'Mtoe kwenye shamba?',
    removeMessage:
      'atatolewa kwenye shamba hili na kupoteza uwezo wa kuona data yake. Akaunti yake yenyewe haitafutwa.',
    removeConfirm: 'Ndiyo, mtoe',
    removedToast: 'Mtumiaji ametolewa kwenye shamba.',
  },
  en: {
    title: 'Farm Members',
    subtitleOf: 'People on',
    subtitle: 'People on the farm you are working in',
    loading: 'Loading...',
    retry: 'Try again',

    colNumber: 'S/No',
    colName: 'Name',
    colPhone: 'Phone',
    colRole: 'Role',
    colStatus: 'Status',
    actions: 'Actions',
    noRole: 'No role yet',

    statusActive: 'Active',
    statusPending: 'Awaiting approval',
    statusDisabled: 'Disabled',

    emptyTitle: 'Nobody is on this farm yet',
    emptyMessage: 'Approve people on the Approvals screen and they will appear here.',

    noFarmTitle: 'No farm selected',
    noFarmAdminBody:
      'This screen shows the people on ONE farm. Pick a farm in the switcher above to see its members.',
    noFarmBody:
      'Your account is not on a farm, so there are no members to show. Ask your administrator.',

    changeRole: 'Change role',
    changeRoleTitle: 'Change the role of',
    fieldRole: 'Role',
    rolePlaceholder: 'Choose a role...',
    rolesUnavailable: 'The list of roles could not be loaded. Try again.',
    errorRoleRequired: 'Choose a role.',
    errorSameRole: 'They already hold this role.',
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    roleChangedToast: 'Role changed.',

    addMember: 'New Member',
    addTitle: 'Add a member',
    addIntro:
      'This account starts active straight away - there is no approval to wait for, because you are the approval. The password you set here is their first one, and you have to pass it on yourself.',
    fieldNewName: 'Full name',
    fieldNewPhone: 'Phone number',
    fieldNewPhoneHint: 'For example: 0788200111',
    fieldNewEmail: 'Email (optional)',
    fieldNewPassword: 'First password',
    fieldNewPasswordHint: 'At least 6 characters',
    errorNameRequired: 'Enter a name.',
    errorPhoneRequired: 'Enter a phone number.',
    errorPasswordShort: 'The password must be at least 6 characters.',
    createdToast: 'Member added.',
    partialWarning:
      'The account was created, but it is not on this farm yet. Choose a role and press Save again to finish - no second account will be created.',
    add: 'Add',

    edit: 'Edit details',
    editTitle: 'Edit the details of',
    editIntro:
      'Name, phone and email only. Their role, their farm and whether the account is blocked are not changed here - each has its own action.',
    savedToast: 'Details saved.',

    disableAccount: 'Disable account',
    enableAccount: 'Enable account',
    disabledToast: 'Account disabled. They can no longer sign in.',
    enabledToast: 'Account enabled again.',

    deleteAccount: 'Delete account',
    deleteTitle: 'Delete this account for good?',
    deleteMessage:
      'will be removed from the whole system, not just this farm, and will never be able to sign in again. If you only want them off this farm, use "Remove from farm".',
    deleteConfirm: 'Yes, delete it',
    deletedToast: 'Account deleted.',

    remove: 'Remove from farm',
    removeTitle: 'Remove from this farm?',
    removeMessage:
      'will be taken off this farm and will no longer see its data. Their account itself is not deleted.',
    removeConfirm: 'Yes, remove',
    removedToast: 'Removed from the farm.',
  },
} as const;
