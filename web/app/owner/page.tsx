"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, User, RecaptchaVerifier, ConfirmationResult, signInWithPhoneNumber } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

type Panel = {
  authenticated: boolean;
  owner: boolean;
  role: string;
  publicVisibility: string;
  identityVisibility: string;
  capabilities: Record<string, string[]>;
  ownerIdentity: null;
  note: string;
};
type Row = Record<string, unknown> & { id: string };
type TabId = "overview" | "users" | "plans" | "features" | "catalog-features" | "settings" | "gateway" | "free-access" | "device-links" | "subscriptions" | "payments" | "emi" | "legal-templates" | "support-tickets" | "audit" | "health";
type Tab = { id: TabId; label: string; path?: string; key?: string; description: string };

const TABS: Tab[] = [
  { id: "overview", label: "Overview", description: "Owner session, capabilities, and control summary." },
  { id: "users", label: "Users", path: "/api/owner/users", key: "users", description: "Review, edit, ban, or remove user records." },
  { id: "plans", label: "Plans", path: "/api/owner/plans", key: "plans", description: "Create and edit plans, pricing, durations, features, and link validity." },
  { id: "features", label: "Feature flags", path: "/api/owner/feature-flags", key: "featureFlags", description: "Configure feature flags and rollout controls." },
  { id: "catalog-features", label: "All 19 features", path: "/api/owner/catalog-features", key: "features", description: "Enable or disable each canonical app feature. These changes update the shared feature policy." },
  { id: "settings", label: "All settings", path: "/api/owner/settings", key: "settings", description: "Edit the complete global settings JSON stored by the backend." },
  { id: "gateway", label: "Payment gateway", description: "Configure the encrypted Razorpay permit and store encrypted drafts for other providers. Only implemented adapters can process payments." },
  { id: "free-access", label: "Free access", path: "/api/owner/free-access", key: "grants", description: "Approve, customize, extend, edit, or revoke time-limited free access." },
  { id: "device-links", label: "Device links", path: "/api/owner/device-links", key: "links", description: "Generate, regenerate, and revoke owner-issued device links." },
  { id: "subscriptions", label: "Subscriptions", path: "/api/owner/subscriptions", key: "subscriptions", description: "Inspect and update subscription records." },
  { id: "payments", label: "Payments", path: "/api/owner/payments", key: "payments", description: "Review payment records and update their administrative metadata." },
  { id: "emi", label: "EMI", path: "/api/owner/emi", key: "emi", description: "Review and update EMI application records." },
  { id: "legal-templates", label: "Legal templates", path: "/api/owner/legal-templates", key: "templates", description: "Edit legal and compliance template records." },
  { id: "support-tickets", label: "Support tickets", path: "/api/owner/support-tickets", key: "tickets", description: "Review and update support ticket records." },
  { id: "audit", label: "Audit trail", path: "/api/owner/audit", key: "logs", description: "Review recorded owner actions." },
  { id: "health", label: "System health", path: "/api/owner/health", key: "health", description: "Check the owner-panel service health endpoint." }
];

function authClient() {
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  return getAuth(app);
}
function apiBase() {
  return (process.env.NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL ?? "").replace(/\/$/, "");
}
async function apiRequest<T>(path: string, user: User, method = "GET", payload?: unknown): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch(apiBase() + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(payload === undefined ? {} : { "Content-Type": "application/json" }) },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    cache: "no-store"
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `Request failed (HTTP ${response.status}).`);
  return body as T;
}
function jsonText(value: unknown) {
  return JSON.stringify(value, null, 2);
}
function recordLabel(row: Row) {
  return String(row.name ?? row.title ?? row.userName ?? row.email ?? row.mobile ?? row.id);
}
function cleanRecord(row: Row) {
  const { id, createdAt, createdBy, updatedAt, updatedAtEpochMs, createdAtEpochMs, updatedBy, ...values } = row;
  return values;
}


type GatewayPermit = {
  configured: boolean; enabled: boolean; mode: string; provider: string | null;
  displayName: string; revision?: number; updatedAtEpochMs?: number;
  credentialFieldsConfigured?: { keyId: boolean; keySecret: boolean; webhookSecret: boolean };
};
type GatewayProvider = {
  id: string; name: string; adapterImplemented: boolean; draftSaved: boolean;
  credentialsConfigured: boolean; draftDisplayName: string; draftMode: string; active: boolean;
};
async function callOwnerFunction<T>(name: string, data: Record<string, unknown> = {}): Promise<T> {
  const callable = httpsCallable<Record<string, unknown>, T>(getFunctions(authClient().app), name);
  return (await callable(data)).data;
}

function GatewayManager() {
  const [permit, setPermit] = useState<GatewayPermit | null>(null);
  const [providers, setProviders] = useState<GatewayProvider[]>([]);
  const [displayName, setDisplayName] = useState("Razorpay");
  const [mode, setMode] = useState("TEST");
  const [enabled, setEnabled] = useState(false);
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [draftProvider, setDraftProvider] = useState("CASHFREE");
  const [draftName, setDraftName] = useState("Cashfree");
  const [draftMode, setDraftMode] = useState("TEST");
  const [credentialsJson, setCredentialsJson] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const [current, catalog] = await Promise.all([
        callOwnerFunction<GatewayPermit>("getPaymentGatewayPermit"),
        callOwnerFunction<{ providers: GatewayProvider[] }>("getPaymentGatewayProviderCatalog")
      ]);
      setPermit(current);
      setProviders(catalog.providers || []);
      if (current.displayName) setDisplayName(current.displayName);
      if (current.mode) setMode(current.mode);
      setEnabled(current.enabled === true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment gateway settings could not be loaded.");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const savePermit = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await callOwnerFunction<{ revision: number; enabled: boolean; mode: string }>("savePaymentGatewayPermit", {
        provider: "RAZORPAY", displayName, mode, enabled, keyId, keySecret, webhookSecret
      });
      setKeyId(""); setKeySecret(""); setWebhookSecret("");
      setMessage(`Razorpay permit saved (revision ${result.revision}). Secret fields cleared from this form.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gateway permit could not be saved.");
    } finally { setBusy(false); }
  };

  const saveDraft = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await callOwnerFunction<{ displayName: string; adapterImplemented: boolean }>("savePaymentGatewayProviderDraft", {
        provider: draftProvider, displayName: draftName, mode: draftMode, credentialsJson
      });
      setCredentialsJson("{}");
      setMessage(`${result.displayName} draft encrypted and saved. ${result.adapterImplemented ? "An adapter is implemented." : "This provider is not active for checkout; its server adapter and verification tests are still required."}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gateway draft could not be saved.");
    } finally { setBusy(false); }
  };

  return <div className="card">
    <div className="toolbar" style={{justifyContent:"space-between",alignItems:"center"}}><h2>Payment gateway control</h2><button className="btn" disabled={busy} onClick={() => void refresh()}>Refresh gateway status</button></div>
    {message && <p className="notice">{message}</p>}{error && <p className="error">{error}</p>}
    <p className="muted">Gateway secrets are sent directly to authenticated Firebase callable functions and encrypted server-side. They are never returned by the status endpoint. Use test credentials first; live payment processing still requires deployment and a real webhook test.</p>
    <div className="grid">
      <div className="stat"><span>Active permit</span><strong>{permit?.enabled ? "Enabled" : "Disabled"}</strong><span className="muted small">{permit?.configured ? `${permit.provider} · ${permit.mode} · revision ${permit.revision ?? 0}` : "No permit configured"}</span></div>
      <div className="stat"><span>Implemented adapter</span><strong>Razorpay</strong><span className="muted small">Other listed providers are draft-only until their own server adapters and verification tests are implemented.</span></div>
    </div>
    <h3>Razorpay — active checkout adapter</h3>
    <div className="grid">
      <label>Display name<input className="input" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={80}/></label>
      <label>Mode<select className="input" value={mode} onChange={e => setMode(e.target.value)}><option value="TEST">Test</option><option value="LIVE">Live</option></select></label>
      <label>Key ID<input className="input" type="password" autoComplete="off" value={keyId} onChange={e => setKeyId(e.target.value)} placeholder={permit?.credentialFieldsConfigured?.keyId ? "Configured — enter new value to rotate" : "rzp_test_… or rzp_live_…"}/></label>
      <label>Key Secret<input className="input" type="password" autoComplete="new-password" value={keySecret} onChange={e => setKeySecret(e.target.value)} placeholder={permit?.credentialFieldsConfigured?.keySecret ? "Configured — enter new value to rotate" : "Enter secret securely"}/></label>
      <label>Webhook Secret<input className="input" type="password" autoComplete="new-password" value={webhookSecret} onChange={e => setWebhookSecret(e.target.value)} placeholder={permit?.credentialFieldsConfigured?.webhookSecret ? "Configured — enter new value to rotate" : "Enter webhook secret securely"}/></label>
      <label style={{display:"flex",gap:10,alignItems:"center"}}><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}/> Enable Razorpay permit</label>
    </div>
    <div className="row-actions"><button className="btn primary" disabled={busy || !displayName.trim() || ((!permit?.configured || enabled) && (!keyId.trim() || !keySecret.trim() || !webhookSecret.trim()))} onClick={() => void savePermit()}>Save encrypted Razorpay permit</button></div>
    <p className="muted small">To rotate or enable the permit, enter all three credential fields. Turning it off does not delete the encrypted credential history. Never paste credentials into the All settings JSON editor or public issues.</p>
    <hr style={{border:0,borderTop:"1px solid #e1e8f2",margin:"24px 0"}}/>
    <h3>Other gateway drafts</h3>
    <p className="muted">These details are encrypted and stored for future integration planning only. Saving a draft does not enable that provider for checkout.</p>
    <div className="grid">
      <label>Provider<select className="input" value={draftProvider} onChange={e => { const id=e.target.value; setDraftProvider(id); setDraftName(providers.find(p=>p.id===id)?.name || id); }}><option value="CASHFREE">Cashfree</option><option value="PHONEPE">PhonePe</option><option value="PAYU">PayU</option><option value="STRIPE">Stripe</option><option value="PAYPAL">PayPal</option><option value="CUSTOM">Custom Gateway</option><option value="RAZORPAY">Razorpay</option></select></label>
      <label>Display name<input className="input" value={draftName} onChange={e => setDraftName(e.target.value)} maxLength={80}/></label>
      <label>Draft mode<select className="input" value={draftMode} onChange={e => setDraftMode(e.target.value)}><option value="TEST">Test</option><option value="LIVE">Live (draft only)</option></select></label>
    </div>
    <label style={{display:"block",marginTop:12}}>Provider credentials JSON (optional)<textarea className="json" style={{minHeight:100,marginTop:6}} value={credentialsJson} onChange={e => setCredentialsJson(e.target.value)} spellCheck={false}/></label>
    <div className="row-actions"><button className="btn primary" disabled={busy || !draftName.trim()} onClick={() => void saveDraft()}>Save encrypted draft</button></div>
    <h3>Provider readiness</h3>
    {providers.map(provider => <div className="record" key={provider.id}><div className="record-head"><div><div className="record-title">{provider.name}</div><div className="muted small">{provider.adapterImplemented ? "Server adapter implemented" : "Adapter not implemented — cannot process payments"}</div></div><span className="pill" style={provider.active ? undefined : {background:"#f1f4f8",color:"#5a6678"}}>{provider.active ? "ACTIVE" : provider.draftSaved ? "DRAFT SAVED" : "NOT CONFIGURED"}</span></div><p className="muted small">{provider.draftDisplayName ? `Draft name: ${provider.draftDisplayName} · ${provider.draftMode} mode · credentials ${provider.credentialsConfigured ? "saved" : "not saved"}` : "No saved draft."}</p></div>)}
  </div>;
}

export default function OwnerPanel() {
  const [user, setUser] = useState<User | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [active, setActive] = useState<TabId>("overview");
  const [rows, setRows] = useState<Row[]>([]);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState("Checking Firebase session…");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editorId, setEditorId] = useState<string | null>(null);
  const [editorText, setEditorText] = useState("");
  const [createText, setCreateText] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [linkPlanId, setLinkPlanId] = useState("");
  const [freeGrantText, setFreeGrantText] = useState(jsonText({ userName: "", email: "", mobile: "", userId: "", durationPreset: "CUSTOM", startsAt: Date.now(), endsAt: Date.now() + 7 * 86400000, all19: true, features: [], reason: "" }));
  const currentTab = useMemo(() => TABS.find(tab => tab.id === active) ?? TABS[0], [active]);

  useEffect(() => {
    const auth = authClient();
    return onAuthStateChanged(auth, async nextUser => {
      setUser(nextUser);
      setPanel(null);
      setRows([]);
      setHealth(null);
      if (!nextUser) {
        setStatus("Sign in with the Google account or phone identity configured for OWNER access.");
        return;
      }
      setStatus("Verifying OWNER permissions…");
      try {
        const result = await apiRequest<Panel>("/api/owner/panel", nextUser);
        if (!result.owner || result.role !== "OWNER") throw new Error("This authenticated account is not an OWNER.");
        setPanel(result);
        setStatus("OWNER access verified by the server.");
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "OWNER verification failed.");
      }
    });
  }, []);

  const loadTab = useCallback(async (tabId: TabId, selectedUser = user) => {
    if (!selectedUser) return;
    const tab = TABS.find(item => item.id === tabId);
    if (!tab?.path) { setRows([]); setHealth(null); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      if (tabId === "settings") {
        const data = await apiRequest<{ settings: Record<string, unknown> }>(tab.path, selectedUser);
        setRows([{ id: "global", ...data.settings }]);
      } else if (tabId === "health") {
        const data = await apiRequest<Record<string, unknown>>(tab.path, selectedUser);
        setHealth(data); setRows([]);
      } else {
        const data = await apiRequest<Record<string, unknown>>(tab.path, selectedUser);
        const value = data[tab.key ?? ""];
        setRows(Array.isArray(value) ? value as Row[] : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this section.");
      setRows([]);
    } finally { setBusy(false); }
  }, [user]);

  useEffect(() => {
    if (panel && active !== "overview") void loadTab(active);
  }, [panel, active, loadTab]);

  const runAction = async (label: string, path: string, method: string, payload?: unknown, refresh = true) => {
    if (!user) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<Record<string, unknown>>(path, user, method, payload);
      if (path === "/api/owner/device-links/generate" || path.startsWith("/api/owner/device-links/regenerate/")) {
        const code = typeof result.code === "string" ? result.code : "";
        const expiry = typeof result.expiresAt === "number" ? new Date(result.expiresAt).toLocaleString() : "not supplied";
        setNotice(code ? `${label} One-time code: ${code} · Expires: ${expiry}. Copy it now; it is not written to the audit log.` : label);
      } else {
        setNotice(label);
      }
      setEditorId(null); setShowCreate(false);
      if (refresh) await loadTab(active, user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The action failed.");
    } finally { setBusy(false); }
  };

  const saveRow = async (row: Row) => {
    let values: Record<string, unknown>;
    try { values = JSON.parse(editorText); }
    catch { setError("Editor content must be valid JSON."); return; }
    if (active === "settings") {
      await runAction("Global settings saved.", "/api/owner/settings", "PATCH", { values });
    } else if (active === "free-access") {
      await runAction("Free-access grant updated.", `/api/owner/free-access/${encodeURIComponent(row.id)}`, "PATCH", { values });
    } else {
      const path = currentTab.path;
      if (!path) return;
      await runAction("Changes saved.", `${path}/${encodeURIComponent(row.id)}`, "PATCH", { values });
    }
  };

  const createRecord = async () => {
    if (!user) return;
    let values: Record<string, unknown>;
    try { values = JSON.parse(active === "free-access" ? freeGrantText : createText); }
    catch { setError("New record must be valid JSON."); return; }
    if (active === "free-access") {
      await runAction("Free access approved.", "/api/owner/free-access", "POST", values);
    } else if (active === "plans") {
      await runAction("Plan created.", "/api/owner/plans", "POST", { values });
    } else {
      setError("Create is available for plans and free-access approvals. Other collections are edited in place.");
      return;
    }
  };

  const signIn = async () => {
    setError(""); setStatus("Opening Google sign-in…");
    try { await signInWithPopup(authClient(), new GoogleAuthProvider()); }
    catch (e) { setStatus("Sign-in did not complete."); setError(e instanceof Error ? e.message : "Google sign-in failed."); }
  };
  const sendPhoneOtp = async () => {
    const normalized = phone.trim();
    if (!/^\+[1-9]\d{9,14}$/.test(normalized)) {
      setError("Enter a valid phone number including country code, for example +91…");
      return;
    }
    setError(""); setStatus("Sending verification code…");
    try {
      const verifier = new RecaptchaVerifier(authClient(), "owner-recaptcha-container", { size: "invisible" });
      const result = await signInWithPhoneNumber(authClient(), normalized, verifier);
      setConfirmation(result);
      setStatus("Verification code sent. Enter the code to finish sign-in.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Phone verification could not start.");
      setStatus("Phone sign-in did not complete.");
    }
  };
  const verifyPhoneOtp = async () => {
    if (!confirmation || !/^\d{6}$/.test(otp.trim())) {
      setError("Enter the 6-digit verification code.");
      return;
    }
    setError(""); setStatus("Verifying phone identity…");
    try {
      await confirmation.confirm(otp.trim());
      setConfirmation(null); setOtp("");
      setStatus("Phone verified. Checking OWNER permissions…");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The verification code was rejected.");
    }
  };

  const summary = [
    { label: "Managed users", value: "users" },
    { label: "Plans", value: "plans" },
    { label: "Free access grants", value: "free-access" },
    { label: "Feature flags", value: "features" }
  ];

  if (!user || !panel) {
    return <main className="owner-shell">
      <style jsx global>{`
        *{box-sizing:border-box}body{margin:0;background:#f4f7fb;color:#152238;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .owner-shell{max-width:760px;margin:8vh auto;padding:24px}.owner-login{background:white;border:1px solid #dfe6f0;border-radius:20px;padding:30px;box-shadow:0 18px 50px #172b4d12}
        .owner-login h1{font-size:clamp(26px,4vw,36px);margin:0 0 12px}.muted{color:#63718a;line-height:1.6}.primary{background:#1c5be8;color:white;border:0;border-radius:10px;padding:12px 16px;font-weight:700;cursor:pointer}
        .error{color:#a12727;background:#fff1f1;padding:12px;border-radius:10px;white-space:pre-wrap}
      `}</style>
      <div className="owner-login"><p>SMART CONTROL · PRIVATE ADMINISTRATION</p><h1>🔒 OWNER Control Panel</h1><p className="muted">{status}</p>
      {error && <p className="error">{error}</p>}
      {!user ? <>
        <button className="primary" onClick={signIn}>Continue with Google</button>
        <div style={{display:"grid",gap:10,marginTop:18}}>
          <label htmlFor="owner-phone">Or sign in with owner phone</label>
          <input id="owner-phone" className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91XXXXXXXXXX" autoComplete="tel"/>
          {!confirmation ? <button className="primary" onClick={() => void sendPhoneOtp()}>Send OTP</button> : <>
            <input className="input" value={otp} onChange={e => setOtp(e.target.value)} placeholder="6-digit OTP" inputMode="numeric" autoComplete="one-time-code"/>
            <button className="primary" onClick={() => void verifyPhoneOtp()}>Verify OTP</button>
          </>}
          <div id="owner-recaptcha-container"/>
        </div>
      </> : <button className="primary" onClick={() => void signOut(authClient())}>Sign out</button>}
      <p className="muted">There is no separate fee for this panel; Firebase/backend hosting may have provider charges. Owner access still requires the backend OWNER allowlist and valid Firebase authentication. No client-side bypass is provided.</p></div>
    </main>;
  }

  return <main className="owner-layout">
    <style jsx global>{`
      *{box-sizing:border-box}body{margin:0;background:#f3f6fb;color:#17243b;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      button,input,textarea,select{font:inherit}button{cursor:pointer}.owner-layout{min-height:100vh}.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px clamp(16px,4vw,44px);background:#101d34;color:white}.brand{font-weight:800;letter-spacing:.04em}.topbar small{display:block;color:#bdc9dd;margin-top:5px}
      .shell{display:grid;grid-template-columns:230px minmax(0,1fr);gap:22px;max-width:1500px;margin:auto;padding:24px}.sidebar{background:white;border:1px solid #e1e8f2;border-radius:16px;padding:10px;height:max-content;position:sticky;top:16px}.navbtn{display:block;width:100%;text-align:left;padding:11px 12px;border:0;border-radius:9px;background:transparent;color:#42516a;margin:2px 0}.navbtn.active{background:#eaf1ff;color:#164dbb;font-weight:750}.content{min-width:0}.heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}.heading h1{margin:0 0 8px;font-size:clamp(24px,3vw,34px)}.muted{color:#687790;line-height:1.55}.card{background:white;border:1px solid #e1e8f2;border-radius:16px;padding:20px;margin:16px 0;box-shadow:0 5px 20px #203a6108}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.stat{padding:18px;border:1px solid #e0e8f3;border-radius:13px;background:#fff}.stat strong{font-size:24px;display:block;margin-top:8px}.btn{border:1px solid #d3ddec;border-radius:9px;padding:9px 12px;background:white;color:#25344d;font-weight:650}.btn.primary{background:#1d5ce8;color:white;border-color:#1d5ce8}.btn.danger{color:#a32828;border-color:#f0caca}.btn:disabled{opacity:.55;cursor:wait}.toolbar{display:flex;gap:8px;flex-wrap:wrap}.record{border:1px solid #e3e9f2;border-radius:12px;padding:14px;margin:10px 0}.record-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}.record-title{font-weight:750;overflow-wrap:anywhere}.json{width:100%;min-height:220px;padding:12px;border:1px solid #cbd6e5;border-radius:10px;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:#fbfcff;color:#18243a}.input{width:100%;padding:11px;border:1px solid #ccd7e6;border-radius:9px}.notice{padding:12px;border-radius:10px;background:#eaf8ef;color:#17613a}.error{padding:12px;border-radius:10px;background:#fff0f0;color:#9b2222;white-space:pre-wrap}.pill{font-size:12px;font-weight:750;background:#eaf8ef;color:#17613a;border-radius:999px;padding:5px 8px}.small{font-size:13px}.empty{padding:24px;text-align:center;color:#6b7890;border:1px dashed #ccd7e6;border-radius:12px}.row-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;background:#f6f8fc;border-radius:9px;padding:10px;max-height:150px;overflow:auto}
      @media(max-width:820px){.shell{grid-template-columns:1fr;padding:14px}.sidebar{position:static;display:flex;overflow:auto;gap:4px}.navbtn{width:auto;white-space:nowrap}.grid{grid-template-columns:1fr}.topbar{align-items:flex-start}.card{padding:15px}}
    `}</style>
    <header className="topbar"><div className="brand">SMART CONTROL <small>Owner administration · private session</small></div><div className="toolbar"><span className="pill">OWNER VERIFIED</span><button className="btn" onClick={() => void signOut(authClient())}>Sign out</button></div></header>
    <div className="shell">
      <nav className="sidebar" aria-label="Owner sections">{TABS.map(tab => <button key={tab.id} className={`navbtn ${active === tab.id ? "active" : ""}`} onClick={() => { setActive(tab.id); setError(""); setNotice(""); setEditorId(null); setShowCreate(false); }}>{tab.label}</button>)}</nav>
      <section className="content">
        <div className="heading"><div><h1>{currentTab.label}</h1><p className="muted">{currentTab.description}</p></div><div className="toolbar"><button className="btn" disabled={busy || active === "overview"} onClick={() => void loadTab(active)}>Refresh</button></div></div>
        {notice && <p className="notice">{notice}</p>}{error && <p className="error">{error}</p>}{busy && <p className="muted">Working…</p>}
        {active === "overview" && <><div className="card"><span className="pill">SERVER AUTHORIZED</span><h2>Owner control center</h2><p className="muted">Signed in as an authenticated Firebase user. Privileged actions are checked again by the backend. Owner identity fields are intentionally not exposed by the panel API.</p><p><strong>Role:</strong> {panel.role} &nbsp; <strong>Visibility:</strong> {panel.publicVisibility} &nbsp; <strong>Identity:</strong> {panel.identityVisibility}</p><p className="muted small">{status}</p></div><div className="grid">{summary.map(item => <button key={item.value} className="stat" onClick={() => setActive(item.value as TabId)}><span>{item.label}</span><strong>Open →</strong></button>)}</div><div className="card"><h2>All owner capabilities</h2>{Object.entries(panel.capabilities).map(([area, actions]) => <p key={area}><strong>{area}</strong>: {actions.join(" · ")}</p>)}</div><div className="card"><h2>Safety and security</h2><p className="muted">This dashboard does not bypass user consent, Android operating-system permissions, or approved remote-control sessions. Keep production credentials in server-side environment/secret storage.</p></div></>}
        {active === "gateway" && <GatewayManager/>}
        {active === "health" && <div className="card"><h2>Backend health response</h2><pre>{jsonText(health ?? { status: "Use Refresh to check health." })}</pre></div>}
        {active === "device-links" && <div className="card"><h2>Generate device link</h2><p className="muted">Enter an enabled plan document ID. The backend creates a random one-time code using that plan's configured link validity.</p><div className="toolbar"><input className="input" style={{maxWidth:360}} value={linkPlanId} onChange={e => setLinkPlanId(e.target.value)} placeholder="Enabled plan document ID"/><button className="btn primary" disabled={busy || !linkPlanId.trim()} onClick={() => void runAction("Device link generated.", "/api/owner/device-links/generate", "POST", { planId: linkPlanId.trim() }, true)}>Generate link</button></div><p className="muted small">The one-time code is shown after generation so you can copy it. Treat it like a password and share it only with the intended recipient.</p><h3>Owned links</h3>{rows.length === 0 ? <div className="empty">No owner-issued device links found, or none have been loaded.</div> : rows.map(row => <RecordCard key={row.id} row={row} editorId={editorId} editorText={editorText} setEditorId={setEditorId} setEditorText={setEditorText} onSave={saveRow} onCancel={() => setEditorId(null)} busy={busy} readOnly extraActions={<><button className="btn" onClick={() => void runAction("Link regenerated.", `/api/owner/device-links/regenerate/${encodeURIComponent(row.id)}`, "POST", {})}>Regenerate</button><button className="btn danger" onClick={() => { if (confirm("Revoke this device link?")) void runAction("Link revoked.", `/api/owner/device-links/revoke/${encodeURIComponent(row.id)}`, "POST", {}); }}>Revoke</button></>}/>)}</div>}
        {active === "settings" && <div className="card"><h2>Global settings JSON</h2><p className="muted">Edit all global settings as a JSON object. Keep values compatible with the backend consumers. Changes are audited.</p>{rows[0] && <RecordCard row={rows[0]} editorId={editorId} editorText={editorText} setEditorId={setEditorId} setEditorText={setEditorText} onSave={saveRow} onCancel={() => setEditorId(null)} busy={busy} hideSummary/>}</div>}
        {(active === "users" || active === "plans" || active === "features" || active === "catalog-features" || active === "free-access" || active === "subscriptions" || active === "payments" || active === "emi" || active === "legal-templates" || active === "support-tickets" || active === "audit") && <div className="card">
          <div className="heading"><div><h2>{currentTab.label} records</h2><p className="muted small">{rows.length} record(s) loaded. Use Edit JSON to change the complete record payload.</p></div><div className="toolbar">{(active === "plans" || active === "free-access") && <button className="btn primary" onClick={() => { setShowCreate(v => !v); setError(""); setEditorId(null); }}>＋ {active === "plans" ? "Create plan" : "Approve free access"}</button>}</div></div>
          {showCreate && <div className="record"><h3>{active === "plans" ? "New plan" : "Approve free access"}</h3><p className="muted small">Provide a JSON object matching the backend API fields.</p><textarea className="json" value={active === "free-access" ? freeGrantText : createText} onChange={e => active === "free-access" ? setFreeGrantText(e.target.value) : setCreateText(e.target.value)} spellCheck={false}/><div className="row-actions"><button className="btn primary" disabled={busy} onClick={() => void createRecord()}>Save</button><button className="btn" onClick={() => setShowCreate(false)}>Cancel</button></div></div>}
          {rows.length === 0 ? <div className="empty">No records returned for this section.</div> : rows.map(row => <RecordCard key={row.id} row={row} editorId={editorId} editorText={editorText} setEditorId={setEditorId} setEditorText={setEditorText} onSave={saveRow} onCancel={() => setEditorId(null)} busy={busy} readOnly={active === "audit"} extraActions={<>{active === "users" && <button className="btn" onClick={() => void runAction("User banned.", `/api/owner/users/${encodeURIComponent(row.id)}/ban`, "POST", {})}>Ban</button>}{active === "catalog-features" && <button className={`btn ${row.enabled === true ? "danger" : "primary"}`} onClick={() => void runAction(`Feature ${row.enabled === true ? "disabled" : "enabled"}.`, `/api/owner/catalog-features/${encodeURIComponent(row.id)}`, "PATCH", { values: { enabled: row.enabled !== true } })}>{row.enabled === true ? "Disable" : "Enable"}</button>}{active === "free-access" && <button className="btn danger" onClick={() => { if (confirm("Revoke this free-access grant?")) void runAction("Free access revoked.", `/api/owner/free-access/${encodeURIComponent(row.id)}/revoke`, "POST", {}); }}>Revoke</button>}{(active === "users" || active === "plans" || active === "subscriptions") && <button className="btn danger" onClick={() => { if (confirm(`Delete ${recordLabel(row)}? This cannot be undone.`)) void runAction("Record deleted.", `${currentTab.path}/${encodeURIComponent(row.id)}`, "DELETE", {}); }}>Delete</button>}</>}/>)}
        </div>}
        <footer className="muted small">Smart Control Owner Panel · Access control is enforced server-side · Owner identity is not rendered.</footer>
      </section>
    </div>
  </main>;
}

function RecordCard({ row, editorId, editorText, setEditorId, setEditorText, onSave, onCancel, busy, extraActions, hideSummary = false, readOnly = false }: {
  row: Row; editorId: string | null; editorText: string; setEditorId: (value: string | null) => void; setEditorText: (value: string) => void;
  onSave: (row: Row) => void; onCancel: () => void; busy: boolean; extraActions?: React.ReactNode; hideSummary?: boolean; readOnly?: boolean;
}) {
  const editing = editorId === row.id;
  return <article className="record">
    <div className="record-head"><div><div className="record-title">{recordLabel(row)}</div><div className="muted small">ID: {row.id} {row.status ? ` · Status: ${String(row.status)}` : ""}</div></div><div className="toolbar">{!readOnly && <button className="btn" onClick={() => { setEditorId(editing ? null : row.id); setEditorText(jsonText(cleanRecord(row))); }}>{editing ? "Close editor" : "Edit JSON"}</button>}{extraActions}</div></div>
    {!hideSummary && !editing && <pre>{jsonText(row)}</pre>}
    {editing && <><textarea className="json" value={editorText} onChange={e => setEditorText(e.target.value)} spellCheck={false}/><div className="row-actions"><button className="btn primary" disabled={busy} onClick={() => onSave(row)}>Save changes</button><button className="btn" onClick={onCancel}>Cancel</button></div></>}
  </article>;
}
