/**
 * ComplianceRule CRUD service.
 *
 * Rules are linked to approved (or pending/reviewed) obligations.
 * They hold the machine-executable config that gets compiled into bundles.
 */

import { prisma, type DbClient } from "../../db";

export interface CreateRuleInput {
  obligationId: number;
  ruleType: string;
  config: unknown;
  localeCode?: string | null;
  severity?: string | null;
  enabled?: boolean;
}

export async function createRule(input: CreateRuleInput, db: DbClient = prisma) {
  // Verify obligation exists
  const obligation = await db.complianceObligation.findUnique({
    where: { id: input.obligationId },
  });
  if (!obligation) throw new Error(`Obligation ${input.obligationId} not found.`);

  return db.complianceRule.create({
    data: {
      obligationId: input.obligationId,
      ruleType: input.ruleType,
      configJson: JSON.stringify(input.config),
      localeCode: input.localeCode ?? null,
      severity: input.severity ?? null,
      enabled: input.enabled ?? true,
    },
  });
}

export async function updateRule(id: number, data: Partial<CreateRuleInput>, db: DbClient = prisma) {
  const update: Record<string, unknown> = {};
  if (data.ruleType !== undefined) update.ruleType = data.ruleType;
  if (data.config !== undefined) update.configJson = JSON.stringify(data.config);
  if (data.localeCode !== undefined) update.localeCode = data.localeCode;
  if (data.severity !== undefined) update.severity = data.severity;
  if (data.enabled !== undefined) update.enabled = data.enabled;

  return db.complianceRule.update({ where: { id }, data: update });
}

export async function deleteRule(id: number, db: DbClient = prisma) {
  return db.complianceRule.delete({ where: { id } });
}

export async function listRulesForObligation(obligationId: number) {
  return prisma.complianceRule.findMany({
    where: { obligationId },
    orderBy: { createdAt: "asc" },
  });
}
