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
    navUnits: 'Vitengo vya Uzalishaji',
    navCycles: 'Mizunguko',
    navFeeding: 'Malisho',
    navWater: 'Ubora wa Maji',
    navWorkers: 'Wafanyakazi',
    navSettings: 'Mipangilio',
    comingSoon: 'Inakuja hivi karibuni',
    systemInfoTitle: 'Taarifa za mfumo',
    loggedInAs: 'Umeingia kama',
    searchPlaceholder: 'Tafuta (hivi karibuni)',
    logout: 'Toka',
  },
  en: {
    brandName: 'Samaki Farm',
    navDashboard: 'Dashboard',
    navFarms: 'Farms',
    navUnits: 'Production Units',
    navCycles: 'Cycles',
    navFeeding: 'Feeding',
    navWater: 'Water Quality',
    navWorkers: 'Workers',
    navSettings: 'Settings',
    comingSoon: 'Coming soon',
    systemInfoTitle: 'System info',
    loggedInAs: 'Logged in as',
    searchPlaceholder: 'Search (coming soon)',
    logout: 'Log out',
  },
} as const;

export type ShellNavKey = keyof (typeof SHELL_I18N)['sw'];
