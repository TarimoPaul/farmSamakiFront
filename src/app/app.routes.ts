import { Routes } from '@angular/router';
import { Login } from './auth/login/login';
import { Signup } from './auth/signup/signup';
import { ChangePassword } from './auth/change-password/change-password';
import { Dashboard } from './dashboard/dashboard';
import { Farms } from './farms/farms';
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
  { path: '**', redirectTo: 'login' },
];
