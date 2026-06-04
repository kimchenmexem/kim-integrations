import { Router } from "express";
import { LocaleOption, TextTypeOption, PersonaOption, ToneOption } from "@mexem/shared";

const router = Router();

const locales: LocaleOption[] = [
  { code: "it-IT", label: "Italian (Italy)", language: "Italian", country: "Italy" },
  { code: "fr-FR", label: "French (France)", language: "French", country: "France" },
  { code: "nl-NL", label: "Dutch (Netherlands)", language: "Dutch", country: "Netherlands" },
  { code: "nl-BE", label: "Dutch (Belgium)", language: "Dutch", country: "Belgium" },
  { code: "fr-BE", label: "French (Belgium)", language: "French", country: "Belgium" },
  { code: "es-ES", label: "Spanish (Spain)", language: "Spanish", country: "Spain" },
  { code: "en-GB", label: "English (UK)", language: "English", country: "United Kingdom" }
];

const textTypes: TextTypeOption[] = [
  // ─── Google Search (Responsive Search Ads) ─────────────────────
  { id: "google_search_headline",     label: "Google Search — Headline (30 chars)" },
  { id: "google_search_description",  label: "Google Search — Description (90 chars)" },

  // ─── Google Display (Responsive Display Ads) ──────────────────
  { id: "google_display_headline",    label: "Google Display — Short Headline (30 chars)" },
  { id: "google_display_long_headline", label: "Google Display — Long Headline (90 chars)" },
  { id: "google_display_description", label: "Google Display — Description (90 chars)" },

  // ─── Google Performance Max ───────────────────────────────────
  { id: "google_pmax_headline",       label: "Google PMax — Headline (30 chars)" },
  { id: "google_pmax_long_headline",  label: "Google PMax — Long Headline (90 chars)" },
  { id: "google_pmax_description",    label: "Google PMax — Description (90 chars)" },

  // ─── YouTube Ads ──────────────────────────────────────────────
  { id: "google_youtube_headline",    label: "YouTube Ad — Headline (30 chars)" },
  { id: "google_youtube_description", label: "YouTube Ad — Description (90 chars)" },

  // ─── Meta (Facebook / Instagram) ──────────────────────────────
  { id: "meta_primary_text",          label: "Meta — Primary Text (125 chars)" },
  { id: "meta_headline",              label: "Meta — Headline (40 chars)" },
  { id: "meta_description",           label: "Meta — Link Description (30 chars)" },
  { id: "meta_long_headline",         label: "Meta — Long Headline (100 chars)" },

  // ─── General / Other ──────────────────────────────────────────
  { id: "paid_social",                label: "Paid Social Ad (generic)" },
  { id: "organic_social",             label: "Organic Social Post" },
  { id: "email_subject",              label: "Email Subject Line" },
  { id: "email_body",                 label: "Email Body" },
  { id: "push_notification",          label: "Push Notification" },
  { id: "sms",                        label: "SMS" },
  { id: "landing_headline",           label: "Landing Page Headline" },
  { id: "banner",                     label: "Banner / Display" },
  { id: "cta_button",                 label: "CTA Button" },
];

const personas: PersonaOption[] = [
  { id: "beginners", label: "Beginners" },
  { id: "active_traders", label: "Active Traders" },
  { id: "experienced_investors", label: "Experienced Investors" },
  { id: "premium_audience", label: "Premium Audience" },
  { id: "potential_investors", label: "Potential Investors" }
];

const tones: ToneOption[] = [
  { id: "professional", label: "Professional" },
  { id: "friendly", label: "Friendly" },
  { id: "confident", label: "Confident" },
  { id: "approachable", label: "Approachable" },
  { id: "premium", label: "Premium" },
  { id: "persuasive", label: "Persuasive" },
  { id: "educational", label: "Educational" },
  { id: "direct", label: "Direct" }
];

router.get("/", (_req, res) => {
  res.json({ locales, textTypes, personas, tones });
});

export default router;
