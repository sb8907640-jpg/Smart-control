"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getApps, initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

function authClient() {
  return getAuth(getApps()[0] ?? initializeApp(firebaseConfig));
}

function LinkVerification() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [user, setUser] = useState<User | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [verified, setVerified] = useState<{ senderRole: string; receiverRole: string } | null>(null);

  useEffect(() => onAuthStateChanged(authClient(), setUser), []);

  async function signIn() {
    setBusy(true);
    try {
      await signInWithPopup(authClient(), new GoogleAuthProvider());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!user || !token || !/^\d{6}$/.test(code)) {
      setStatus("Sign in and enter the 6-digit verification code.");
      return;
    }
    setBusy(true);
    setStatus("");
    setVerified(null);
    try {
      const base = (process.env.NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL ?? "").replace(/\/$/, "");
      if (!base) throw new Error("Smart Control API URL is not configured.");
      const idToken = await user.getIdToken();
      const response = await fetch(base + "/api/pairing/invites/verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ token, code })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `Verification failed (HTTP ${response.status}).`);
      setVerified({ senderRole: body.senderRole, receiverRole: body.receiverRole });
      setStatus("Invitation verified. Pairing is not complete yet.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not verify invitation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="verify-page">
      <section className="verify-card">
        <div className="verify-icon">🔐</div>
        <p className="eyebrow">FAMILY SURAKSHA</p>
        <h1>Verify invitation</h1>
        <p className="description">Sign in with the receiving account and enter the code shared by the sender. Do not continue unless you recognize the sender.</p>
        {!user ? <button className="action" onClick={signIn} disabled={busy}>Continue with Google</button> : <p className="signed">Signed in as {user.email ?? "authenticated account"}</p>}
        <label htmlFor="verification-code">6-digit verification code</label>
        <input id="verification-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" disabled={busy} />
        <button className="action" onClick={verify} disabled={busy || !user || !token || code.length !== 6}>{busy ? "Verifying…" : "Verify invitation"}</button>
        {verified ? <div className="verified" role="status"><strong>✓ Invitation verified</strong><p>From: {verified.senderRole}</p><p>To: {verified.receiverRole}</p><p>Before devices can be linked, the receiver must explicitly confirm and the app must complete the pairing step.</p></div> : null}
        {status ? <p className="status" role="status">{status}</p> : null}
        {!token ? <p className="status">This link is missing its invitation token. Ask the sender to generate a new invitation.</p> : null}
      </section>
      <style jsx>{`
        .verify-page { max-width:520px; margin:0 auto; padding:48px 16px; }
        .verify-card { background:white; border:1px solid #e2e8f0; border-radius:22px; padding:clamp(22px,5vw,34px); box-shadow:0 14px 40px #0f172a0a; }
        .verify-icon { font-size:34px; margin-bottom:14px; }
        .eyebrow { margin:0 0 6px; color:#475569; font-size:12px; font-weight:800; letter-spacing:1.7px; }
        h1 { margin:0; font-size:30px; }
        .description { color:#64748b; line-height:1.6; margin:12px 0 20px; }
        label { display:block; font-weight:750; font-size:13px; margin:20px 0 7px; }
        input { width:100%; padding:14px; border:1px solid #cbd5e1; border-radius:10px; font-size:22px; letter-spacing:6px; text-align:center; }
        .action { width:100%; margin-top:14px; min-height:48px; border:0; border-radius:11px; background:#3730a3; color:white; font-weight:750; cursor:pointer; }
        .action:disabled { opacity:.5; cursor:not-allowed; }
        .signed, .status { font-size:13px; line-height:1.5; color:#475569; overflow-wrap:anywhere; }
        .verified { margin-top:20px; border:1px solid #86efac; background:#f0fdf4; border-radius:12px; padding:14px; color:#166534; line-height:1.5; }
        .verified p { margin:6px 0; }
      `}</style>
    </main>
  );
}

export default function LinkPage() {
  return <Suspense fallback={<main>Loading invitation…</main>}><LinkVerification /></Suspense>;
}
