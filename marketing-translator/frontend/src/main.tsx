import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider, SignedIn, SignedOut } from "@clerk/clerk-react";
import App from "./App";
import AuthTokenBridge from "./components/AuthTokenBridge";
import SignInPage from "./components/SignInPage";
import { ErrorBoundary } from "./ErrorBoundary";
import "./styles.css";

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

function Root() {
  if (!CLERK_PUBLISHABLE_KEY) {
    // Dev-only escape hatch: when Clerk isn't configured we render the app
    // directly so a developer can still poke at the UI without auth set up.
    // In any environment that has Clerk keys (staging, prod), the gate below
    // is the only way in.
    // eslint-disable-next-line no-console
    console.warn("[auth] VITE_CLERK_PUBLISHABLE_KEY is not set — auth disabled.");
    return <App />;
  }
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <AuthTokenBridge />
      <SignedOut>
        <SignInPage />
      </SignedOut>
      <SignedIn>
        <App />
      </SignedIn>
    </ClerkProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>
);
