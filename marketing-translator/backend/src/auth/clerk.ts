import { createClerkClient } from "@clerk/express";
import { config } from "../config";

/**
 * Single Clerk client instance for server-side API calls (user lookup during
 * bootstrap, etc.). `null` when Clerk is not configured — callers must handle
 * that case rather than crash.
 */
export const clerkClient = config.clerkEnabled
  ? createClerkClient({
      secretKey: config.clerkSecretKey,
      publishableKey: config.clerkPublishableKey,
    })
  : null;
