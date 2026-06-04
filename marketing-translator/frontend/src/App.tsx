import { useEffect, useState } from "react";
import { getOptions, getMe } from "./api/client";
import TranslationForm from "./components/TranslationForm";
import BatchTranslator from "./components/BatchTranslator";
import ComplianceAdmin from "./components/ComplianceAdmin";
import PublisherAdmin from "./components/PublisherAdmin";
import ComplianceCheck from "./components/ComplianceCheck";
import QuickTranslate from "./components/QuickTranslate";
import UserAdmin from "./components/UserAdmin";
import AuditLogAdmin from "./components/AuditLogAdmin";
import ReviewerQueue from "./components/ReviewerQueue";
import CampaignGenerator from "./components/CampaignGenerator";
import AuthStatus from "./components/AuthStatus";
import { LocaleOption, TextTypeOption, PersonaOption, ToneOption } from "@mexem/shared";

type Tab = "campaign" | "batch" | "translate" | "quick" | "check" | "queue" | "compliance" | "publishers" | "users" | "audit";
type Role = "USER" | "REVIEWER" | "MANAGER" | "ADMIN";

type NavItem = {
  id: Tab;
  icon: string;
  label: string;
  desc: string;
  section?: string;
  /** Required role for this tab to appear. Undefined = visible to all. Backend still enforces. */
  requiresRole?: Role[];
};

const NAV: NavItem[] = [
  { id: "campaign",   icon: "✺", label: "Campaign Generator", desc: "Brief in → ready-to-publish copy across all platforms" },
  { id: "batch",      icon: "⚡", label: "Batch Translate",    desc: "Translate many lines at once" },
  { id: "translate",  icon: "✦",  label: "Single Translate",   desc: "One text with full options" },
  { id: "quick",      icon: "→",  label: "Quick Translate",    desc: "Simple translate — text in, translation out" },
  { id: "check",      icon: "✓",  label: "Compliance Check",   desc: "Check text against a locale's compliance bundle (no translation)" },
  { id: "queue",      icon: "☷",  label: "Reviewer Queue",     desc: "Recent translations awaiting review", section: "Admin", requiresRole: ["MANAGER", "ADMIN"] },
  { id: "compliance", icon: "⊘",  label: "Compliance Admin",   desc: "Sources, obligations, bundles", section: "Admin", requiresRole: ["MANAGER", "ADMIN"] },
  { id: "publishers", icon: "◎",  label: "Publisher Admin",    desc: "Market intelligence & media planning (advisory, non-compliance)", section: "Admin", requiresRole: ["MANAGER", "ADMIN"] },
  { id: "users",      icon: "⎔",  label: "User Management",    desc: "List users, change role, activate/deactivate", section: "Admin", requiresRole: ["ADMIN"] },
  { id: "audit",      icon: "⎘",  label: "Audit Logs",         desc: "Recent audit activity across the app", section: "Admin", requiresRole: ["MANAGER", "ADMIN"] },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("batch");
  const [locales, setLocales] = useState<LocaleOption[]>([]);
  const [textTypes, setTextTypes] = useState<TextTypeOption[]>([]);
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [tones, setTones] = useState<ToneOption[]>([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    getOptions()
      .then(d => {
        setLocales(d.locales || []);
        setTextTypes(d.textTypes || []);
        setPersonas(d.personas || []);
        setTones(d.tones || []);
        setOptionsLoaded(true);
      })
      .catch(() => setOptionsLoaded(true));

    // Fetch the signed-in user's role to gate admin nav visibility. Backend
    // remains authoritative; this is purely UX. Ignore 401/503 silently —
    // those are the "not signed in" / "Clerk not configured" cases.
    if (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) {
      getMe().then((me) => setRole(me.user.role)).catch(() => {});
    }
  }, []);

  // Filter NAV to tabs this role is permitted to see. Falls through to
  // showing only non-admin tabs when role is unknown (not signed in yet).
  const visibleNav = NAV.filter((n) => {
    if (!n.requiresRole) return true;
    return role !== null && n.requiresRole.includes(role);
  });
  const active = visibleNav.find(n => n.id === tab) ?? visibleNav[0];
  // If role changes after mount and the currently-selected tab becomes hidden,
  // fall back to the first visible tab.
  useEffect(() => {
    if (!visibleNav.find(n => n.id === tab)) setTab(visibleNav[0].id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  return (
    <div className="app-layout">
      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-logo">
          <img
            src="/mexem-logo.png"
            alt="MEXEM"
            style={{ height: "32px", width: "auto", display: "block" }}
            onError={e => {
              const img = e.target as HTMLImageElement;
              img.style.display = "none";
              const fallback = img.nextElementSibling as HTMLElement;
              if (fallback) fallback.style.display = "flex";
            }}
          />
          <span className="topbar-logo-fallback">M</span>
        </div>
        <span className="topbar-sep">|</span>
        <span className="topbar-subtitle">Marketing Translator</span>
        <div style={{ marginLeft: "auto" }}>
          {import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? <AuthStatus /> : null}
        </div>
      </header>

      {/* Sidebar */}
      <nav className="sidebar">
        <span className="sidebar-section">Tools</span>
        {visibleNav.filter(n => !n.section).map(n => (
          <button
            key={n.id}
            className={`nav-item${tab === n.id ? " active" : ""}`}
            onClick={() => setTab(n.id)}
          >
            <span className="nav-item-icon">{n.icon}</span>
            {n.label}
          </button>
        ))}
        {visibleNav.some(n => n.section === "Admin") && (
          <>
            <span className="sidebar-section" style={{ marginTop: "0.75rem" }}>Admin</span>
            {visibleNav.filter(n => n.section === "Admin").map(n => (
              <button
                key={n.id}
                className={`nav-item${tab === n.id ? " active" : ""}`}
                onClick={() => setTab(n.id)}
              >
                <span className="nav-item-icon">{n.icon}</span>
                {n.label}
              </button>
            ))}
          </>
        )}
      </nav>

      {/* Content */}
      <main className="main-content" style={(tab === "compliance" || tab === "publishers" || tab === "users" || tab === "audit" || tab === "queue" || tab === "campaign") ? { maxWidth: "1200px" } : undefined}>
        <div className="page-header">
          <h1 className="page-title">{active.label}</h1>
          <p className="page-subtitle">{active.desc}</p>
        </div>

        {tab === "campaign" && <CampaignGenerator />}
        {tab === "batch" && <BatchTranslator />}
        {tab === "translate" && (
          optionsLoaded
            ? <TranslationForm locales={locales} textTypes={textTypes} personas={personas} tones={tones} />
            : <div style={{ color: "var(--text-3)", padding: "2rem 0", fontSize: "0.875rem" }}>Loading…</div>
        )}
        {tab === "quick" && <QuickTranslate />}
        {tab === "check" && <ComplianceCheck />}
        {tab === "queue" && <ReviewerQueue />}
        {tab === "compliance" && <ComplianceAdmin />}
        {tab === "publishers" && <PublisherAdmin />}
        {tab === "users" && <UserAdmin />}
        {tab === "audit" && <AuditLogAdmin />}
      </main>
    </div>
  );
}
