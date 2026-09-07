import { Routes } from '@angular/router';
import { Login } from './auth/login/login';
import { Signup } from './auth/signup/signup';
import { ChangePassword } from './auth/change-password/change-password';
import { Dashboard } from './dashboard/dashboard';
import { Farms } from './farms/farms';
import { Approvals } from './approvals/approvals';
import { Members } from './members/members';
import { Roles } from './roles/roles';
import { Production } from './production/production';
import { SpeciesScreen } from './species/species';
import { Feeding } from './feeding/feeding';
import { FeedCatalog } from './feed-catalog/feed-catalog';
import { FeedPurchases } from './feed-purchases/feed-purchases';
import { WaterQuality } from './water-quality/water-quality';
import { authGuard, guestGuard, permissionGuard, sessionGuard } from './core/guards/auth-guard';
import { PERMISSION } from './core/models/permissions';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: Login, canActivate: [guestGuard] },
  { path: 'signup', component: Signup, canActivate: [guestGuard] },
  // Needs a session but NOT a cleared gate - this is the way out of the gate.
  { path: 'change-password', component: ChangePassword, canActivate: [sessionGuard] },
  { path: 'dashboard', component: Dashboard, canActivate: [authGuard] },
  // permissionGuard covers the session checks too, so it stands alone: a
  // permission check on a dead session must still land on /login.
  {
    path: 'farms',
    component: Farms,
    canActivate: [permissionGuard(PERMISSION.MANAGE_FARMS)],
  },
  // approve_users, NOT manage_users: reading the queue and approving is a
  // capability of its own. The screen then gates its assign controls on
  // manage_users separately - see Approvals.
  {
    path: 'approvals',
    component: Approvals,
    canActivate: [permissionGuard(PERMISSION.APPROVE_USERS)],
  },
  // manage_users, and nothing else: every control on this screen is that one
  // permission, so unlike Farms and Approvals there is no partial version of
  // it to gate separately.
  {
    path: 'members',
    component: Members,
    canActivate: [permissionGuard(PERMISSION.MANAGE_USERS)],
  },
  // The same manage_users as Members, because the backend draws no line
  // between the two: `GET/POST /api/roles` and `PUT /api/roles/{id}/permissions`
  // are all `hasAuthority('manage_users')`, exactly like the membership
  // endpoints. Gating this route on anything narrower would hide a screen from
  // people the API would serve; gating it on anything wider would offer one
  // the API refuses.
  {
    path: 'roles',
    component: Roles,
    canActivate: [permissionGuard(PERMISSION.MANAGE_USERS)],
  },
  // authGuard, NOT permissionGuard - unlike the three admin screens above,
  // these two are READ screens with gated controls inside them. Reading is
  // `view_dashboard`, which every role holds; what differs per person is
  // whether the create/log forms are there at all, and that is decided by
  // *appHasPermission on the controls themselves. Gating the route on a write
  // permission would shut a VIEWER out of data they are entitled to see.
  { path: 'production', component: Production, canActivate: [authGuard] },
  // Feeding joins them, and for the same reason: `view_dashboard` reads the
  // history, `log_feeding` puts the form on the page, and `view_feed_stock`
  // decides whether the remaining-stock panel is there at all. Three
  // permissions on one screen, none of which belongs on the route - gating
  // here on `log_feeding` would shut a VIEWER out of a history they may read,
  // and would hide the screen from someone who only holds `view_feed_stock`.
  { path: 'feeding', component: Feeding, canActivate: [authGuard] },
  // Species is the one PRODUCTION-side screen that IS a permissionGuard, and
  // the contrast with the line above is the reason to keep both. Its two
  // endpoints do NOT share a permission: `species` is `view_dashboard` - every
  // role reads it, and does read it, on Production's cycle form - while
  // `createSpecies` is `manage_species` (V20, OWNER and FARM_MANAGER only).
  //
  // So this route is DELIBERATELY STRICTER than the read it shows. The screen
  // exists to WRITE the catalogue; for anybody who may only read it, the list
  // is already on Production, and opening a screen whose one control the
  // backend refuses would be worse than not offering it. That is also why
  // nothing inside the screen is gated again.
  //
  // NOT farm-scoped. `species` has no farm column, so this route means the
  // same thing whichever farm is selected.
  {
    path: 'species',
    component: SpeciesScreen,
    canActivate: [permissionGuard(PERMISSION.MANAGE_SPECIES)],
  },
  // The one feed screen that IS a permissionGuard, and the contrast with
  // Feeding is the reason to keep both: Feeding is a read screen with gated
  // controls inside it, while every endpoint behind the catalogue - the list
  // as well as the create - is `manage_feed_stock` on the backend
  // (FeedService.listFeedTypes requires it too). There is no version of this
  // screen for somebody without that code: the guard is the whole gate, which
  // is why nothing inside it is gated again.
  //
  // NOT farm-scoped. `feed_types` has no farm column, so this route means the
  // same thing whichever farm is selected.
  {
    path: 'feed-catalog',
    component: FeedCatalog,
    canActivate: [permissionGuard(PERMISSION.MANAGE_FEED_STOCK)],
  },
  // The same `manage_feed_stock` as the catalogue, and for an overlapping
  // reason: `recordFeedPurchase` is that code, and so is the `feedTypes` read
  // that fills this screen's dropdown.
  //
  // The purchase LIST is looser - `feedPurchases` is only `view_dashboard`
  // plus a farm - so this route is deliberately stricter than one of the two
  // things it shows. A screen whose dropdown returned FORBIDDEN and whose
  // form could not submit is not worth opening for the sake of a read that
  // the Dashboard could carry instead.
  //
  // Farm-scoped, unlike the catalogue: `feedPurchases` answers for the
  // caller's own farm, from the X-Farm-Id header.
  {
    path: 'feed-purchases',
    component: FeedPurchases,
    canActivate: [permissionGuard(PERMISSION.MANAGE_FEED_STOCK)],
  },
  { path: 'water-quality', component: WaterQuality, canActivate: [authGuard] },
  { path: '**', redirectTo: 'login' },
];
