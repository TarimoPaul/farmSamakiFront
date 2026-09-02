/**
 * The chrome's own copy - brand, nav, topbar. It lives with the shell rather
 * than with a screen because every screen now renders the same nav; keeping
 * the labels in dashboard.i18n.ts would have made the Farms screen import the
 * dashboard's dictionary to name its own nav entry.
 */
export const SHELL_I18N = {
  sw: {
    brandName: 'Samaki Farm',
    navDashboard: 'Dashibodi',
    navFarms: 'Mashamba',
    navApprovals: 'Maombi ya Idhini',
    navMembers: 'Wanachama wa Shamba',
    navProduction: 'Uzalishaji',
    navFeeding: 'Malisho',
    navWater: 'Ubora wa Maji',
    navSettings: 'Mipangilio',
    comingSoon: 'Inakuja hivi karibuni',
    systemInfoTitle: 'Taarifa za mfumo',
    loggedInAs: 'Umeingia kama',
    searchPlaceholder: 'Tafuta (hivi karibuni)',
    logout: 'Toka',
    farmSwitcher: 'Shamba unalofanyia kazi',
    farmSwitcherNone: 'Chagua shamba…',
  },
  en: {
    brandName: 'Samaki Farm',
    navDashboard: 'Dashboard',
    navFarms: 'Farms',
    navApprovals: 'Approvals',
    navMembers: 'Farm Members',
    navProduction: 'Production',
    navFeeding: 'Feeding',
    navWater: 'Water Quality',
    navSettings: 'Settings',
    comingSoon: 'Coming soon',
    systemInfoTitle: 'System info',
    loggedInAs: 'Logged in as',
    searchPlaceholder: 'Search (coming soon)',
    logout: 'Log out',
    farmSwitcher: 'Farm you are working in',
    farmSwitcherNone: 'Select a farm…',
  },
} as const;

export type ShellNavKey = keyof (typeof SHELL_I18N)['sw'];
