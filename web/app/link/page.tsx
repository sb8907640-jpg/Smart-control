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

type Invitation = { senderRole: string; receiverRole: string };
type LinkedPair = Invitation & { pairingId: string; linkedAtEpochMs: number };

function authClient() {
  return getAuth(getApps()[0] ?? initializeApp(firebaseConfig));
}

function apiBase() {
  const raw = (process.env.NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL ?? "").trim();
  if (!raw) return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Smart Control API URL is invalid.");
  }
  const host = url.hostname.toLowerCase();
  const isLocalHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalHost))) {
    throw new Error("Smart Control API must use HTTPS. HTTP is allowed only for localhost development.");
  }
  if (url.search || url.hash) throw new Error("Smart Control API URL cannot contain a query or fragment.");
  return url.toString().replace(/\/$/, "");
}

function LinkReceive() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [user, setUser] = useState<User | null>(null);
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState<Invitation | null>(null);
  const [linked, setLinked] = useState<LinkedPair | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const apkUrl = process.env.NEXT_PUBLIC_FAMILY_SURAKSHA_APK_URL ?? "";

  useEffect(() => onAuthStateChanged(authClient(), setUser), []);

  async function signIn() {
    setBusy(true);
    setStatus("");
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
      setStatus("Sign in and enter the six-digit code shared separately by the sender.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const base = apiBase();
      if (!base) throw new Error("Smart Control API URL is not configured.");
      const response = await fetch(base + "/api/pairing/invites/verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ token, code })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `Verification failed (HTTP ${response.status}).`);
      setVerified({ senderRole: body.senderRole, receiverRole: body.receiverRole });
      setStatus("Invitation verified. Review the relationship and explicitly confirm to link accounts.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not verify invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    if (!user || !token || !verified || !consent) {
      setStatus("Review the roles and confirm consent before connecting.");
      return;
    }
    setBusy(true);
    setStatus("Linking the family accounts securely…");
    try {
      const base = apiBase();
      if (!base) throw new Error("Smart Control API URL is not configured.");
      const response = await fetch(base + "/api/pairing/invites/accept", {
        method: "POST",
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ token, code, consent: true })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `Connection failed (HTTP ${response.status}).`);
      setLinked({ pairingId: body.pairingId, senderRole: body.senderRole, receiverRole: body.receiverRole, linkedAtEpochMs: body.linkedAtEpochMs });
      setStatus("Family accounts linked successfully.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not complete the link.");
    } finally {
      setBusy(false);
    }
  }

  const linkedTime = linked ? new Date(linked.linkedAtEpochMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <main className="receive-page">
      <header className="receive-header">
        <div className="brand-mark">FS</div>
        <div><p className="eyebrow">FAMILY SURAKSHA</p><h1>Receive a secure link</h1><p className="subtitle">Verify the invitation, review the roles, then decide whether to connect.</p></div>
      </header>

      <section className="receive-card">
        <div className="stage-heading"><span className="stage-number">1</span><div><h2>📩 Invitation received</h2><p>WhatsApp / SMS link</p></div></div>
        <div className="invite-box">
          <p className="invite-line"><span>🔗 Link</span><strong>{token ? "Invitation link detected" : "No invitation token found"}</strong></p>
          <p className="invite-line"><span>🔑 Code</span><strong>{verified ? "••••••  ✓ Verified" : "Enter the 6-digit code below"}</strong></p>
          {verified ? <><p className="invite-line"><span>👨 From</span><strong>{verified.senderRole}</strong></p><p className="invite-line"><span>👦 To</span><strong>{verified.receiverRole}</strong></p></> : <p className="helper">The sender shares the verification code separately. For your security, it is not embedded in the link.</p>}
        </div>

        {!user ? <button type="button" className="primary-button" onClick={signIn} disabled={busy}>Continue with Google</button> : <p className="signed-in">Signed in as {user.email ?? "authenticated account"}</p>}

        {!verified && !linked ? <>
          <label htmlFor="verification-code">🔑 6-digit verification code</label>
          <input id="verification-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" disabled={busy || !user} />
          <button type="button" className="primary-button" onClick={verify} disabled={busy || !user || !token || code.length !== 6}>{busy ? "Verifying…" : "Verify invitation"}</button>
        </> : null}

        <div className="stage-divider">↓</div>
        <div className="stage-heading"><span className="stage-number">2</span><div><h2>📦 Download & install the app</h2><p>Android will ask you to confirm installation</p></div></div>
        {apkUrl ? <div className="download-box">
          <p><strong>File:</strong> Family-Suraksha.apk</p>
          <p>Tap Download, wait for Chrome to finish, open the downloaded file, and follow Android's installer prompts.</p>
          <a className="download-button" href={apkUrl} target="_blank" rel="noreferrer">⬇ Download Family Suraksha APK</a>
          <p className="helper">Android may require you to allow installation from your browser. Only install an APK from a source you trust.</p>
        </div> : <div className="download-box pending">
          <strong>APK download is not configured yet.</strong>
          <p>The app download button will appear after the release APK is published and NEXT_PUBLIC_FAMILY_SURAKSHA_APK_URL is configured. You can continue this account-link flow in the browser.</p>
        </div>}

        <div className="stage-divider">↓</div>
        <div className="stage-heading"><span className="stage-number">3</span><div><h2>🔗 Confirm and connect</h2><p>Check the sender and receiver before approving</p></div></div>

        {verified && !linked ? <div className="connect-box">
          <label htmlFor="locked-code">🔑 Verified code</label>
          <input id="locked-code" className="locked-code" value={code.split("").join(" ")} readOnly aria-readonly="true" />
          <p>👨 From: <strong>{verified.senderRole}</strong></p>
          <p>👦 To: <strong>{verified.receiverRole}</strong></p>
          <label className="consent-row"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={busy} /> I recognize the sender and agree to link these two Family Suraksha accounts.</label>
          <button type="button" className="primary-button connect-button" onClick={connect} disabled={busy || !consent}>{busy ? "Linking…" : "🔗 CONNECT"}</button>
        </div> : null}

        {linked ? <div className="success-box" role="status">
          <div className="success-icon">✓</div><h2>Accounts successfully linked! 🎉</h2>
          <div className="linked-summary"><strong>👨 {linked.senderRole} ⇄ 👦 {linked.receiverRole}</strong><span>🟢 Status: Linked</span><span>🕒 Time: {linkedTime}</span></div>
          <p className="helper">This confirms the account relationship. It does not by itself grant remote-control permissions or prove a live device-to-device transport connection; those require their own setup and consent.</p>
          <div className="nav-actions"><a href="/">🏠 Home</a><a href="/settings">⚙️ Settings</a></div>
        </div> : null}

        {status ? <p className="status" role="status">{status}</p> : null}
        {!token ? <p className="status">This link is missing its invitation token. Ask the sender to generate a new invitation.</p> : null}
      </section>

      <p className="security-note">Security: The invitation expires after 10 minutes. The receiver must sign in, verify the code, and give explicit consent. Installation is always confirmed by Android; a website cannot silently install an APK.</p>

      <style jsx>{`
        .receive-page { max-width:720px; margin:0 auto; padding:28px 16px 48px; }
        .receive-header { display:flex; align-items:center; gap:15px; margin:8px 0 24px; }
        .brand-mark { display:grid; place-items:center; flex:0 0 54px; height:54px; border-radius:17px; background:#172554; color:white; font-weight:850; }
        .eyebrow { margin:0 0 4px; color:#475569; font-size:12px; font-weight:800; letter-spacing:1.6px; }
        h1 { margin:0; font-size:clamp(24px,5vw,34px); line-height:1.2; }
        .subtitle { color:#64748b; margin:7px 0 0; line-height:1.5; }
        .receive-card { background:white; border:1px solid #e2e8f0; border-radius:22px; padding:clamp(16px,4vw,28px); box-shadow:0 14px 40px #0f172a0a; }
        .stage-heading { display:flex; align-items:center; gap:12px; margin:4px 0 14px; }
        .stage-number { display:grid; place-items:center; width:34px; height:34px; flex:0 0 34px; border-radius:50%; background:#e0e7ff; color:#1e3a8a; font-weight:850; }
        .stage-heading h2 { margin:0; font-size:17px; }
        .stage-heading p { margin:4px 0 0; color:#64748b; font-size:12px; }
        .invite-box,.download-box,.connect-box { padding:15px; border:1px solid #e2e8f0; border-radius:14px; background:#f8fafc; margin-bottom:18px; }
        .invite-line { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin:10px 0; font-size:14px; }
        .invite-line span { color:#64748b; flex:0 0 70px; }
        .invite-line strong { text-align:right; overflow-wrap:anywhere; }
        .helper { color:#64748b; font-size:12px; line-height:1.55; margin:10px 0 0; }
        .signed-in,.status { color:#475569; font-size:13px; line-height:1.5; overflow-wrap:anywhere; }
        label { display:block; margin:14px 0 7px; font-size:13px; font-weight:750; color:#334155; }
        input:not([type=checkbox]) { width:100%; padding:13px; border:1px solid #cbd5e1; border-radius:10px; font-size:20px; letter-spacing:5px; text-align:center; }
        .primary-button,.download-button { display:flex; align-items:center; justify-content:center; width:100%; min-height:48px; margin-top:13px; padding:12px 16px; border:0; border-radius:11px; background:#3730a3; color:#fff; font-weight:800; text-decoration:none; cursor:pointer; }
        .primary-button:disabled { opacity:.48; cursor:not-allowed; }
        .stage-divider { text-align:center; color:#4f46e5; font-size:24px; padding:3px 0 18px; }
        .download-box p { font-size:13px; line-height:1.55; color:#475569; }
        .download-box.pending { border-color:#fde68a; background:#fffbeb; }
        .download-box.pending strong { color:#92400e; }
        .download-button { background:#166534; }
        .connect-box { border-color:#c7d2fe; background:#eef2ff; }
        .locked-code { font-size:23px !important; font-weight:850; letter-spacing:6px !important; background:#fff; }
        .connect-box p { margin:10px 0; }
        .consent-row { display:flex; gap:10px; align-items:flex-start; font-weight:550; line-height:1.5; }
        .consent-row input { margin-top:3px; flex:0 0 auto; }
        .connect-button { background:#166534; }
        .success-box { text-align:center; border:1px solid #86efac; background:#f0fdf4; color:#166534; border-radius:16px; padding:20px; }
        .success-icon { display:grid; place-items:center; width:48px; height:48px; margin:0 auto 10px; border-radius:50%; background:#dcfce7; font-size:27px; font-weight:900; }
        .success-box h2 { margin:0 0 14px; font-size:21px; }
        .linked-summary { display:grid; gap:10px; padding:15px; background:#fff; border-radius:12px; text-align:left; }
        .nav-actions { display:flex; gap:10px; margin-top:16px; }
        .nav-actions a { flex:1; padding:12px 10px; border:1px solid #bbf7d0; border-radius:10px; background:#fff; color:#166534; font-weight:750; text-decoration:none; }
        .security-note { margin:15px 4px 0; color:#64748b; font-size:12px; line-height:1.6; }
      `}</style>
    </main>
  );
}

export default function LinkPage() {
  return <Suspense fallback={<main>Loading invitation…</main>}><LinkReceive /></Suspense>;
}
