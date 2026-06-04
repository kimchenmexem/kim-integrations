import { SignIn } from "@clerk/clerk-react";

/**
 * Full-page sign-in / sign-up surface.
 *
 * Rendered only when Clerk is configured AND the user is not signed in
 * (see <SignedOut> wrapper in main.tsx). Clerk's <SignIn /> widget includes
 * a built-in "Don't have an account? Sign up" toggle when sign-up is enabled
 * in the Clerk dashboard for this environment.
 *
 * `routing="virtual"` keeps everything in component state — no URL changes,
 * no router required.
 */
export default function SignInPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.5rem",
        padding: "1.5rem",
        background: "var(--bg, #fafafa)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <img
          src="/mexem-logo.png"
          alt="MEXEM"
          style={{ height: "36px", width: "auto" }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <span style={{ color: "var(--text-2, #444)", fontSize: "1rem" }}>|</span>
        <span style={{ fontSize: "1.05rem", fontWeight: 500 }}>Marketing Translator</span>
      </div>

      <SignIn routing="virtual" />

      <div style={{ color: "var(--text-3, #888)", fontSize: "0.78rem", textAlign: "center" }}>
        Internal tool — sign in with your work account.
      </div>
    </div>
  );
}
