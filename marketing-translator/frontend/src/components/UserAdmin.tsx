import { useEffect, useState, useCallback } from "react";
import {
  listAdminUsers,
  updateUserRole,
  updateUserActive,
  type AdminUser,
} from "../api/client";

const ROLES: AdminUser["role"][] = ["USER", "REVIEWER", "MANAGER", "ADMIN"];

export default function UserAdmin() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const rows = await listAdminUsers();
      setUsers(rows);
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e?.message ?? "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function wrap(id: number, fn: () => Promise<AdminUser>) {
    setBusyId(id);
    setRowErr((e) => ({ ...e, [id]: "" }));
    try {
      const updated = await fn();
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? e?.message ?? "Update failed.";
      setRowErr((prev) => ({ ...prev, [id]: typeof msg === "string" ? msg : JSON.stringify(msg) }));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div style={{ padding: "1rem", color: "var(--text-3)" }}>Loading users…</div>;
  if (err) return <div style={{ padding: "1rem", color: "var(--danger, #c00)" }}>{err}</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <span style={{ color: "var(--text-3)", fontSize: "0.85rem" }}>{users.length} user{users.length === 1 ? "" : "s"}</span>
        <button className="btn btn-secondary" onClick={refresh} disabled={loading} style={{ fontSize: "0.8rem" }}>Refresh</button>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--text-3)" }}>
            <th style={{ padding: "0.5rem" }}>ID</th>
            <th style={{ padding: "0.5rem" }}>Email</th>
            <th style={{ padding: "0.5rem" }}>Name</th>
            <th style={{ padding: "0.5rem" }}>Role</th>
            <th style={{ padding: "0.5rem" }}>Active</th>
            <th style={{ padding: "0.5rem" }}>Identities</th>
            <th style={{ padding: "0.5rem" }}>Created</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ borderBottom: "1px solid var(--border-subtle, #f0f0f0)" }}>
              <td style={{ padding: "0.5rem", color: "var(--text-3)" }}>{u.id}</td>
              <td style={{ padding: "0.5rem" }}>{u.email}</td>
              <td style={{ padding: "0.5rem", color: "var(--text-2)" }}>{u.fullName ?? "—"}</td>
              <td style={{ padding: "0.5rem" }}>
                <select
                  value={u.role}
                  disabled={busyId === u.id}
                  onChange={(e) => {
                    const next = e.target.value as AdminUser["role"];
                    if (next !== u.role) void wrap(u.id, () => updateUserRole(u.id, next));
                  }}
                  style={{ fontSize: "0.8rem" }}
                >
                  {ROLES.map((r) => (<option key={r} value={r}>{r}</option>))}
                </select>
              </td>
              <td style={{ padding: "0.5rem" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  <input
                    type="checkbox"
                    checked={u.isActive}
                    disabled={busyId === u.id}
                    onChange={(e) => void wrap(u.id, () => updateUserActive(u.id, e.target.checked))}
                  />
                  <span style={{ color: u.isActive ? "var(--text-1)" : "var(--danger, #c00)" }}>
                    {u.isActive ? "active" : "inactive"}
                  </span>
                </label>
              </td>
              <td style={{ padding: "0.5rem", color: "var(--text-3)", fontSize: "0.75rem" }}>
                {u.identities.length === 0 ? "—" : u.identities.map((i) => i.provider).join(", ")}
              </td>
              <td style={{ padding: "0.5rem", color: "var(--text-3)", fontSize: "0.75rem" }}>
                {new Date(u.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {Object.entries(rowErr).filter(([, m]) => m).map(([id, m]) => (
        <div key={id} style={{ marginTop: "0.5rem", color: "var(--danger, #c00)", fontSize: "0.75rem" }}>
          user {id}: {m}
        </div>
      ))}
    </div>
  );
}
