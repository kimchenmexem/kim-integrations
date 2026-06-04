import { useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { setAuthTokenProvider } from "../api/client";

/**
 * Keeps the axios client's token provider in sync with the current Clerk
 * session. Renders nothing; mount once inside <ClerkProvider>.
 *
 * Using useAuth().getToken is the supported Clerk pattern for reading session
 * tokens outside of a single component — this avoids reaching into window.Clerk.
 */
export default function AuthTokenBridge() {
  const { isLoaded, getToken } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    setAuthTokenProvider(() => getToken());
    return () => setAuthTokenProvider(null);
  }, [isLoaded, getToken]);

  return null;
}
