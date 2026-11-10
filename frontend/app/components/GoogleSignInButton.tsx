"use client";

// A3 Google sign-in — Google Identity Services (GIS) popup, authorization-CODE model (A25).
// The popup gives this page a one-time code; we POST it to OUR backend, which exchanges it
// with Google (using the client secret, server-side only), validates the identity and returns
// our normal app JWT. The browser never sees a Google access/ID token.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { completeLogin, type AuthResponse } from "../lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

// Minimal typing for the part of the GIS library we use.
type CodeResponse = { code?: string; error?: string; error_description?: string };
type GisError = { type?: string; message?: string };
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient(config: {
            client_id: string;
            scope: string;
            ux_mode: "popup";
            callback: (response: CodeResponse) => void;
            error_callback?: (error: GisError) => void;
          }): { requestCode(): void };
        };
      };
    };
  }
}

export default function GoogleSignInButton({ label = "Continue with Google" }: { label?: string }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Not configured (no client id in .env.local) → no button, rather than a broken one.
  if (!GOOGLE_CLIENT_ID) return null;

  async function sendCodeToBackend(code: string) {
    try {
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // CSRF guard the backend requires (Google's recommendation for the popup flow).
          "X-Requested-With": "XmlHttpRequest",
        },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // e.g. 409 "An account with this email already exists — please sign in with your password."
        setError(data?.error ?? "Google sign-in failed. Please try again.");
        return;
      }
      router.push(completeLogin(data as AuthResponse));
    } catch {
      setError("Cannot reach the server. Is the backend running?");
    } finally {
      setBusy(false);
    }
  }

  function handleClick() {
    if (!window.google) {
      setError("Google sign-in is still loading. Please try again in a moment.");
      return;
    }
    setError("");
    setBusy(true);
    window.google.accounts.oauth2
      .initCodeClient({
        client_id: GOOGLE_CLIENT_ID!,
        scope: "openid email profile",
        ux_mode: "popup",
        callback: (response) => {
          if (response.code) {
            sendCodeToBackend(response.code);
          } else {
            setBusy(false);
            setError(response.error_description ?? "Google sign-in was cancelled.");
          }
        },
        error_callback: (err) => {
          // Closing the popup is a normal choice, not an error worth shouting about.
          setBusy(false);
          if (err.type !== "popup_closed") {
            setError(err.message ?? "Google sign-in could not start (popup blocked?).");
          }
        },
      })
      .requestCode();
  }

  return (
    <div className="mt-6">
      {/* Google's library, loaded once; onReady also fires when it's already cached. */}
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setReady(true)} />

      <div className="flex items-center gap-3 text-xs text-ink-soft">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={!ready || busy}
        className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-surface py-2.5 font-medium text-ink transition hover:bg-canvas disabled:opacity-60"
      >
        {/* Google "G" mark (official colours). */}
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        {busy ? "Waiting for Google…" : label}
      </button>

      {error && (
        <p className="mt-3 text-sm text-kq-red" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
