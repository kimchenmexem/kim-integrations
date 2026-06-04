// Deterministic post-process rewrite rules.
//
// Runs AFTER the LLM + quality gate, BEFORE the final compliance check.
// The LLM prompt asks for the right wording, but for term-level decisions
// the brand wants exact replacements that don't drift between runs.
// Each rule is a regex + replacement pair targeted at a single observed
// regression from the reviewer feedback log.
//
// Adding a rule:
//   1. Drop it into the per-locale list below
//   2. Add a row to backend/src/test/translation-rewrite-tests.ts
//
// Rules are ordered: earlier rules see the original LLM output, later
// rules see the result of earlier rewrites. Keep dependent rules in
// order — e.g. acronym-plural normalization runs before any rule that
// matches on the (now-singular) acronym.

export interface RewriteRule {
  id: string;
  description: string;
  pattern: RegExp;
  replacement: string | ((match: string, ...groups: string[]) => string);
}

export interface RewriteResult {
  text: string;
  fired: { id: string; before: string; after: string }[];
}

/**
 * Capitalize the first letter of `replacement` when the original `source`
 * started with an uppercase letter. Used by replacement callbacks so the
 * rewriter doesn't downcase headline-style copy.
 */
function matchCase(source: string, replacement: string): string {
  if (!source || !replacement) return replacement;
  // First char is uppercase if its lowercased form differs from itself.
  // This handles accented Latin (É, À, …) which charCodeAt-based checks miss.
  const first = source.charAt(0);
  if (first !== first.toLowerCase() && first === first.toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

// Unicode-letter boundaries. JS `\b` treats accented chars (é, à, …) as
// NON-word characters, so `\b` next to "économiser" or "Échangez" fails to
// match the way it does for plain ASCII words. These lookarounds use a
// Latin character class wide enough to cover IT/FR/NL/ES diacritics.
const LB = "(?<![A-Za-zÀ-ÖØ-öø-ÿ])";
const RB = "(?![A-Za-zÀ-ÖØ-öø-ÿ])";

// ── Shared (all non-English locales) ───────────────────────────────────────
// Continental European languages keep foreign financial acronyms invariable:
// the English -s plural reads as a typo in IT/FR/NL/ES marketing copy.
// English (en-GB) keeps its native plurals, so this rule is per-locale not
// global.
const SHARED_NON_EN_RULES: RewriteRule[] = [
  {
    id: "acronym-no-plural-s",
    description: "Strip plural -s from foreign finance acronyms (ETFs→ETF)",
    pattern: /\b(ETF|ETP|CFD|REIT|ADR)s\b/g,
    replacement: "$1",
  },
];

// ── Italian (it-IT) ─────────────────────────────────────────────────────────
// Rules driven by the reviewer feedback log dated 2026-05-26.
const IT_RULES: RewriteRule[] = [
  // "UE" used as an adjective sounds like the bureaucratic "Unione Europea"
  // entity, not the natural Italian adjective. Italian wants gender/number
  // agreement with the noun. Handle the common phrases observed in the
  // marketing copy — singular masculine ("broker"), plural feminine
  // ("azioni"), and ETF/ETP which are foreign masculine plural.
  {
    id: "it-ue-adj-broker",
    description: "Broker UE → broker europeo (m.sg)",
    pattern: /\b(broker)\s+(?:UE|EU)\b/gi,
    replacement: (_m, w) => `${w} europeo`,
  },
  {
    id: "it-ue-adj-azioni",
    description: "azioni UE → azioni europee (f.pl)",
    pattern: /\bazioni\s+(?:UE|EU)\b/gi,
    replacement: "azioni europee",
  },
  {
    id: "it-ue-adj-azione",
    description: "azione UE → azione europea (f.sg)",
    pattern: /\bazione\s+(?:UE|EU)\b/gi,
    replacement: "azione europea",
  },
  {
    id: "it-ue-adj-piattaforme",
    description: "piattaforme UE → piattaforme europee (f.pl)",
    pattern: /\bpiattaforme\s+(?:UE|EU)\b/gi,
    replacement: "piattaforme europee",
  },
  {
    id: "it-ue-adj-piattaforma",
    description: "piattaforma UE → piattaforma europea (f.sg)",
    pattern: /\bpiattaforma\s+(?:UE|EU)\b/gi,
    replacement: "piattaforma europea",
  },
  {
    id: "it-ue-adj-etf",
    description: "ETF/ETP UE → ETF/ETP europei (m.pl)",
    pattern: /\b(ETF|ETP)\s+(?:UE|EU)\b/g,
    replacement: "$1 europei",
  },
  {
    id: "it-ue-adj-investitori",
    description: "investitori UE → investitori europei (m.pl)",
    pattern: /\binvestitori\s+(?:UE|EU)\b/gi,
    replacement: "investitori europei",
  },
  {
    id: "it-ue-adj-mercati",
    description: "mercati UE → mercati europei (m.pl)",
    pattern: /\bmercati\s+(?:UE|EU)\b/gi,
    replacement: "mercati europei",
  },
  // Periphrastic "dell'UE / dell'EU" (of the EU) — appears in body copy when
  // the LLM resolves "EU stocks" as a possessive construction rather than
  // the simpler adjective. Same agreement table as the bare-noun rules.
  {
    id: "it-ue-adj-dell-broker",
    description: "broker(s) dell'UE → europeo/i (m)",
    pattern: /\b(brokers?)\s+dell['’]\s*(?:UE|EU)\b/gi,
    replacement: (_m, w) => `${w} ${w.toLowerCase().endsWith("s") ? "europei" : "europeo"}`,
  },
  {
    id: "it-ue-adj-dell-azioni",
    description: "azioni dell'UE → azioni europee (f.pl)",
    pattern: /\bazioni\s+dell['’]\s*(?:UE|EU)\b/gi,
    replacement: "azioni europee",
  },
  {
    id: "it-ue-adj-dell-etf",
    description: "ETF/ETP dell'UE → europei (m.pl)",
    pattern: /\b(ETF|ETP)\s+dell['’]\s*(?:UE|EU)\b/g,
    replacement: "$1 europei",
  },
  {
    id: "it-ue-adj-dell-investitori",
    description: "investitori dell'UE → investitori europei",
    pattern: /\binvestitori\s+dell['’]\s*(?:UE|EU)\b/gi,
    replacement: "investitori europei",
  },
  {
    id: "it-ue-adj-dell-mercati",
    description: "mercati dell'UE → mercati europei",
    pattern: /\bmercati\s+dell['’]\s*(?:UE|EU)\b/gi,
    replacement: "mercati europei",
  },

  // "a basso costo" reads like discount-supermarket copy in Italian. For
  // brokerage / trading context the brand prefers "con commissioni
  // competitive". Scope the rule to finance-adjacent anchors (broker,
  // trading, ETF, ETP, azioni, piattaforma) so we don't mangle unrelated
  // copy like "voli a basso costo".
  {
    id: "it-basso-costo-finance",
    description: "<finance-anchor> … a basso costo → … con commissioni competitive",
    pattern:
      /\b((?:broker|trading|ETF|ETP|azioni|azione|piattaforma|piattaforme)[^.,]*?)\s+a\s+basso\s+costo\b/gi,
    replacement: (_m, w) => `${w} con commissioni competitive`,
  },

  // "tariffa" / "tariffaria" in fee contexts — the correct finance term is
  // "commissione" / "commissionale". Scope tightly to the observed patterns
  // to avoid touching unrelated uses (e.g. transport fares).
  {
    id: "it-tariffa-fissa",
    description: "tariffa fissa → commissione fissa",
    pattern: /\btariff[ae]\s+fiss[ae]\b/gi,
    replacement: (m) =>
      matchCase(m, m.toLowerCase().includes("tariffe") ? "commissioni fisse" : "commissione fissa"),
  },
  {
    id: "it-struttura-tariffaria",
    description: "struttura tariffaria → struttura commissionale",
    pattern: /\bstruttur[ae]\s+tariffari[ae]\b/gi,
    replacement: (m) =>
      matchCase(
        m,
        m.toLowerCase().startsWith("strutture") ? "strutture commissionali" : "struttura commissionale"
      ),
  },

  // "trading frazionale" — wrong word. The Italian financial term is
  // "trading frazionato" (also "azioni frazionate" / "frazionarie").
  {
    id: "it-trading-frazionale",
    description: "trading frazionale → trading frazionato",
    pattern: /\btrading\s+frazional[ei]\b/gi,
    replacement: "trading frazionato",
  },

  // Term-level fee adjective fixes from the 2026-05-26 reviewer log.
  // "stabili" reads as static/unchanging; "fisse" is the precise finance
  // term. "eque" (fair) reads judgemental; "trasparenti" is the brand voice.
  {
    id: "it-commissioni-stabili",
    description: "commissioni stabili → commissioni fisse",
    pattern: /\bcommissioni\s+stabili\b/gi,
    replacement: (m) => matchCase(m, "commissioni fisse"),
  },
  {
    id: "it-commissioni-eque",
    description: "commissioni eque → commissioni trasparenti",
    pattern: /\bcommissioni\s+eque\b/gi,
    replacement: (m) => matchCase(m, "commissioni trasparenti"),
  },

  // Marketing imperatives the reviewer flagged as unnatural.
  // "Eleva" reads as physical lifting; "Migliora" is the natural brand
  // verb. The pattern is scoped to capitalised verb form so we don't
  // touch occurrences of "elevato/elevata" or similar non-verb forms.
  {
    id: "it-eleva-migliora",
    description: "Eleva (imp.) → Migliora",
    pattern: /\bEleva\b/g,
    replacement: "Migliora",
  },
  {
    id: "it-consulenza-esperta",
    description: "consulenza esperta → supporto specializzato",
    pattern: /\bconsulenza\s+esperta\b/gi,
    replacement: (m) => matchCase(m, "supporto specializzato"),
  },
  {
    id: "it-investi-con-intelligenza",
    description: "Investi con intelligenza → Investi in modo intelligente",
    pattern: /\bInvesti\s+con\s+intelligenza\b/gi,
    replacement: (m) => matchCase(m, "Investi in modo intelligente"),
  },
  {
    id: "it-agisci-ora",
    description: "Agisci ora → Inizia oggi",
    pattern: /\bAgisci\s+ora\b/gi,
    replacement: (m) => matchCase(m, "Inizia oggi"),
  },
  {
    id: "it-stabilisci-programma",
    description: "stabilisci il tuo programma → imposta il tuo piano",
    pattern: /\bstabilisci\s+il\s+tuo\s+programma\b/gi,
    replacement: (m) => matchCase(m, "imposta il tuo piano"),
  },
  // "di trading <adj>" reads as a noun-of-noun compound; Italian financial
  // copy uses "per il trading <adj>" (broker / platform FOR <adj> trading).
  // Scoped to adjectives that actually appear in the brand's domain so we
  // don't touch unrelated "di trading" constructions like "Fai trading di".
  {
    id: "it-di-trading-azionario",
    description: "di trading <adj> → per il trading <adj>",
    pattern: /\bdi\s+trading\s+(azionario|obbligazionario|internazionale|professionale|frazionato)\b/gi,
    replacement: (_m, adj) => `per il trading ${adj.toLowerCase()}`,
  },
  // Sentence-end word order: "… con commissioni basse in Europa" reads as
  // an awkward tail in Italian — the geographic scope belongs nearer the
  // main verb. Swap so "in Europa" sits before the fee qualifier.
  {
    id: "it-word-order-in-europa-end",
    description: "… con commissioni basse in Europa → … in Europa con commissioni basse",
    pattern: /\bcon\s+commissioni\s+(basse|ridotte|competitive|contenute)\s+in\s+Europa\b/gi,
    replacement: (_m, adj) => `in Europa con commissioni ${adj.toLowerCase()}`,
  },
  // Title-case → sentence-case + singular→plural for a specific MEXEM
  // slogan the reviewer flagged as unnatural in Italian.
  {
    id: "it-potere-investimento",
    description: "Il Potere dell'Investimento nelle Tue Mani → singular→plural + case",
    pattern: /Il Potere dell['’]Investimento nelle Tue Mani/g,
    replacement: "Il potere degli investimenti nelle tue mani",
  },
];

// ── French (fr-FR / fr-BE) ──────────────────────────────────────────────────
// Rules driven by the reviewer feedback log dated 2026-05-26 (FR + FR-BL
// sheets). FR and FR-BE share these rules — the BL sheet's distinctions are
// register/style choices that don't yield deterministic regex rewrites.
const FR_RULES: RewriteRule[] = [
  // "négociation" / "négocier" / "négociez" — the reviewer wrote:
  // "We keep 'trading' as is. The word 'négociation' is never used for the
  // stock market in French." MEXEM is a stock-trading platform so the
  // domain-broad replacement is safe.
  {
    id: "fr-negociation-trading",
    description: "négociation (noun) → trading",
    pattern: /\bnégociation\b/gi,
    replacement: (m) => matchCase(m, "trading"),
  },
  {
    id: "fr-negocier-trader",
    description: "négocier (inf.) → trader",
    pattern: /\bnégocier\b/gi,
    replacement: (m) => matchCase(m, "trader"),
  },
  {
    id: "fr-negociez-tradez",
    description: "négociez (2pl imp.) → tradez",
    pattern: /\bnégociez\b/gi,
    replacement: (m) => matchCase(m, "tradez"),
  },
  // "Échangez" used for "Trade X" reads as currency-exchange in French.
  // In the marketing copy the verb is always trading. Scope to the start
  // of a phrase + a stock/ETF-flavoured complement. Use LB/RB instead of
  // \b — JS \b doesn't recognise É as a letter.
  {
    id: "fr-echangez-tradez",
    description: "Échangez des → Tradez des",
    pattern: new RegExp(`${LB}Échangez\\s+des${RB}`, "g"),
    replacement: "Tradez des",
  },

  // "UE" as adjective → "européen / européenne / européens / européennes"
  // with French gender/number agreement. Handles both bare "X UE" and the
  // periphrastic "X de l'UE" form (reviewer used the latter in fr-BE).
  {
    id: "fr-ue-adj-courtier",
    description: "courtier(s) [de l']UE → européen(s) (m)",
    pattern: /\b(courtiers?)\s+(?:de\s+l['’]\s*)?UE\b/gi,
    replacement: (_m, w) => `${w} ${w.toLowerCase().endsWith("s") ? "européens" : "européen"}`,
  },
  {
    id: "fr-ue-adj-investisseurs",
    description: "investisseurs UE / investisseurs de l'UE → investisseurs européens",
    pattern: /\b(investisseurs)\s+(?:de\s+l['’]\s*)?UE\b/gi,
    replacement: (_m, w) => `${w} européens`,
  },
  {
    id: "fr-ue-adj-actions",
    description: "actions UE / actions de l'UE → actions européennes",
    pattern: /\b(actions)\s+(?:de\s+l['’]\s*)?UE\b/gi,
    replacement: (_m, w) => `${w} européennes`,
  },
  {
    id: "fr-ue-adj-plateformes",
    description: "plateformes UE → plateformes européennes",
    pattern: /\b(plateformes?)\s+(?:de\s+l['’]\s*)?UE\b/gi,
    replacement: (_m, w) =>
      `${w} ${w.toLowerCase().endsWith("s") ? "européennes" : "européenne"}`,
  },
  {
    id: "fr-ue-adj-marches",
    description: "marché(s) UE → européen(s)",
    pattern: /\b(marchés?)\s+(?:de\s+l['’]\s*)?UE\b/gi,
    replacement: (_m, w) => `${w} ${w.toLowerCase().endsWith("s") ? "européens" : "européen"}`,
  },
  {
    id: "fr-ue-adj-etf",
    description: "ETF/ETP UE → ETF/ETP européens",
    pattern: /\b(ETF|ETP)\s+(?:de\s+l['’]\s*)?UE\b/g,
    replacement: "$1 européens",
  },

  // "alimenté par l'IA" reads as "powered/fed-by", which in French is the
  // electric/food sense. For AI features the reviewer wants "propulsé".
  // Match the full agreement set (e/s) at once.
  {
    id: "fr-alimente-par-ia",
    description: "alimenté(e)(s) par l'IA → propulsé(e)(s) par l'IA",
    pattern: /\balimenté(e)?(s)?\s+par\s+l['’]\s*IA\b/gi,
    replacement: (m, fem, plur) =>
      matchCase(m, `propulsé${fem ?? ""}${plur ?? ""} par l'IA`),
  },

  // "économiser" / "économisez" — for savings/financial growth, French
  // marketing uses "épargner". Domain decision per reviewer comment:
  // "Épargnez (Save/Invest) is the correct term for financial growth
  // and long-term savings." Same domain safety as the trading rule.
  {
    id: "fr-economiser-epargner",
    description: "économiser (inf.) → épargner",
    pattern: new RegExp(`${LB}économiser${RB}`, "gi"),
    replacement: (m) => matchCase(m, "épargner"),
  },
  {
    id: "fr-economisez-epargnez",
    description: "économisez → épargnez",
    pattern: new RegExp(`${LB}économisez${RB}`, "gi"),
    replacement: (m) => matchCase(m, "épargnez"),
  },

  // "frais stables" — reviewer comment: "'Frais fixes' is a more precise
  // financial term than 'stables'."
  {
    id: "fr-frais-stables",
    description: "frais stables → frais fixes",
    pattern: /\bfrais\s+stables\b/gi,
    replacement: (m) => matchCase(m, "frais fixes"),
  },
];

// ── Dutch (nl-NL / nl-BE) ───────────────────────────────────────────────────
// Rules driven by the reviewer feedback log dated 2026-05-26 (DU-NL + DU-BL
// sheets). The two locales share the deterministic patterns. Belgian Flemish
// has additional register preferences (e.g. investeren over beleggen in some
// imperatives) that are too contextual for regex — left for a future round.
const NL_RULES: RewriteRule[] = [
  // "handelsplatform(en)" sounds dated; the reviewer wants "tradingplatform".
  // Handle singular + plural in one pattern.
  {
    id: "nl-handelsplatform-tradingplatform",
    description: "handelsplatform(en) → tradingplatform(en)",
    pattern: /\bhandelsplatform(en)?\b/gi,
    replacement: (m, plur) => matchCase(m, `tradingplatform${plur ?? ""}`),
  },

  // "goedkoop/goedkope/goedkoopste" reads as cheap/low-quality; the
  // reviewer prefers "voordelig/voordelige/voordeligste" — better value.
  {
    id: "nl-goedkoopste-voordeligste",
    description: "goedkoopste → voordeligste (sup.)",
    pattern: /\bgoedkoopste\b/gi,
    replacement: (m) => matchCase(m, "voordeligste"),
  },
  {
    id: "nl-goedkope-voordelige",
    description: "goedkope / goedkoper → voordelige / voordeliger",
    pattern: /\bgoedkop(e|er)\b/gi,
    replacement: (m, suf) => matchCase(m, `voordelig${suf}`),
  },

  // "EU-aandelen / EU-beleggers" — UE-as-adjective. The reviewer also said
  // "EU Broker or Europese Broker" is acceptable, so EU-broker is NOT
  // rewritten. Dutch capitalises adjectives derived from country/region
  // names, so the result is always "Europese …".
  {
    id: "nl-eu-aandelen",
    description: "EU-aandelen → Europese aandelen",
    pattern: /\bEU[- ]([Aa]andelen)\b/g,
    replacement: "Europese $1",
  },
  {
    id: "nl-eu-beleggers",
    description: "EU-beleggers → Europese beleggers",
    pattern: /\bEU[- ]([Bb]eleggers)\b/g,
    replacement: "Europese $1",
  },

  // "makelaars" in the broker context sounds weird (it overlaps with
  // real-estate agents). Scope tightly to phrases that are obviously
  // broker rankings so we don't touch real-estate copy.
  {
    id: "nl-beste-makelaars-brokers",
    description: "beste makelaar(s) → beste broker(s)",
    pattern: /\bbeste\s+makelaars?\b/gi,
    replacement: (m) => (m.toLowerCase().endsWith("s") ? matchCase(m, "beste brokers") : matchCase(m, "beste broker")),
  },
];

// ── Spanish (es-ES) ─────────────────────────────────────────────────────────
// Rules driven by the reviewer feedback log dated 2026-05-26 (ES sheet).
// NOTE: the ES sheet explicitly keeps "ETFs" with the English plural -s
// (one row showed the output and the correction both as "ETFs"). Spanish
// is therefore OPTED OUT of the shared acronym-no-plural-s rule below.
const ES_RULES: RewriteRule[] = [
  // "Corredor" is the traditional Spanish term but the reviewer prefers
  // the modern "Bróker" Anglicism in marketing. Handle singular + plural
  // with proper -es → -s mapping (Spanish "corredores" → "brókers").
  {
    id: "es-corredor-broker",
    description: "corredor / corredores → bróker / brókers",
    pattern: /\bcorredor(es)?\b/gi,
    replacement: (m, plur) => matchCase(m, plur ? "brókers" : "bróker"),
  },

  // "UE" as adjective → "europeo/a/s/as" with Spanish gender/number
  // agreement. Runs AFTER corredor→bróker so the broker-anchored rule
  // sees the rewritten term.
  {
    id: "es-ue-adj-broker",
    description: "bróker/broker de la UE → … europeo (m.sg)",
    pattern: /\b(brókers?|brokers?)\s+de\s+la\s+(?:UE|EU)\b/gi,
    replacement: (_m, w) => `${w} ${w.toLowerCase().endsWith("s") ? "europeos" : "europeo"}`,
  },
  {
    id: "es-ue-adj-inversores",
    description: "inversores de la UE → inversores europeos",
    pattern: /\b(inversores)\s+de\s+la\s+(?:UE|EU)\b/gi,
    replacement: (_m, w) => `${w} europeos`,
  },
  {
    id: "es-ue-adj-acciones",
    description: "acciones (de la) UE → acciones europeas",
    pattern: /\b(acciones)\s+(?:de\s+la\s+)?UE\b/gi,
    replacement: (_m, w) => `${w} europeas`,
  },
  {
    id: "es-ue-adj-accion",
    description: "acción (de la) UE → acción europea",
    pattern: /\b(acción)\s+(?:de\s+la\s+)?UE\b/gi,
    replacement: (_m, w) => `${w} europea`,
  },
  {
    id: "es-ue-adj-plataformas",
    description: "plataforma(s) de la UE → plataforma(s) europea(s)",
    pattern: /\b(plataformas?)\s+de\s+la\s+(?:UE|EU)\b/gi,
    replacement: (_m, w) =>
      `${w} ${w.toLowerCase().endsWith("s") ? "europeas" : "europea"}`,
  },
  {
    id: "es-ue-adj-mercado",
    description: "mercado(s) de la UE → mercado(s) europeo(s)",
    pattern: /\b(mercados?)\s+de\s+la\s+(?:UE|EU)\b/gi,
    replacement: (_m, w) => `${w} ${w.toLowerCase().endsWith("s") ? "europeos" : "europeo"}`,
  },
];

// ── British English (en-GB) ─────────────────────────────────────────────────
// No rewrites — English keeps its native plurals; no UE/tariffa equivalents.
const EN_RULES: RewriteRule[] = [];

const RULES_BY_LOCALE: Record<string, RewriteRule[]> = {
  "it-IT": [...SHARED_NON_EN_RULES, ...IT_RULES],
  "fr-FR": [...SHARED_NON_EN_RULES, ...FR_RULES],
  "fr-BE": [...SHARED_NON_EN_RULES, ...FR_RULES],
  "nl-NL": [...SHARED_NON_EN_RULES, ...NL_RULES],
  "nl-BE": [...SHARED_NON_EN_RULES, ...NL_RULES],
  // Spanish does NOT inherit the acronym-plural rule — ES reviewer keeps
  // "ETFs" with the English -s. Add it back when a future round confirms.
  "es-ES": ES_RULES,
  "en-GB": EN_RULES,
};

/**
 * Apply locale-specific post-process rewrites. Returns the (possibly
 * rewritten) text plus a log of which rules fired and what they changed.
 * If no rules exist for the locale or none match, returns the input
 * unchanged with an empty `fired` list.
 */
export function applyLocaleRewrites(text: string, locale: string): RewriteResult {
  const rules = RULES_BY_LOCALE[locale];
  if (!rules || rules.length === 0) {
    return { text, fired: [] };
  }

  let current = text;
  const fired: RewriteResult["fired"] = [];
  for (const rule of rules) {
    const before = current;
    const next =
      typeof rule.replacement === "string"
        ? current.replace(rule.pattern, rule.replacement)
        : current.replace(rule.pattern, rule.replacement as (substring: string, ...args: unknown[]) => string);
    if (next !== before) {
      fired.push({ id: rule.id, before, after: next });
      current = next;
    }
  }
  return { text: current, fired };
}

/**
 * Lookup for tests / admin tooling — read-only view of the rules table.
 */
export function getRulesForLocale(locale: string): RewriteRule[] {
  return RULES_BY_LOCALE[locale] ?? [];
}
