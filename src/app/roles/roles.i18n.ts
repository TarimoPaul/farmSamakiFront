/**
 * Roles CONTENT only. The chrome around it belongs to AppShell.
 *
 * "Nafasi" for a role, matching Members and the Farms members panel - the
 * same thing must not change name between the screen that GRANTS a role and
 * the screen that BUILDS one. "Ruhusa" is a permission throughout.
 *
 * KUZIMA vs KUFUTA are worded as two different things everywhere, because
 * they are: one is reversible and touches nobody, the other is refused while
 * anybody still holds the role. Copy that blurred them would be the fastest
 * way to get an admin to pick the wrong one.
 *
 * MODULES AND GROUPS are backend values (`permissions.module`,
 * `permissions.group_name`) and the catalogue grows with every feature, so
 * these two dictionaries are a courtesy, not a contract: an unknown value is
 * shown as it arrives rather than dropped. Same rule as the status labels on
 * Members.
 */
export const ROLES_I18N = {
  sw: {
    title: 'Nafasi na Ruhusa',
    subtitle: 'Tengeneza nafasi na uamue kila moja inaruhusiwa kufanya nini',
    loading: 'Inapakia...',
    retry: 'Jaribu tena',

    colNumber: 'S/No',
    colName: 'Nafasi',
    colDescription: 'Maelezo',
    colPermissions: 'Ruhusa',
    colStatus: 'Hali',
    actions: 'Vitendo',
    noDescription: 'Hakuna maelezo',
    noPermissions: 'Hakuna',
    statusActive: 'Hai',
    statusInactive: 'Imezimwa',

    emptyTitle: 'Hakuna nafasi bado',
    emptyMessage:
      'Tengeneza nafasi ya kwanza, kisha uwape watu kwenye ukurasa wa Wanachama wa Shamba.',

    newRole: 'Nafasi Mpya',
    formTitle: 'Nafasi mpya',
    fieldName: 'Jina la nafasi',
    fieldNameHint: 'Mfano: MHASIBU',
    fieldDescription: 'Maelezo',
    fieldDescriptionHint: 'Nafasi hii ni ya nani, na inafanya nini?',
    errorNameRequired: 'Andika jina la nafasi.',
    errorNameTooLong: 'Jina lisizidi herufi 50.',
    errorNameTaken: 'Jina hili tayari linatumika na nafasi nyingine.',
    createdToast: 'Nafasi imetengenezwa.',

    // ------------------------------------------------------------ vitendo
    edit: 'Hariri',
    editRoleTitle: 'Hariri nafasi',
    savedToast: 'Nafasi imehifadhiwa.',

    editPermissions: 'Ruhusa',
    editTitle: 'Ruhusa za',
    permissionsSavedToast: 'Ruhusa zimehifadhiwa.',

    deactivate: 'Zima',
    activate: 'Rudisha',
    deactivatedToast: 'Nafasi imezimwa. Haitapewa mtu mpya.',
    activatedToast: 'Nafasi imerudishwa.',

    delete: 'Futa',
    deleteTitle: 'Futa nafasi?',
    deleteMessage:
      'itatoweka kabisa. Ikiwa unataka tu kuacha kuitumia bila kuipoteza, itumie "Zima" badala yake.',
    deleteConfirm: 'Ndiyo, ifute',
    deletedToast: 'Nafasi imefutwa.',

    // Onyo la kweli, si la kujilinda: roles ni za mfumo mzima (POST /api/roles
    // haina farmId), hivyo kuhariri OWNER kunagusa kila shamba.
    globalWarning:
      'Nafasi ni za mfumo mzima. Mabadiliko haya yataathiri kila mtu mwenye nafasi hii, kwenye kila shamba - ikiwemo wewe mwenyewe.',
    inactiveNotice:
      'Nafasi hii imezimwa: bado inafanya kazi kwa walioshikilia, lakini haiwezi kupewa mtu mpya hadi irudishwe.',

    selectedCount: 'ruhusa zimechaguliwa',
    permissionsUnavailable:
      'Orodha ya ruhusa haikupatikana, hivyo huwezi kuhariri ruhusa sasa. Jaribu tena.',
    unknownCodes:
      'Nafasi hii ina ruhusa ambazo hazipo kwenye orodha, hivyo hazitaonekana hapa na zitapotea ukihifadhi:',

    groupOther: 'Nyingine',
    modules: {
      FARM: 'Shamba',
      FINANCE: 'Fedha',
      UAA: 'Watumiaji',
    },
    groups: {
      REPORTING: 'Ripoti',
      PRODUCTION: 'Uzalishaji',
      TASKS: 'Kazi za kila siku',
      FARM_MANAGEMENT: 'Usimamizi wa mashamba',
      FEED: 'Chakula',
      USER_MANAGEMENT: 'Usimamizi wa watumiaji',
      WATER: 'Ubora wa maji',
    },

    save: 'Hifadhi',
    cancel: 'Ghairi',
    close: 'Funga',
  },
  en: {
    title: 'Roles and Permissions',
    subtitle: 'Build roles, and decide what each one is allowed to do',
    loading: 'Loading...',
    retry: 'Try again',

    colNumber: 'S/No',
    colName: 'Role',
    colDescription: 'Description',
    colPermissions: 'Permissions',
    colStatus: 'Status',
    actions: 'Actions',
    noDescription: 'No description',
    noPermissions: 'None',
    statusActive: 'Active',
    statusInactive: 'Disabled',

    emptyTitle: 'No roles yet',
    emptyMessage: 'Create the first role, then hand it to people on the Farm Members screen.',

    newRole: 'New Role',
    formTitle: 'New role',
    fieldName: 'Role name',
    fieldNameHint: 'For example: ACCOUNTANT',
    fieldDescription: 'Description',
    fieldDescriptionHint: 'Who is this role for, and what does it do?',
    errorNameRequired: 'Enter a role name.',
    errorNameTooLong: 'The name must be 50 characters or fewer.',
    errorNameTaken: 'Another role already has this name.',
    createdToast: 'Role created.',

    edit: 'Edit',
    editRoleTitle: 'Edit role',
    savedToast: 'Role saved.',

    editPermissions: 'Permissions',
    editTitle: 'Permissions of',
    permissionsSavedToast: 'Permissions saved.',

    deactivate: 'Disable',
    activate: 'Enable',
    deactivatedToast: 'Role disabled. It will not be given to anyone new.',
    activatedToast: 'Role enabled again.',

    delete: 'Delete',
    deleteTitle: 'Delete this role?',
    deleteMessage:
      'will be gone for good. If you only want to stop using it without losing it, use "Disable" instead.',
    deleteConfirm: 'Yes, delete it',
    deletedToast: 'Role deleted.',

    globalWarning:
      'Roles are system-wide. This change affects everyone holding this role, on every farm - including you.',
    inactiveNotice:
      'This role is disabled: it still works for the people who hold it, but it cannot be given to anyone new until it is enabled again.',

    selectedCount: 'permissions selected',
    permissionsUnavailable:
      'The permission list could not be loaded, so permissions cannot be edited right now. Try again.',
    unknownCodes:
      'This role holds permissions that are not in the catalogue, so they are not shown here and will be lost if you save:',

    groupOther: 'Other',
    modules: {
      FARM: 'Farm',
      FINANCE: 'Finance',
      UAA: 'Users',
    },
    groups: {
      REPORTING: 'Reporting',
      PRODUCTION: 'Production',
      TASKS: 'Daily tasks',
      FARM_MANAGEMENT: 'Farm management',
      FEED: 'Feed',
      USER_MANAGEMENT: 'User management',
      WATER: 'Water quality',
    },

    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
  },
} as const;
