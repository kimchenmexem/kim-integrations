import { useEffect, useState } from "react";
import { TranslationMemoryEntry } from "@mexem/shared";
import { getMemoryEntries } from "../api/client";

export default function TranslationMemoryViewer() {
  const [entries, setEntries] = useState<TranslationMemoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMemoryEntries()
      .then((data) => setEntries(data.entries))
      .catch(() => setError("Unable to load translation memory."));
  }, []);

  return (
    <section className="admin-panel">
      <h2>Translation memory</h2>
      <p>Recent localized copy matches stored for reuse and consistency.</p>
      {error && <div className="error-message">{error}</div>}
      <div className="memory-list">
        {entries.slice(0, 10).map((entry) => (
          <article key={entry.id} className="memory-card">
            <div>
              <strong>{entry.sourceLanguage} → {entry.targetLocale}</strong>
            </div>
            <p><em>Source:</em> {entry.sourceText}</p>
            <p><em>Target:</em> {entry.targetText}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
