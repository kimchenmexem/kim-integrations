/**
 * Seed the glossary with core financial terms per locale.
 *
 * Idempotent: skips terms that already exist (by sourceTerm + localeCode).
 * Run: npm --workspace backend run seed:glossary
 */

import { prisma } from "../db";

interface GlossaryEntry {
  sourceTerm: string;
  translations: Record<string, string>;
  notes?: string;
  required?: boolean;
}

const GLOSSARY: GlossaryEntry[] = [
  // ─── Brand / Product (never translate) ────────────────────────────
  {
    sourceTerm: "MEXEM",
    translations: { _all: "MEXEM" },
    notes: "Brand name — never translate or modify.",
    required: true,
  },
  {
    sourceTerm: "WisdomTree",
    translations: { _all: "WisdomTree" },
    notes: "Partner brand name — never translate.",
    required: true,
  },

  // ─── Core Financial Terms ─────────────────────────────────────────
  {
    sourceTerm: "commission-free",
    translations: {
      "it-IT": "senza commissioni",
      "fr-FR": "sans commission",
      "fr-BE": "sans commission",
      "nl-NL": "commissievrij",
      "nl-BE": "commissievrij",
      "es-ES": "sin comisiones",
      "en-GB": "commission-free",
    },
  },
  {
    sourceTerm: "trading platform",
    translations: {
      "it-IT": "piattaforma di negoziazione",
      "fr-FR": "plateforme de négociation",
      "fr-BE": "plateforme de négociation",
      "nl-NL": "handelsplatform",
      "nl-BE": "handelsplatform",
      "es-ES": "plataforma de negociación",
      "en-GB": "trading platform",
    },
  },
  {
    sourceTerm: "shares",
    translations: {
      "it-IT": "azioni",
      "fr-FR": "actions",
      "fr-BE": "actions",
      "nl-NL": "aandelen",
      "nl-BE": "aandelen",
      "es-ES": "acciones",
      "en-GB": "shares",
    },
    notes: "Use 'shares' not 'stocks' in British English. In other languages, use the standard local term for equities.",
  },
  {
    sourceTerm: "portfolio",
    translations: {
      "it-IT": "portafoglio",
      "fr-FR": "portefeuille",
      "fr-BE": "portefeuille",
      "nl-NL": "portefeuille",
      "nl-BE": "portefeuille",
      "es-ES": "cartera",
      "en-GB": "portfolio",
    },
  },
  {
    sourceTerm: "ETF",
    translations: { _all: "ETF" },
    notes: "Industry standard abbreviation — keep as-is in all languages.",
    required: true,
  },
  {
    sourceTerm: "ETP",
    translations: { _all: "ETP" },
    notes: "Industry standard abbreviation — keep as-is in all languages.",
    required: true,
  },
  {
    sourceTerm: "bonds",
    translations: {
      "it-IT": "obbligazioni",
      "fr-FR": "obligations",
      "fr-BE": "obligations",
      "nl-NL": "obligaties",
      "nl-BE": "obligaties",
      "es-ES": "bonos",
      "en-GB": "bonds",
    },
  },
  {
    sourceTerm: "equities",
    translations: {
      "it-IT": "azioni",
      "fr-FR": "actions",
      "fr-BE": "actions",
      "nl-NL": "aandelen",
      "nl-BE": "aandelen",
      "es-ES": "renta variable",
      "en-GB": "equities",
    },
  },
  {
    sourceTerm: "funds",
    translations: {
      "it-IT": "fondi",
      "fr-FR": "fonds",
      "fr-BE": "fonds",
      "nl-NL": "fondsen",
      "nl-BE": "fondsen",
      "es-ES": "fondos",
      "en-GB": "funds",
    },
  },
  {
    sourceTerm: "options",
    translations: {
      "it-IT": "opzioni",
      "fr-FR": "options",
      "fr-BE": "options",
      "nl-NL": "opties",
      "nl-BE": "opties",
      "es-ES": "opciones",
      "en-GB": "options",
    },
  },
  {
    sourceTerm: "futures",
    translations: { _all: "futures" },
    notes: "Used as-is in most European financial contexts.",
  },
  {
    sourceTerm: "real-time data",
    translations: {
      "it-IT": "dati in tempo reale",
      "fr-FR": "données en temps réel",
      "fr-BE": "données en temps réel",
      "nl-NL": "real-time data",
      "nl-BE": "real-time data",
      "es-ES": "datos en tiempo real",
      "en-GB": "real-time data",
    },
  },
  {
    sourceTerm: "fees",
    translations: {
      "it-IT": "commissioni",
      "fr-FR": "frais",
      "fr-BE": "frais",
      "nl-NL": "kosten",
      "nl-BE": "kosten",
      "es-ES": "tarifas",
      "en-GB": "fees",
    },
  },
  {
    sourceTerm: "transparent pricing",
    translations: {
      "it-IT": "prezzi trasparenti",
      "fr-FR": "tarification transparente",
      "fr-BE": "tarification transparente",
      "nl-NL": "transparante tarieven",
      "nl-BE": "transparante tarieven",
      "es-ES": "precios transparentes",
      "en-GB": "transparent pricing",
    },
  },
  {
    sourceTerm: "stock exchange",
    translations: {
      "it-IT": "borsa valori",
      "fr-FR": "bourse",
      "fr-BE": "bourse",
      "nl-NL": "effectenbeurs",
      "nl-BE": "effectenbeurs",
      "es-ES": "bolsa de valores",
      "en-GB": "stock exchange",
    },
  },
  {
    sourceTerm: "investment",
    translations: {
      "it-IT": "investimento",
      "fr-FR": "investissement",
      "fr-BE": "investissement",
      "nl-NL": "belegging",
      "nl-BE": "belegging",
      "es-ES": "inversión",
      "en-GB": "investment",
    },
  },
  {
    sourceTerm: "investor",
    translations: {
      "it-IT": "investitore",
      "fr-FR": "investisseur",
      "fr-BE": "investisseur",
      "nl-NL": "belegger",
      "nl-BE": "belegger",
      "es-ES": "inversor",
      "en-GB": "investor",
    },
  },
  {
    sourceTerm: "regulated",
    translations: {
      "it-IT": "regolamentato",
      "fr-FR": "réglementé",
      "fr-BE": "réglementé",
      "nl-NL": "gereguleerd",
      "nl-BE": "gereguleerd",
      "es-ES": "regulado",
      "en-GB": "regulated",
    },
  },
  {
    sourceTerm: "account",
    translations: {
      "it-IT": "conto",
      "fr-FR": "compte",
      "fr-BE": "compte",
      "nl-NL": "rekening",
      "nl-BE": "rekening",
      "es-ES": "cuenta",
      "en-GB": "account",
    },
  },
  {
    sourceTerm: "order",
    translations: {
      "it-IT": "ordine",
      "fr-FR": "ordre",
      "fr-BE": "ordre",
      "nl-NL": "order",
      "nl-BE": "order",
      "es-ES": "orden",
      "en-GB": "order",
    },
  },
  {
    sourceTerm: "risk warning",
    translations: {
      "it-IT": "avvertenza sui rischi",
      "fr-FR": "avertissement sur les risques",
      "fr-BE": "avertissement sur les risques",
      "nl-NL": "risicowaarschuwing",
      "nl-BE": "risicowaarschuwing",
      "es-ES": "advertencia de riesgo",
      "en-GB": "risk warning",
    },
  },
  {
    sourceTerm: "capital at risk",
    translations: {
      "it-IT": "capitale a rischio",
      "fr-FR": "capital à risque",
      "fr-BE": "capital à risque",
      "nl-NL": "kapitaal staat op het spel",
      "nl-BE": "kapitaal staat op het spel",
      "es-ES": "capital en riesgo",
      "en-GB": "capital at risk",
    },
    notes: "Standard risk disclaimer phrasing — must be consistent across all marketing materials.",
  },
  {
    sourceTerm: "past performance",
    translations: {
      "it-IT": "performance passate",
      "fr-FR": "performances passées",
      "fr-BE": "performances passées",
      "nl-NL": "resultaten in het verleden",
      "nl-BE": "resultaten in het verleden",
      "es-ES": "rendimiento pasado",
      "en-GB": "past performance",
    },
    notes: "Used in regulatory disclaimers — keep phrasing consistent.",
  },
];

const ALL_LOCALES = ["it-IT", "fr-FR", "nl-NL", "nl-BE", "fr-BE", "es-ES", "en-GB"];

async function main() {
  console.log("Seeding glossary terms...\n");

  let created = 0;
  let skipped = 0;

  for (const entry of GLOSSARY) {
    // Determine which locales this entry covers
    const isAllLocales = "_all" in entry.translations;
    const locales = isAllLocales ? ALL_LOCALES : Object.keys(entry.translations);

    for (const locale of locales) {
      const targetTerm = isAllLocales
        ? entry.translations._all
        : entry.translations[locale];

      if (!targetTerm) continue;

      // Check if already exists
      const existing = await prisma.glossaryTerm.findFirst({
        where: { sourceTerm: entry.sourceTerm, localeCode: locale },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.glossaryTerm.create({
        data: {
          sourceTerm: entry.sourceTerm,
          targetTerm,
          localeCode: locale,
          required: entry.required ?? false,
          forbidden: false,
          notes: entry.notes ?? null,
        },
      });
      created++;
    }
  }

  // Also create locale-null entries for brand names (required terms)
  for (const entry of GLOSSARY.filter(e => e.required && "_all" in e.translations)) {
    const existing = await prisma.glossaryTerm.findFirst({
      where: { sourceTerm: entry.sourceTerm, localeCode: null },
    });
    if (!existing) {
      await prisma.glossaryTerm.create({
        data: {
          sourceTerm: entry.sourceTerm,
          targetTerm: entry.translations._all,
          localeCode: null,
          required: true,
          forbidden: false,
          notes: entry.notes ?? null,
        },
      });
      created++;
    }
  }

  console.log(`Done. Created: ${created}, Skipped (already exist): ${skipped}`);

  const total = await prisma.glossaryTerm.count();
  console.log(`Total glossary terms in DB: ${total}`);
}

main()
  .catch((err) => { console.error("Seed failed:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
