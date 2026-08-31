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

    remove: 'Mtoe',
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

    remove: 'Remove',
    removeTitle: 'Remove from this farm?',
    removeMessage:
      'will be taken off this farm and will no longer see its data. Their account itself is not deleted.',
    removeConfirm: 'Yes, remove',
    removedToast: 'Removed from the farm.',
  },
} as const;
