import { Role } from "@prisma/client";

/**
 * Object-level access policy helpers.
 *
 * Centralised so route handlers stay readable and the policy is visible in
 * one place. Every helper is pure — no DB, no I/O — so it can be unit-tested
 * and reasoned about locally.
 */

export type AuthUser = {
  id: number;
  role: Role;
};

/**
 * Can this role read every job (regardless of creator)?
 * - USER:      no, scope to own rows
 * - REVIEWER:  yes — reviewers need to see any translation submitted for review
 * - MANAGER:   yes — operational oversight
 * - ADMIN:     yes
 */
export function canReadAllJobs(role: Role): boolean {
  return role !== Role.USER;
}

/**
 * Can this role read every review record?
 * - USER:      no, scope to reviews on their own jobs' outputs
 * - REVIEWER+: yes
 */
export function canReadAllReviews(role: Role): boolean {
  return role !== Role.USER;
}

/**
 * Can this role read every demo run?
 * - USER:      no, own rows only
 * - REVIEWER:  no — demo runs are not review-related (they are exploratory)
 * - MANAGER+:  yes
 */
export function canReadAllDemoRuns(role: Role): boolean {
  return role === Role.MANAGER || role === Role.ADMIN;
}

/**
 * Build a Prisma `where` fragment that scopes rows to the current user when
 * the role doesn't get global read access. Use by spreading into an existing
 * where clause:
 *
 *   prisma.translationJob.findFirst({
 *     where: { id, ...ownerScope(user, canReadAllJobs, "createdByUserId") }
 *   });
 */
export function ownerScope<Column extends string>(
  user: AuthUser,
  canReadAll: (r: Role) => boolean,
  column: Column,
): Record<Column, number> | Record<string, never> {
  if (canReadAll(user.role)) return {};
  return { [column]: user.id } as Record<Column, number>;
}
