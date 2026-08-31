/**
 * Shapes here mirror the backend contract exactly (samaki-farm-backend:
 * AuthController + ApiResponse). Anything the API does not send is not
 * modelled here - the previous version guessed at a `/auth/signup` payload
 * that no endpoint ever accepted.
 */

export type UserStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'DISABLED';

export interface UserSummary {
  id: string;
  name: string;
  phone: string;
  status: UserStatus;
  /**
   * The farm this account is working in: its membership, or - for ROOT - the
   * farm it selected (see FarmSelectionService). Null for ROOT before it has
   * picked one, and for approved users not yet assigned to a farm.
   */
  farmId: number | null;
  /** null when the user has no membership yet; 'ROOT' for the superadmin. */
  role: string | null;
}

/**
 * `GET /api/auth/me` - "who am I, and what am I allowed to do".
 *
 * `permissions` is the reason this endpoint exists, and the only way the
 * frontend can learn them: the login response carries the role NAME only, and
 * a role's permissions are editable at runtime. Everything else repeats
 * UserSummary so a screen never has to stitch two responses together.
 */
export interface MeResponse extends UserSummary {
  permissions: string[];
  /**
   * May this account work in a farm it does not belong to? True for ROOT
   * only, today.
   *
   * The UI cannot derive it: the moment ROOT picks a farm its `farmId` stops
   * being null, so "has no farm" would stop telling ROOT apart from an
   * ordinary member - and the farm switcher would vanish the first time it
   * was used. See FarmSelectionService.
   */
  canSelectFarm: boolean;
}

export interface LoginResponse {
  token: string;
  user: UserSummary;
  /**
   * The forced-password-change gate. Login itself still succeeds (200 + a
   * usable token), but every route outside /api/auth/** answers
   * 403 MUST_CHANGE_PASSWORD until the password is changed.
   */
  mustChangePassword: boolean;
}

export interface LoginRequest {
  phone?: string;
  email?: string;
  password: string;
}

/**
 * Every way a login attempt can end, as data rather than exceptions.
 *
 * `pending-approval` and `account-disabled` are NOT credential failures -
 * the password was correct and the backend said so deliberately (it checks
 * the password first precisely so these can be reported without leaking
 * which numbers are registered). The UI shows them as notices.
 */
export type LoginOutcome =
  | { kind: 'success'; user: UserSummary }
  | { kind: 'must-change-password'; user: UserSummary }
  | { kind: 'invalid-credentials' }
  | { kind: 'pending-approval' }
  | { kind: 'account-disabled' }
  | { kind: 'too-many-requests' }
  | { kind: 'network-error' };

/** POST /api/auth/register - no farm, no membership, no token. */
export interface RegisterRequest {
  name: string;
  phone: string;
  email?: string;
  password: string;
}

export interface RegistrationResponse {
  userId: string;
  status: UserStatus;
}

/**
 * `message` carries the backend's own text for the cases where it is more
 * specific than anything we could write here (which phone/email is already
 * taken, which field failed validation). Backend messages are Swahili
 * regardless of UI language - see the note in signup.ts.
 */
export type RegisterOutcome =
  | { kind: 'pending' }
  | { kind: 'already-registered'; message: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'too-many-requests' }
  | { kind: 'network-error' };

/** POST /api/auth/change-password - token + current password, NO OTP. */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/**
 * `wrong-current-password` comes back as 401 INVALID_CREDENTIALS. That is a
 * *field* error, not an expired session - which is why session handling keys
 * on errorCode UNAUTHENTICATED rather than on the 401 status alone (see
 * AuthErrorHandler).
 */
export type ChangePasswordOutcome =
  | { kind: 'success' }
  | { kind: 'wrong-current-password' }
  | { kind: 'rejected'; message: string }
  | { kind: 'network-error' };

export interface ForgotPasswordRequest {
  phone: string;
}

export interface ResetPasswordRequest {
  phone: string;
  otp: string;
  newPassword: string;
}