import { useEffect, useState } from "react";
import { GlossaryTerm, GlossaryTermCreate } from "@mexem/shared";
import { createGlossaryTerm, getGlossary } from "../api/client";

export default function GlossaryManager() {
  const [glossary, setGlossary] = useState<GlossaryTerm[]>([]);
  const [form, setForm] = useState<GlossaryTermCreate>({
    sourceTerm: "",
    targetTerm: "",
    localeCode: null,
    required: false,
    forbidden: false,
    notes: ""
  });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getGlossary().then((data) => setGlossary(data.glossary)).catch(() => setMessage("Unable to load glossary."));
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const term = await createGlossaryTerm(form);
      setGlossary((items) => [...items, term]);
      setMessage("Glossary term saved.");
      setForm({ sourceTerm: "", targetTerm: "", localeCode: null, required: false, forbidden: false, notes: "" });
    } catch (err) {
      setMessage("Unable to save glossary term.");
    }
  };

  return (
    <section className="admin-panel">
      <h2>Glossary manager</h2>
      <p>Manage brand and localization terminology for phase 1 locales.</p>
      <form onSubmit={handleSubmit} className="admin-form">
        <label>
          Source term
          <input value={form.sourceTerm} onChange={(e) => setForm({ ...form, sourceTerm: e.target.value })} />
        </label>
        <label>
          Target term
          <input value={form.targetTerm} onChange={(e) => setForm({ ...form, targetTerm: e.target.value })} />
        </label>
        <label>
          Locale code
          <input
            value={form.localeCode ?? ""}
            onChange={(e) => setForm({ ...form, localeCode: (e.target.value || null) as typeof form.localeCode })}
            placeholder="Optional locale code"
          />
        </label>
        <label>
          Required
          <input type="checkbox" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} />
        </label>
        <label>
          Forbidden
          <input type="checkbox" checked={form.forbidden} onChange={(e) => setForm({ ...form, forbidden: e.target.checked })} />
        </label>
        <label>
          Notes
          <textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
        <button type="submit">Add glossary term</button>
      </form>
      {message && <div className="info-message">{message}</div>}
      <div className="glossary-table">
        <h3>Glossary</h3>
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Target</th>
              <th>Locale</th>
              <th>Required</th>
              <th>Forbidden</th>
            </tr>
          </thead>
          <tbody>
            {glossary.map((term) => (
              <tr key={term.id ?? `${term.sourceTerm}-${term.localeCode}`}>
                <td>{term.sourceTerm}</td>
                <td>{term.targetTerm}</td>
                <td>{term.localeCode ?? "all"}</td>
                <td>{term.required ? "Yes" : "No"}</td>
                <td>{term.forbidden ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
