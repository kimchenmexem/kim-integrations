/**
 * useUserRole — lightweight hook for components that need to gate UI on
 * the signed-in user's role.
 *
 * Backed by a module-level cache so multiple components that mount across
 * the same page (ReviewPanel inside Single + Quick + Batch tools) share
 * one /api/auth/me call instead of fanning out one per panel.
 *
 * Backend role checks are still authoritative — this hook only controls
 * what UI is visible. The user's actual permissions are enforced server-
 * side regardless of what the client renders.
 */

import { useEffect, useState } from "react";
import { getMe } from "../api/client";

export type UserRole = "USER" | "REVIEWER" | "MANAGER" | "ADMIN";

let cached: UserRole | null = null;
let pending: Promise<UserRole | null> | null = null;

async function fetchRole(): Promise<UserRole | null> {
  if (cached) return cached;
  if (pending) return pending;
  pending = getMe()
    .then((me) => { cached = me.user.role; return cached; })
    .catch(() => null)
    .finally(() => { pending = null; });
  return pending;
}

export function useUserRole(): UserRole | null {
  const [role, setRole] = useState<UserRole | null>(cached);

  useEffect(() => {
    if (cached) {
      if (role !== cached) setRole(cached);
      return;
    }
    let alive = true;
    fetchRole().then((r) => { if (alive) setRole(r); });
    return () => { alive = false; };
  }, []);

  return role;
}

/** REVIEWER, MANAGER, ADMIN — same predicate as the backend canReadAllReviews. */
export function isReviewerOrAbove(role: UserRole | null): boolean {
  return role === "REVIEWER" || role === "MANAGER" || role === "ADMIN";
}
