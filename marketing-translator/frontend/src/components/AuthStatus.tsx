import { useEffect, useState } from "react";
import {
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
  useUser,
} from "@clerk/clerk-react";
import { getMe } from "../api/client";

type Me = Awaited<ReturnType<typeof getMe>>;

/**
 * Topbar auth widget. Must be rendered inside <ClerkProvider> — App.tsx gates
 * on VITE_CLERK_PUBLISHABLE_KEY before mounting this.
 */
export default function AuthStatus() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <SignedOut>
        <SignInButton mode="modal">
          <button className="btn btn-primary" style={{ fontSize: "0.85rem" }}>Sign in</button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <SignedInSummary />
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
    </div>
  );
}

function SignedInSummary() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    getMe()
      .then((m) => { if (!cancelled) setMe(m); })
      .catch((e) => { if (!cancelled) setError(e?.message ?? "Failed to load profile"); });
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn]);

  if (error) return <span style={{ color: "var(--danger, #c00)", fontSize: "0.75rem" }}>auth: {error}</span>;
  if (!me) return <span style={{ color: "var(--text-3)", fontSize: "0.75rem" }}>…</span>;

  return (
    <span style={{ color: "var(--text-2)", fontSize: "0.75rem" }}>
      {user?.primaryEmailAddress?.emailAddress ?? me.user.email}
      <span style={{ color: "var(--text-3)", marginLeft: "0.35rem" }}>· {me.user.role}</span>
      {!me.user.isActive && (
        <span style={{ color: "var(--danger, #c00)", marginLeft: "0.35rem" }}>· inactive</span>
      )}
    </span>
  );
}
