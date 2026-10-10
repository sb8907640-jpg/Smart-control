"use client";

import { useEffect, useState } from "react";
import { getApps, initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const relationships = [
  { value: "Father", label: "👨 Father" },
  { value: "Mother", label: "👩 Mother" },
  { value: "Son", label: "👦 Son" },
  { value: "Daughter", label: "👧 Daughter" },
  { value: "Brother", label: "🧑 Brother" },
  { value: "Sister", label: "👧 Sister" },
  { value: "Husband", label: "💑 Husband" },
  { value: "Wife", label: "💑 Wife" },
  { value: "Mechanic", label: "👷 Mechanic" },
  { value: "Engineer", label: "👨‍💻 Engineer" },
  { value: "Other", label: "👤 Other" }
];

type Invite = {
  link: string;
  code: string;
  senderRole: string;
  receiverRole: string;
  expiresAtEpochMs: number;
};

function firebaseAuth() {
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  return getAuth(app);
}

export default function LinkGeneratePage() {
  const [user, setUser] = useState<User | null>(null);
  const [senderRole, setSenderRole] = useState("");
  const [receiverRole, setReceiverRole] = useState("");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const auth = firebaseAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  async function signIn() {
    setBusy(true);
    setNotice("");
    try {
      await signInWithPopup(firebaseAuth(), new GoogleAuthProvider());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function generateInvite() {
    if (!user || !senderRole || !receiverRole) return;
    setBusy(true);
    setNotice("");
    setInvite(null);
    try {
      const base = (process.env.NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL ?? "").replace(/\/$/, "");
      if (!base) throw new Error("Smart Control API URL is not configured.");
      const token = await user.getIdToken();
      const response = await fetch(base + "/api/pairing/invites", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ senderRole, receiverRole })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `Invitation creation failed (HTTP ${response.status}).`);
      setInvite(body as Invite);
      setNotice("Invitation created. Share it only with the intended receiver.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not generate invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function copyAndOpenWhatsApp() {
    if (!invite) return;
    const message = [
      "🔗 Family Suraksha device-link invitation",
      invite.link,
      `🔑 Verification code: ${invite.code}`,
      `👤 From: ${invite.senderRole}`,
      `🎯 To: ${invite.receiverRole}`,
      "Open the link, enter the code, and review the request before confirming.",
      "⏳ This invitation expires in 10 minutes."
    ].join("\n");
    try {
      await navigator.clipboard.writeText(message);
      setNotice("Share message copied. Opening WhatsApp…");
      window.location.assign("https://wa.me/?text=" + encodeURIComponent(message));
    } catch {
      setNotice("Clipboard access failed. You can select and copy the share message below.");
    }
  }

  return (
    <main className="pair-page">
      <header className="pair-header">
        <div className="brand-mark">FS</div>
        <div>
          <p className="eyebrow">FAMILY SURAKSHA</p>
          <h1>Generate a secure link</h1>
          <p className="subtitle">Choose who is sending the invitation and who should receive it.</p>
        </div>
      </header>

      <section className="pair-card">
        <div className="section-heading">
          <span className="step">1</span>
          <div><h2>👤 आप कौन हैं?</h2><p>Sender · Select one relationship</p></div>
        </div>
        <div className="role-grid">
          {relationships.map(role => (
            <button type="button" key={role.value} className={senderRole === role.value ? "role-option selected" : "role-option"} aria-pressed={senderRole === role.value} onClick={() => { setSenderRole(role.value); setInvite(null); }}>
              {role.label}{senderRole === role.value ? <span aria-hidden="true"> ✓</span> : null}
            </button>
          ))}
        </div>

        <div className="step-divider"><span>↓</span> Select one receiver</div>

        <div className="section-heading">
          <span className="step">2</span>
          <div><h2>🎯 किसे Link करना है?</h2><p>Receiver · Select one relationship</p></div>
        </div>
        <div className="role-grid">
          {relationships.map(role => (
            <button type="button" key={role.value} className={receiverRole === role.value ? "role-option selected" : "role-option"} aria-pressed={receiverRole === role.value} onClick={() => { setReceiverRole(role.value); setInvite(null); }}>
              {role.label}{receiverRole === role.value ? <span aria-hidden="true"> ✓</span> : null}
            </button>
          ))}
        </div>

        {!user ? (
          <div className="auth-box">
            <p>Sign in to create a verified invitation. This helps bind the request to an authenticated account.</p>
            <button type="button" className="primary-button" onClick={signIn} disabled={busy}>Continue with Google</button>
          </div>
        ) : (
          <p className="signed-in">Signed in as {user.email ?? "authenticated account"}</p>
        )}

        <button type="button" className="primary-button generate-button" onClick={generateInvite} disabled={busy || !user || !senderRole || !receiverRole}>
          {busy ? "Please wait…" : "🔗 Generate Link"}
        </button>

        {invite ? (
          <div className="invite-result" aria-live="polite">
            <div className="result-title"><span>✓</span><div><h2>Invitation ready</h2><p>Valid for 10 minutes · Receiver confirmation required</p></div></div>
            <label htmlFor="invite-link">🔗 Link</label>
            <input id="invite-link" readOnly value={invite.link} onFocus={e => e.currentTarget.select()} />
            <label htmlFor="invite-code">🔑 Verification code</label>
            <input id="invite-code" className="verification-code" readOnly value={invite.code} onFocus={e => e.currentTarget.select()} />
            <div className="role-summary"><span>👤 From: <strong>{invite.senderRole}</strong></span><span>🎯 To: <strong>{invite.receiverRole}</strong></span></div>
            <button type="button" className="share-button" onClick={copyAndOpenWhatsApp}>⭐ 📋 Copy share message & open WhatsApp</button>
            <p className="share-preview">The share message includes the invitation link, verification code, sender and receiver roles.</p>
          </div>
        ) : null}
        {notice ? <p className="notice" role="status">{notice}</p> : null}
      </section>

      <p className="security-note">Security: The invitation expires after 10 minutes. Opening a link does not complete pairing; the receiving account must verify the code and explicitly consent. Do not share the code publicly.</p>

      <style jsx>{`
        .pair-page { max-width: 760px; margin: 0 auto; padding: 28px 16px 48px; }
        .pair-header { display:flex; align-items:center; gap:16px; margin: 8px 0 24px; }
        .brand-mark { display:grid; place-items:center; flex:0 0 56px; height:56px; border-radius:18px; background:#172554; color:white; font-weight:800; letter-spacing:1px; }
        .eyebrow { margin:0 0 4px; font-size:12px; font-weight:800; letter-spacing:1.7px; color:#475569; }
        h1 { margin:0; font-size:clamp(24px, 5vw, 34px); line-height:1.15; }
        .subtitle { color:#64748b; margin:8px 0 0; line-height:1.5; }
        .pair-card { background:white; border:1px solid #e2e8f0; border-radius:22px; padding:clamp(16px, 4vw, 28px); box-shadow:0 14px 40px #0f172a0a; }
        .section-heading { display:flex; align-items:center; gap:12px; margin:4px 0 16px; }
        .section-heading h2 { margin:0; font-size:18px; }
        .section-heading p { margin:4px 0 0; color:#64748b; font-size:13px; }
        .step { display:grid; place-items:center; width:34px; height:34px; flex:0 0 34px; border-radius:50%; background:#e0e7ff; color:#1e3a8a; font-weight:800; }
        .role-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px; }
        .role-option { min-height:46px; padding:10px 12px; border:1px solid #dbe2ea; border-radius:12px; background:#fff; color:#1e293b; text-align:left; font-weight:600; font-size:14px; }
        .role-option.selected { background:#eef2ff; border:2px solid #4f46e5; padding:9px 11px; color:#312e81; }
        .step-divider { display:flex; align-items:center; justify-content:center; gap:8px; color:#64748b; font-size:13px; padding:18px 0; }
        .step-divider span { color:#4f46e5; font-size:20px; }
        .auth-box { margin-top:22px; padding:14px; border-radius:14px; background:#f8fafc; }
        .auth-box p, .signed-in { color:#475569; font-size:13px; line-height:1.5; }
        .primary-button, .share-button { width:100%; min-height:48px; border:0; border-radius:12px; padding:12px 16px; font-weight:750; cursor:pointer; }
        .primary-button { color:#fff; background:#3730a3; }
        .primary-button:disabled { opacity:.48; cursor:not-allowed; }
        .generate-button { margin-top:16px; }
        .signed-in { margin:18px 0 0; }
        .invite-result { margin-top:22px; padding:18px; border:1px solid #bbf7d0; border-radius:16px; background:#f0fdf4; }
        .result-title { display:flex; gap:10px; align-items:center; margin-bottom:18px; }
        .result-title > span { display:grid; place-items:center; width:30px; height:30px; border-radius:50%; background:#dcfce7; color:#166534; font-weight:900; }
        .result-title h2 { margin:0; font-size:18px; }
        .result-title p { margin:4px 0 0; color:#166534; font-size:12px; }
        label { display:block; margin:14px 0 6px; font-size:13px; font-weight:750; color:#334155; }
        .invite-result input { width:100%; border:1px solid #d1d5db; border-radius:9px; padding:11px; background:#fff; color:#0f172a; }
        .verification-code { font-size:24px; font-weight:850; letter-spacing:5px; text-align:center; }
        .role-summary { display:flex; flex-wrap:wrap; gap:12px 22px; margin:16px 0; font-size:14px; }
        .share-button { background:#166534; color:#fff; }
        .share-preview { color:#64748b; font-size:12px; line-height:1.5; margin:10px 0 0; }
        .notice { margin:14px 0 0; color:#334155; font-size:13px; line-height:1.5; }
        .security-note { margin:16px 4px 0; color:#64748b; font-size:12px; line-height:1.6; }
        @media (min-width:560px) { .role-grid { grid-template-columns:repeat(3, minmax(0, 1fr)); } }
      `}</style>
    </main>
  );
}
