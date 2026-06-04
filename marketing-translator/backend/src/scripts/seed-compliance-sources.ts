/**
 * Seeds the RegulatorySource table with the V1 non-crypto source registry.
 *
 * Idempotent: re-running updates every field except `createdAt`.
 * Usage:
 *   npm --workspace backend run db:seed:sources
 */

import { prisma } from "../db";
import { COMPLIANCE_SOURCES } from "../compliance/sources/registry-seed";

async function main() {
  console.log(`Seeding ${COMPLIANCE_SOURCES.length} regulatory sources...\n`);

  let created = 0;
  let updated = 0;

  for (const src of COMPLIANCE_SOURCES) {
    const row = {
      code: src.code,
      name: src.name,
      regulator: src.regulator,
      jurisdiction: src.jurisdiction,
      localeScope: JSON.stringify(src.localeScope),
      sourceType: src.sourceType,
      canonicality: src.canonicality,
      parserKey: src.parserKey,
      pollCadence: src.pollCadence,
      active: src.active,
      baseUrl: src.baseUrl ?? null,
      notes: src.notes ?? null,
    };

    const existing = await prisma.regulatorySource.findUnique({ where: { code: src.code } });
    if (existing) {
      await prisma.regulatorySource.update({ where: { code: src.code }, data: row });
      updated++;
      console.log(`  ↻  updated  ${src.code.padEnd(8)}  (${src.regulator})`);
    } else {
      await prisma.regulatorySource.create({ data: row });
      created++;
      console.log(`  ✓  created  ${src.code.padEnd(8)}  (${src.regulator})`);
    }
  }

  console.log(`\nDone. ${created} created, ${updated} updated.`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
