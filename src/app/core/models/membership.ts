/**
 * `POST /api/users/{userId}/memberships` — putting a person on a farm with a
 * role there.
 *
 * Membership is a SEPARATE concept from approval: approving flips
 * PENDING_APPROVAL → ACTIVE and grants nothing, and a user can legitimately
 * be one without the other (see UserSummary, where `farmId` and `role` are
 * both nullable).
 *
 * `roleId` is nullable in the backend contract — someone can be placed on a
 * farm with no role yet. This screen always sends one: an approved user with
 * a farm but no role signs in to an empty app, which is not a state worth
 * creating deliberately.
 */
export interface AssignMembershipRequest {
  farmId: number;
  roleId: number | null;
}
