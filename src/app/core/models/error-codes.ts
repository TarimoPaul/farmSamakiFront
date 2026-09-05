/**
 * Machine-readable failure codes from the backend (ApiResponse.errorCode /
 * GraphQL extensions.errorCode). Branch on THESE, never on the message -
 * messages are Swahili prose that can be reworded or translated; codes cannot.
 *
 * The vocabulary is deliberately IDENTICAL for both APIs: the same failure
 * carries the same code whether it arrives as a REST envelope or inside a
 * GraphQL `errors[]` entry. That is what lets one handler serve both
 * transports - see AuthErrorHandler for the session-level half, and
 * error-messages.ts for the copy shown to the user.
 */
export const ERROR_CODE = {
  /** 401 - login attempt with a wrong password / unknown user. A form error. */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /** 401 - no valid session at all: token missing, expired, or malformed. */
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  /** 403 - signed in, but lacking the required permission. */
  FORBIDDEN: 'FORBIDDEN',
  /** 403 - password was correct, account still awaiting admin approval. */
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  /** 403 - password was correct, account has been disabled. */
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  /** 403 - valid token, but the password must be changed before anything else. */
  MUST_CHANGE_PASSWORD: 'MUST_CHANGE_PASSWORD',
  /**
   * 403 - signed in and permitted, but the account holds no farm, so a
   * farm-scoped request has nothing to answer with. In practice: ROOT, or an
   * approved user not yet assigned to a farm.
   */
  NO_FARM_CONTEXT: 'NO_FARM_CONTEXT',
  /** 409 - collides with existing data (a duplicate unit code, say). */
  CONFLICT: 'CONFLICT',
  /**
   * 409 - a farm's own owner cannot be taken off that farm
   * (FarmUserService.removeMembership).
   *
   * Separate from CONFLICT because it is not a collision a different input
   * would get past: it is a standing rule about this person on this farm, and
   * retrying can never succeed. That is also why it is worth its own copy -
   * the generic "this clashes with existing data" would leave the admin
   * looking for the clash.
   */
  OWNER_IMMUTABLE: 'OWNER_IMMUTABLE',
  /**
   * 409 - a role cannot be deleted while people still hold it
   * (RoleService.deleteRole).
   *
   * Its own code rather than a bare CONFLICT because, unlike
   * OWNER_IMMUTABLE, this one CAN be cleared: move those people to another
   * role and the same request succeeds. The Roles screen uses that to offer
   * the way out (deactivate instead), which the generic conflict copy could
   * not carry. The backend's own sentence names how many people are in the
   * way, so the screen shows that rather than a line of its own.
   */
  ROLE_IN_USE: 'ROLE_IN_USE',
  /**
   * 409 - a farm cannot be deleted while people are still members of it
   * (FarmService.delete).
   *
   * The same shape as ROLE_IN_USE and clearable the same way: take the
   * members off and the identical request succeeds. The backend's sentence
   * names how many, which is the number that says how much work that is.
   */
  FARM_IN_USE: 'FARM_IN_USE',
  /** 400 - the submitted data was refused on business rules. A field error. */
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  /** 429 - rate limited (login: 10 per 5 min per IP; register: 5 per hour). */
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];
