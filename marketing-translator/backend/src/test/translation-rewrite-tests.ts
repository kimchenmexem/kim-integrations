/**
 * Translation rewrite-rules unit tests.
 * Run with: npx ts-node-dev --transpile-only src/test/translation-rewrite-tests.ts
 *
 * Each `expect()` row pairs an LLM-style draft (the regression we observed
 * in the reviewer feedback log, 2026-05-26) with the desired final text.
 * Self-contained — no DB / no LLM. If a rule changes, the test row also
 * changes; that pairing is the documentation.
 */

import { applyLocaleRewrites } from "../services/translationRewrites";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function expect(name: string, draft: string, expected: string, locale = "it-IT") {
  const out = applyLocaleRewrites(draft, locale).text;
  if (out === expected) {
    passed++;
  } else {
    failed++;
    failures.push(`${name}\n      draft:    ${draft}\n      expected: ${expected}\n      got:      ${out}`);
    console.error(`  FAIL: ${name}`);
  }
}

function section(name: string) {
  console.log(`\n--- ${name} ---`);
}

section("it-IT: acronym pluralisation (ETFs/ETPs)");
expect(
  "ETFs in headline → ETF",
  "Uno dei migliori broker per ETFs in Europa",
  "Uno dei migliori broker per ETF in Europa"
);
expect(
  "fare trading di ETFs → ETF",
  "Una delle migliori piattaforme per fare trading di ETFs in Europa",
  "Una delle migliori piattaforme per fare trading di ETF in Europa"
);
expect(
  "ETPs → ETP",
  "Fai trading di ETPs con commissioni contenute",
  "Fai trading di ETP con commissioni contenute"
);
expect(
  "azioni ed ETFs europei → ETF",
  "Opera su azioni ed ETFs europei a 1€ con MEXEM",
  "Opera su azioni ed ETF europei a 1€ con MEXEM"
);
expect(
  "ETP standalone untouched",
  "broker ETP a zero commissioni*",
  "broker ETP a zero commissioni*"
);

section("it-IT: UE as adjective → europeo/a/i/e");
expect("Broker UE → europeo", "Broker UE", "Broker europeo");
expect("broker UE lowercase", "il broker UE è competitivo", "il broker europeo è competitivo");
expect("azioni UE → europee", "azioni UE a basso prezzo", "azioni europee a basso prezzo");
expect("azione UE → europea", "ogni azione UE", "ogni azione europea");
expect("piattaforme UE → europee", "piattaforme UE moderne", "piattaforme europee moderne");
expect("piattaforma UE → europea", "una piattaforma UE", "una piattaforma europea");
expect("ETF UE → europei", "ETF UE a basso costo", "ETF europei con commissioni competitive");
expect("ETP UE → europei", "ETP UE", "ETP europei");
expect("investitori UE → europei", "per investitori UE", "per investitori europei");

section("it-IT: a basso costo → con commissioni competitive");
expect(
  "broker a basso costo",
  "Broker europeo a basso costo",
  "Broker europeo con commissioni competitive"
);
expect(
  "broker di trading a basso costo (also triggers di→per il rule)",
  "Broker di trading azionario a basso costo",
  "Broker per il trading azionario con commissioni competitive"
);
expect(
  "trading … a basso costo",
  "trading di ETF a basso costo",
  "trading di ETF con commissioni competitive"
);
expect(
  "off-context 'a basso costo' left alone",
  "Voli a basso costo per le vacanze",
  "Voli a basso costo per le vacanze"
);

section("it-IT: tariffa → commissione (finance contexts)");
expect(
  "tariffa fissa → commissione fissa",
  "Broker di trading a tariffa fissa",
  "Broker di trading a commissione fissa"
);
expect(
  "tariffe fisse → commissioni fisse",
  "Operazioni con tariffe fisse",
  "Operazioni con commissioni fisse"
);
expect(
  "struttura tariffaria → struttura commissionale",
  "Struttura tariffaria trasparente",
  "Struttura commissionale trasparente"
);

section("it-IT: trading frazionale → frazionato");
expect(
  "trading frazionale → frazionato",
  "Scopri la flessibilità del trading frazionale",
  "Scopri la flessibilità del trading frazionato"
);

section("it-IT: marketing phrase fixes (2026-05-26 round 2)");
expect("commissioni stabili → commissioni fisse", "Commissioni stabili, costi trasparenti.", "Commissioni fisse, costi trasparenti.");
expect("commissioni eque → commissioni trasparenti", "Fai trading con commissioni eque.", "Fai trading con commissioni trasparenti.");
expect("Eleva → Migliora", "Eleva il tuo portafoglio di ETP.", "Migliora il tuo portafoglio di ETP.");
expect("consulenza esperta → supporto specializzato", "strumenti professionali e consulenza esperta.", "strumenti professionali e supporto specializzato.");
expect("Investi con intelligenza → in modo intelligente", "Investi con intelligenza ogni mese.", "Investi in modo intelligente ogni mese.");
expect("Agisci ora → Inizia oggi", "Accedi ai mercati globali. Agisci ora!", "Accedi ai mercati globali. Inizia oggi!");
expect("stabilisci programma → imposta piano", "Scegli i tuoi asset e stabilisci il tuo programma, mantenendo i tuoi investimenti.", "Scegli i tuoi asset e imposta il tuo piano, mantenendo i tuoi investimenti.");
expect("Il Potere dell'Investimento → degli investimenti (full slogan)", "Il Potere dell'Investimento nelle Tue Mani", "Il potere degli investimenti nelle tue mani");

section("it-IT: di trading <adj> → per il trading <adj>");
expect(
  "Broker di trading azionario → per il trading azionario",
  "Broker di trading azionario a basso costo",
  "Broker per il trading azionario con commissioni competitive"
);
expect(
  "non-adjective 'di trading' left alone (di trading di ETF)",
  "Fai trading di ETF globali.",
  "Fai trading di ETF globali."
);

section("it-IT: word-order — 'in Europa' should sit before fee qualifier");
expect(
  "azioni con commissioni basse in Europa → in Europa con commissioni basse",
  "Come fare trading di azioni con commissioni basse in Europa",
  "Come fare trading di azioni in Europa con commissioni basse"
);
expect(
  "con commissioni contenute in Europa → in Europa con commissioni contenute",
  "Investi in ETF con commissioni contenute in Europa.",
  "Investi in ETF in Europa con commissioni contenute."
);

section("it-IT: dell'UE periphrastic form");
expect("ETF dell'UE → europei", "negoziare ETF dell'UE", "negoziare ETF europei");
expect("ETF dell'EU → europei", "ETF dell'EU a basso costo", "ETF europei con commissioni competitive");
expect("azioni dell'UE → europee", "le azioni dell'UE", "le azioni europee");
expect("investitori dell'UE → europei", "per investitori dell'UE", "per investitori europei");
expect("mercati dell'UE → europei", "accesso ai mercati dell'UE", "accesso ai mercati europei");

section("it-IT: UE OR EU as adjective (English-style abbreviation also caught)");
expect("azioni EU (English-style) → azioni europee", "Operazioni su azioni EU a 1€ con MEXEM", "Operazioni su azioni europee a 1€ con MEXEM");
expect("ETP EU → ETP europei", "[piattaforma ETP EU a zero commissioni]", "[piattaforma ETP europei a zero commissioni]");
expect("broker EU → broker europeo", "Broker EU per ETF", "Broker europeo per ETF");

section("it-IT: combined regressions");
expect(
  "ETFs + 'a basso costo' + word-order swap",
  "Trading di ETFs a basso costo in Europa",
  "Trading di ETF in Europa con commissioni competitive"
);
expect(
  "Broker UE + tariffa fissa",
  "Broker UE a tariffa fissa",
  "Broker europeo a commissione fissa"
);

section("shared rules — acronym plural -s");
// Acronym-plural rule extends to IT/FR/NL (it-IT, fr-FR, fr-BE, nl-NL, nl-BE).
expect(
  "fr-FR strips ETFs → ETF",
  "L'un des meilleurs courtiers pour les ETFs",
  "L'un des meilleurs courtiers pour les ETF",
  "fr-FR"
);
expect(
  "nl-NL strips ETPs → ETP",
  "Toegang tot meer dan 70 ETPs",
  "Toegang tot meer dan 70 ETP",
  "nl-NL"
);
expect(
  "nl-NL leaves Dutch 'ETF's' (apostrophe plural) alone",
  "voor ETF's in Europa",
  "voor ETF's in Europa",
  "nl-NL"
);
expect(
  "es-ES KEEPS ETFs (reviewer-confirmed convention)",
  "Uno de los mejores brókers para ETFs en Europa",
  "Uno de los mejores brókers para ETFs en Europa",
  "es-ES"
);
expect(
  "es-ES — IT-specific 'basso costo' rule does not fire",
  "Broker UE a basso costo",
  "Broker UE a basso costo",
  "es-ES"
);
expect(
  "en-GB — native English plurals preserved",
  "One of the best brokers for ETFs in Europe",
  "One of the best brokers for ETFs in Europe",
  "en-GB"
);
expect(
  "unknown locale → no-op",
  "ETFs and ETPs",
  "ETFs and ETPs",
  "xx-XX"
);

section("fr-FR: négociation → trading family");
expect(
  "Négociation en ligne → Trading en ligne",
  "Négociation en ligne",
  "Trading en ligne",
  "fr-FR"
);
expect(
  "Plateformes de négociation → de trading",
  "Plateformes de négociation abordables en Europe",
  "Plateformes de trading abordables en Europe",
  "fr-FR"
);
expect(
  "courtiers en négociation → en trading",
  "L'un des meilleurs courtiers en négociation avec des frais réduits",
  "L'un des meilleurs courtiers en trading avec des frais réduits",
  "fr-FR"
);
expect(
  "négocier → trader",
  "Comment négocier des actions avec des frais réduits en Europe",
  "Comment trader des actions avec des frais réduits en Europe",
  "fr-FR"
);
expect(
  "négociez → tradez",
  "Négociez des actions américaines",
  "Tradez des actions américaines",
  "fr-FR"
);
expect(
  "Échangez des → Tradez des",
  "Échangez des actions et ETF européens à 1 €",
  "Tradez des actions et ETF européens à 1 €",
  "fr-FR"
);

section("fr-FR: UE as adjective");
expect("Courtier UE → européen", "Courtier UE", "Courtier européen", "fr-FR");
expect(
  "courtiers de l'UE → européens",
  "les courtiers de l'UE",
  "les courtiers européens",
  "fr-FR"
);
expect(
  "investisseurs de l'UE → européens (fr-BE)",
  "plateformes de trading pour les investisseurs de l'UE",
  "plateformes de trading pour les investisseurs européens",
  "fr-BE"
);
expect(
  "actions UE → européennes",
  "les actions UE à 1 €",
  "les actions européennes à 1 €",
  "fr-FR"
);
expect(
  "plateforme UE → européenne",
  "une plateforme UE moderne",
  "une plateforme européenne moderne",
  "fr-FR"
);
expect(
  "ETF UE → ETF européens",
  "des ETF UE à bas coût",
  "des ETF européens à bas coût",
  "fr-FR"
);

section("fr-FR: alimenté par l'IA → propulsé par l'IA");
expect(
  "alimenté singular",
  "Investissement alimenté par l'IA",
  "Investissement propulsé par l'IA",
  "fr-FR"
);
expect(
  "alimentée feminine",
  "une plateforme alimentée par l'IA",
  "une plateforme propulsée par l'IA",
  "fr-FR"
);
expect(
  "alimentés plural",
  "outils alimentés par l'IA",
  "outils propulsés par l'IA",
  "fr-FR"
);

section("fr-FR: économiser → épargner");
expect(
  "Commencez à économiser → à épargner",
  "Commencez à économiser dès maintenant !",
  "Commencez à épargner dès maintenant !",
  "fr-FR"
);
expect(
  "économisez → épargnez",
  "Rejoignez-nous et économisez dès aujourd'hui !",
  "Rejoignez-nous et épargnez dès aujourd'hui !",
  "fr-FR"
);

section("fr-FR: frais stables → frais fixes");
expect(
  "Des frais stables → Des frais fixes",
  "Des frais stables, une transparence des coûts.",
  "Des frais fixes, une transparence des coûts.",
  "fr-FR"
);

section("fr-BE: shares fr-FR rules");
expect(
  "fr-BE négociation → trading",
  "Plateformes de négociation abordables",
  "Plateformes de trading abordables",
  "fr-BE"
);
expect(
  "fr-BE Courtier UE → européen",
  "Courtier UE",
  "Courtier européen",
  "fr-BE"
);

section("nl-NL: handelsplatform → tradingplatform");
expect(
  "handelsplatformen → tradingplatformen",
  "Een van de beste handelsplatformen voor EU-beleggers",
  "Een van de beste tradingplatformen voor Europese beleggers",
  "nl-NL"
);
expect(
  "Betaalbare handelsplatformen → tradingplatformen",
  "Betaalbare handelsplatformen in Europa",
  "Betaalbare tradingplatformen in Europa",
  "nl-NL"
);

section("nl-NL: goedkoop → voordelig family");
expect(
  "Goedkoopste broker → Voordeligste broker",
  "Goedkoopste broker voor EU-aandelen",
  "Voordeligste broker voor Europese aandelen",
  "nl-NL"
);
expect(
  "Goedkope X → Voordelige X (case-preserving)",
  "Goedkope aandelenhandelsmakelaar",
  "Voordelige aandelenhandelsmakelaar",
  "nl-NL"
);

section("nl-NL: EU-aandelen / EU-beleggers");
expect(
  "EU-aandelen → Europese aandelen",
  "broker voor EU-aandelen",
  "broker voor Europese aandelen",
  "nl-NL"
);
expect(
  "EU-beleggers → Europese beleggers",
  "platformen voor EU-beleggers",
  "platformen voor Europese beleggers",
  "nl-NL"
);
expect(
  "EU Broker is left alone (per reviewer)",
  "EU Broker met lage kosten",
  "EU Broker met lage kosten",
  "nl-NL"
);

section("nl-NL: beste makelaars → beste brokers");
expect(
  "Een van de beste makelaars → beste brokers",
  "Een van de beste makelaars voor ETF's in Europa",
  "Een van de beste brokers voor ETF's in Europa",
  "nl-NL"
);

section("nl-BE: shares nl-NL rules");
expect(
  "nl-BE handelsplatformen → tradingplatformen",
  "Betaalbare handelsplatformen in Europa",
  "Betaalbare tradingplatformen in Europa",
  "nl-BE"
);
expect(
  "nl-BE goedkoopste → voordeligste",
  "Goedkoopste broker voor EU-aandelen",
  "Voordeligste broker voor Europese aandelen",
  "nl-BE"
);

section("es-ES: corredor → bróker");
expect(
  "Corredor singular",
  "Corredor europeo de bajo coste",
  "Bróker europeo de bajo coste",
  "es-ES"
);
expect(
  "Corredores plural",
  "los corredores con comisiones bajas",
  "los brókers con comisiones bajas",
  "es-ES"
);
expect(
  "Corredor de negociación de acciones → Bróker (just term swap)",
  "Corredor de negociación de acciones a bajo coste",
  "Bróker de negociación de acciones a bajo coste",
  "es-ES"
);

section("es-ES: UE as adjective");
expect(
  "Corredor de la UE → Bróker europeo (chained rules)",
  "Corredor de la UE",
  "Bróker europeo",
  "es-ES"
);
expect(
  "inversores de la UE → europeos",
  "Una de las mejores plataformas para inversores de la UE",
  "Una de las mejores plataformas para inversores europeos",
  "es-ES"
);
expect(
  "ACCIONES de la UE → europeas (case-insensitive)",
  "El bróker más económico para ACCIONES de la UE",
  "El bróker más económico para ACCIONES europeas",
  "es-ES"
);
expect(
  "acciones UE (no 'de la') → europeas",
  "Operar con acciones UE a 1 €",
  "Operar con acciones europeas a 1 €",
  "es-ES"
);
expect(
  "plataformas de la UE → europeas",
  "plataformas de la UE para inversores",
  "plataformas europeas para inversores",
  "es-ES"
);
expect(
  "mercado de la UE → europeo",
  "Acceso al mercado de la UE",
  "Acceso al mercado europeo",
  "es-ES"
);

section("fired log surfaces");
const r = applyLocaleRewrites("ETFs UE a basso costo", "it-IT");
if (r.fired.length === 0) {
  failed++;
  failures.push("expected rewrites to fire on a sentence full of regressions");
  console.error("  FAIL: fired log should not be empty");
} else {
  passed++;
}

// ── Report ────────────────────────────────────────────────────────
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
} else {
  process.exit(0);
}
