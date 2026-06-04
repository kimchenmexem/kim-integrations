import { PrismaClient, Prisma } from "@prisma/client";

// DATABASE_URL is loaded from .env via dotenv/config in index.ts (entry point).
// Prisma reads DATABASE_URL automatically; no override needed here.
export const prisma = new PrismaClient();

/**
 * Either the global PrismaClient or a transaction-scoped client from
 * `prisma.$transaction(async (tx) => ...)`. Services accept this union so
 * callers can compose them inside a larger transaction (e.g. to make a
 * mutation + audit-log insert atomic).
 */
export type DbClient = typeof prisma | Prisma.TransactionClient;
