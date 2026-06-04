/**
 * Promote (or demote) a user by email — one-shot CLI.
 *
 * Use cases:
 *   - First-admin bootstrap missed (INITIAL_ADMIN_EMAILS wasn't set before
 *     that user's first sign-in).
 *   - Total admin lockout (e.g. last active ADMIN was deactivated despite
 *     the safety check, or the DB was restored from an old snapshot).
 *   - Routine ops where running SQL feels heavier than necessary.
 *
 * Usage:
 *   npm --workspace backend run promote:admin -- <email> [role]
 *
 *   role defaults to ADMIN. Valid values: USER | REVIEWER | MANAGER | ADMIN.
 *
 * Examples:
 *   npm --workspace backend run promote:admin -- alice@example.com
 *   npm --workspace backend run promote:admin -- bob@example.com MANAGER
 *
 * Behaviour:
 *   - Looks up the user by exact email match (case-sensitive — Postgres
 *     stores emails verbatim; if you're unsure, query the DB first).
 *   - If found, updates `role` to the requested value. If `isActive` is
 *     false, it ALSO sets it back to true (this script's intent is "make
 *     this user able to act"; a passive lockout is unfriendly).
 *   - Refuses to demote the last active ADMIN — same safety policy as
 *     the User Management UI.
 *   - Prints the before/after row. No audit row is written because this
 *     bypasses the request layer (`req.authUser` is not available from a
 *     CLI); the change is intentionally visible only in DB state. Run
 *     this from a trusted shell only.
 */

import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";

const VALID_ROLES: Role[] = ["USER", "REVIEWER", "MANAGER", "ADMIN"];

async function main(): Promise<void> {
  const [, , emailArg, roleArg = "ADMIN"] = process.argv;

  if (!emailArg) {
    console.error("Usage: npm --workspace backend run promote:admin -- <email> [role]");
    console.error("       role defaults to ADMIN. Valid: USER | REVIEWER | MANAGER | ADMIN");
    process.exit(2);
  }
  const email = emailArg.trim();

  if (!(VALID_ROLES as string[]).includes(roleArg)) {
    console.error(`Invalid role: "${roleArg}". Valid: ${VALID_ROLES.join(" | ")}`);
    process.exit(2);
  }
  const targetRole = roleArg as Role;

  const prisma = new PrismaClient();
  try {
    const before = await prisma.user.findUnique({ where: { email } });
    if (!before) {
      console.error(`User not found by email: ${email}`);
      console.error("(if the user signed in but you don't see them, check the case — Postgres email match is case-sensitive)");
      process.exit(1);
    }

    if (before.role === targetRole && before.isActive) {
      console.log(`No change needed — user is already ${targetRole} and active.`);
      console.log("Current row:", { id: before.id, email: before.email, role: before.role, isActive: before.isActive });
      process.exit(0);
    }

    // Last-active-ADMIN guard: if we'd be demoting an active ADMIN to non-ADMIN
    // and they are the only active ADMIN, refuse.
    if (before.role === "ADMIN" && targetRole !== "ADMIN" && before.isActive) {
      const otherActiveAdmins = await prisma.user.count({
        where: { role: "ADMIN", isActive: true, NOT: { id: before.id } },
      });
      if (otherActiveAdmins < 1) {
        console.error("Refusing to demote the last active ADMIN — system would have zero admins.");
        console.error("Promote someone else to ADMIN first, then re-run this command.");
        process.exit(1);
      }
    }

    const after = await prisma.user.update({
      where: { id: before.id },
      data: { role: targetRole, isActive: true },
    });

    console.log("Before:", { id: before.id, email: before.email, role: before.role, isActive: before.isActive });
    console.log("After: ", { id: after.id, email: after.email, role: after.role, isActive: after.isActive });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("promote:admin failed:", err);
  process.exit(1);
});
