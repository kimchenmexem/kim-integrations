/**
 * Seeds the PublisherSource table with the V1 curated publisher registry.
 *
 * Idempotent: re-running updates every field except createdAt.
 * Usage:
 *   npm --workspace backend run db:seed:publishers
 */

import { prisma } from "../db";
import { PUBLISHER_SOURCES } from "../publishers/registry-seed";

async function main() {
  console.log(`Seeding ${PUBLISHER_SOURCES.length} publisher sources...\n`);

  let created = 0;
  let updated = 0;

  for (const src of PUBLISHER_SOURCES) {
    const row = {
      code: src.code,
      name: src.name,
      country: src.country,
      localeScope: JSON.stringify(src.localeScope),
      language: src.language,
      sourceClass: src.sourceClass,
      audienceType: src.audienceType,
      ingestionMode: src.ingestionMode,
      canonicalUrl: src.canonicalUrl,
      coverageFocus: JSON.stringify(src.coverageFocus),
      relationshipType: src.relationshipType,
      active: src.active,
      notes: src.notes ?? null,
      authorityScore: src.scoring?.authorityScore ?? 50,
      audienceIntentScore: src.scoring?.audienceIntentScore ?? 50,
      brandSafetyScore: src.scoring?.brandSafetyScore ?? 70,
      partnerPriority: src.scoring?.partnerPriority ?? 50,
      marketRelevanceScore: src.scoring?.marketRelevanceScore ?? 50,
      funnelRolesJson: JSON.stringify(src.funnelRoles ?? []),
      includeTagsJson: src.includeTags ? JSON.stringify(src.includeTags) : null,
      includePathsJson: src.includePaths ? JSON.stringify(src.includePaths) : null,
      excludeTagsJson: src.excludeTags ? JSON.stringify(src.excludeTags) : null,
      excludePathsJson: src.excludePaths ? JSON.stringify(src.excludePaths) : null,
    };

    const existing = await prisma.publisherSource.findUnique({ where: { code: src.code } });
    if (existing) {
      await prisma.publisherSource.update({ where: { code: src.code }, data: row });
      updated++;
      console.log(`  ↻  updated  ${src.code.padEnd(20)} ${src.country}  ${src.name}`);
    } else {
      await prisma.publisherSource.create({ data: row });
      created++;
      console.log(`  ✓  created  ${src.code.padEnd(20)} ${src.country}  ${src.name}`);
    }
  }

  console.log(`\nDone. ${created} created, ${updated} updated.`);
}

main()
  .catch((err) => { console.error("Seed failed:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
