import type { Request } from "express";
import type { User } from "@prisma/client";
import { Role } from "@prisma/client";
import { prisma } from "../db";
import { clerkClient } from "../auth/clerk";
import { config } from "../config";
import { writeAudit } from "./audit";

export function findUserById(id: number) {
  return prisma.user.findUnique({ where: { id } });
}

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function findUserByExternalIdentity(provider: string, providerUserId: string) {
  const identity = await prisma.userIdentity.findUnique({
    where: { provider_providerUserId: { provider, providerUserId } },
    include: { user: true },
  });
  return identity?.user ?? null;
}

/**
 * Resolve — or, on first sight, create — the local User corresponding to a
 * Clerk-authenticated session. Idempotent and race-safe:
 *
 *   1. Fast path: existing UserIdentity(provider="clerk", providerUserId=...) → return its User.
 *   2. Fetch Clerk profile (email, name, verification status).
 *   3. Conservative email linking: if the primary email is *verified* AND a local User
 *      with that email already exists, attach a new UserIdentity to it.
 *   4. Otherwise create a fresh User (role=USER, isActive=true) + UserIdentity in a single
 *      nested write.
 *   5. On P2002 unique violation (two concurrent bootstraps), re-read the identity row.
 *
 * Never elevates the role. Never creates duplicate (provider, providerUserId) rows.
 */
export async function getOrBootstrapUserFromClerk(
  clerkUserId: string,
  req?: Request
): Promise<User> {
  const existing = await findUserByExternalIdentity("clerk", clerkUserId);
  if (existing) return existing;

  if (!clerkClient) {
    throw new Error("Clerk is not configured on the server");
  }

  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const primaryEmailObj = clerkUser.emailAddresses.find(
    (e) => e.id === clerkUser.primaryEmailAddressId
  );
  if (!primaryEmailObj) {
    throw new Error(`Clerk user ${clerkUserId} has no primary email address`);
  }
  const email = primaryEmailObj.emailAddress;
  const isVerified = primaryEmailObj.verification?.status === "verified";
  const fullName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;

  try {
    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      if (!isVerified) {
        // Do NOT silently link an unverified Clerk email to an existing local
        // account — that would be an account-takeover vector. Refuse loudly.
        throw new BootstrapRefusedError(
          "Email already belongs to a local user; Clerk email is not verified."
        );
      }
      const newIdentity = await prisma.userIdentity.create({
        data: { userId: byEmail.id, provider: "clerk", providerUserId: clerkUserId },
      });
      // Identity-link audit — happens exactly once per (user, provider) pair.
      if (req) {
        // Temporarily set req.authUser so writeAudit records the actor — the
        // link action IS this user signing in; there's no earlier actor to blame.
        req.authUser = {
          id: byEmail.id,
          email: byEmail.email,
          fullName: byEmail.fullName,
          role: byEmail.role,
          isActive: byEmail.isActive,
        };
        await writeAudit(req, {
          action: "user.identity_link",
          entityType: "UserIdentity",
          entityId: newIdentity.id,
          after: {
            userId: byEmail.id,
            provider: "clerk",
            providerUserId: clerkUserId,
          },
          metadata: { linkedEmail: byEmail.email },
        });
      }
      return byEmail;
    }

    // Fresh User creation — the ONLY point where INITIAL_ADMIN_EMAILS applies.
    // Never flips an already-existing user; linking (the branch above) is
    // deliberately excluded. Email must be Clerk-verified to avoid trivial
    // unverified-email squatting.
    const shouldBootstrapAdmin =
      isVerified &&
      config.initialAdminEmails.includes(email.toLowerCase());

    const created = await prisma.user.create({
      data: {
        email,
        fullName,
        role: shouldBootstrapAdmin ? Role.ADMIN : Role.USER,
        // isActive defaults to true.
        identities: {
          create: { provider: "clerk", providerUserId: clerkUserId },
        },
      },
    });
    // Bootstrap audit — happens exactly once per new local user.
    if (req) {
      req.authUser = {
        id: created.id,
        email: created.email,
        fullName: created.fullName,
        role: created.role,
        isActive: created.isActive,
      };
      await writeAudit(req, {
        action: "user.bootstrap",
        entityType: "User",
        entityId: created.id,
        after: {
          id: created.id,
          email: created.email,
          role: created.role,
          isActive: created.isActive,
        },
        metadata: {
          clerkUserId,
          emailVerified: isVerified,
          promotedFromAllowlist: shouldBootstrapAdmin,
        },
      });
    }
    return created;
  } catch (err) {
    // Race-safe retry: the losing concurrent bootstrap re-reads the winner's row.
    if (isPrismaUniqueViolation(err)) {
      const fallback = await findUserByExternalIdentity("clerk", clerkUserId);
      if (fallback) return fallback;
    }
    throw err;
  }
}

export class BootstrapRefusedError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = "BootstrapRefusedError";
  }
}

function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}
