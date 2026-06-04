/**
 * Service-to-service authentication for the campaign-copy endpoint only.
 *
 * If CAMPAIGN_COPY_API_KEY is set on the server AND the inbound request
 * presents a matching `Authorization: Bearer <key>`, the request is
 * accepted as a service call and a synthetic req.authUser is populated.
 * Otherwise the request falls through to the standard Clerk-backed
 * requireAuth middleware. The static-key path is scoped to this one
 * route by deliberate design — no other endpoint mounts it.
 */

import type { RequestHandler } from "express";
import { Role } from "@prisma/client";
import { config } from "../config";
import { requireAuth } from "./auth";

export const requireAuthOrApiKey: RequestHandler = (req, res, next) => {
  const expected = config.campaignCopyApiKey;
  if (expected) {
    const header = req.header("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/.exec(header);
    if (match && timingSafeEqual(match[1].trim(), expected)) {
      req.authUser = {
        id: -1,
        email: "service@campaign-copy",
        fullName: "campaign-copy service",
        role: Role.USER,
        isActive: true,
      };
      return next();
    }
  }
  return requireAuth(req, res, next);
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
