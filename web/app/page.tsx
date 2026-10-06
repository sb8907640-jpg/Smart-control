"use client";

import { useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

function authClient() {
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  return getAuth(app);
}

export default function Home() {
  const [user, setUser] = useState<string | null>(null);
  const [status, setStatus] = useState("Not connected");
  const [data, setData] = useState<unknown>(null);

  async function signIn() {
    setStatus("Signing in...");
    try {
      const result = await signInWithPopup(authClient(), new GoogleAuthProvider());
      setUser(result.user.email ?? result.user.uid);
      setStatus("Signed in");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sign-in failed");
    }
  }

  async function loadSession() {
    const current = authClient().currentUser;
    if (!current) {
      setStatus("Sign in first");
      return;
    }
    setStatus("Loading authenticated session...");
    try {
      const token = await current.getIdToken();
      const base = process.env.NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL ?? "";
      const response = await fetch(base.replace(/\/$/, "") + "/api/auth/session", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Backend request failed");
      setData(body);
      setStatus("Backend session verified");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Backend request failed");
    }
  }

  return (
    <main>
      <h1>Smart Control</h1>
      <p>Consent-based family safety and remote support. Sensitive actions remain subject to platform permissions and explicit sessions.</p>
      <section>
        <h2>Authentication</h2>
        <p>{user ? `Signed in as ${user}` : "Not signed in"}</p>
        <button onClick={signIn} disabled={Boolean(user)}>Continue with Google</button>{" "}
        <button onClick={() => signOut(authClient())} disabled={!user}>Sign out</button>
      </section>
      <section>
        <h2>Backend session</h2>
        <button onClick={loadSession} disabled={!user}>Verify authenticated session</button>
        <p>{status}</p>
        {data ? <pre><code>{JSON.stringify(data, null, 2)}</code></pre> : null}
      </section>
    </main>
  );
}
