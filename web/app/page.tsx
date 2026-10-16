"use client";

import { useEffect, useRef, useState } from "react";
import { getApps, initializeApp } from "firebase/app";
import { getAuth, Auth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, User, RecaptchaVerifier, ConfirmationResult, signInWithPhoneNumber } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const firebaseConfigured = Object.values(firebaseConfig).every(
  value => typeof value === "string" && value.trim().length > 0
);

type BackendSession = {
  authenticated: boolean;
  uid: string;
  email: string | null;
  phoneNumber: string | null;
  admin: boolean;
};

type Device = {
  id: string;
  name?: string;
  platform?: string;
  status?: string;
};

type SystemStatus = {
  ok: boolean;
  service: string;
  firestore: string;
  postgres: { configured: boolean; ok: boolean };
};

function authClient() {
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  return getAuth(app);
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

const apiConfigurationError = (() => {
  try {
    return apiBase() ? null : "Smart Control API URL is not configured.";
  } catch (error) {
    return error instanceof Error ? error.message : "Smart Control API URL is invalid.";
  }
})();
const apiConfigured = apiConfigurationError === null;

async function apiGet<T>(path: string, user: User): Promise<T> {
  const token = await user.getIdToken();
  const base = apiBase();
  if (!base) throw new Error("Smart Control API URL is not configured.");
  const response = await fetch(base + path, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store"
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `Backend request failed (HTTP ${response.status}).`);
  return body as T;
}

async function initiateWhatsAppSupport(user: User) {
  const token = await user.getIdToken();
  const base = apiBase();
  if (!base) throw new Error("Smart Control API URL is not configured.");
  const response = await fetch(base + "/api/support/whatsapp/initiate", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.whatsappUrl !== "string") {
    throw new Error(body.error ?? "WhatsApp support is unavailable.");
  }
  let target: URL;
  try {
    target = new URL(body.whatsappUrl);
  } catch {
    throw new Error("WhatsApp support returned an invalid link.");
  }
  if (target.protocol !== "https:" || target.hostname !== "wa.me" || target.username || target.password) {
    throw new Error("WhatsApp support returned an unsafe link.");
  }
  window.location.assign(target.toString());
}

export default function Home() {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<BackendSession | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [remoteConfig, setRemoteConfig] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState("Not connected");
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) {
      setStatus("Firebase is not configured. Add the required NEXT_PUBLIC_FIREBASE_* environment variables and rebuild the web app.");
      return;
    }

    try {
      const client = authClient();
      setAuth(client);
      const unsubscribe = onAuthStateChanged(client, nextUser => {
        // Never carry account-scoped backend data across any auth-state transition.
        setSession(null);
        setDevices([]);
        setSystem(null);
        setRemoteConfig(null);
        setConfirmation(null);
        setOtp("");
        setUser(nextUser);
      });
      return () => {
        unsubscribe();
        recaptchaRef.current?.clear();
        recaptchaRef.current = null;
      };
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Firebase initialization failed.");
    }
  }, []);

  async function signIn() {
    if (!auth) {
      setStatus("Authentication is still initializing. Please try again in a moment.");
      return;
    }
    setBusy(true);
    setStatus("Signing in with Google...");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      setStatus("Signed in. Verifying backend session...");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp() {
    if (!auth) {
      setStatus("Firebase authentication is unavailable. Check the web environment configuration.");
      return;
    }
    const normalized = phone.trim();
    if (!/^\+[1-9]\d{9,14}$/.test(normalized)) {
      setStatus("Enter a valid phone number with country code.");
      return;
    }
    setBusy(true);
    try {
      if (!recaptchaRef.current) recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
      const result = await signInWithPhoneNumber(auth, normalized, recaptchaRef.current);
      setConfirmation(result);
      setStatus("OTP sent. Enter the verification code.");
    } catch (error) {
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
      setStatus(error instanceof Error ? error.message : "OTP request failed");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    if (!confirmation || !/^\d{6}$/.test(otp.trim())) {
      setStatus("Enter the 6-digit OTP.");
      return;
    }
    setBusy(true);
    try {
      await confirmation.confirm(otp.trim());
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
      setConfirmation(null);
      setOtp("");
      setStatus("Phone authentication verified. Loading backend session...");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "OTP verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function verifySession() {
    if (!user) return;
    setBusy(true);
    setStatus("Loading authenticated Smart Control data...");
    try {
      const [nextSession, deviceResponse, nextSystem, configResponse] = await Promise.all([
        apiGet<BackendSession>("/api/auth/session", user),
        apiGet<{ devices: Device[] }>("/api/devices", user),
        apiGet<SystemStatus>("/api/system/status", user),
        // Remote Config is supplemental. Its outage must not block authentication
        // or the core device/system dashboard.
        apiGet<{ values: Record<string, unknown> }>("/api/config", user)
          .catch(() => ({ values: {} as Record<string, unknown> }))
      ]);
      setSession(nextSession);
      setDevices(deviceResponse.devices);
      setSystem(nextSystem);
      setRemoteConfig(configResponse.values || {});
      setStatus("Backend session verified");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Backend request failed");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (!auth) {
      setStatus("Authentication is still initializing. Please try again in a moment.");
      return;
    }
    setBusy(true);
    try {
      await signOut(auth);
      setSession(null);
      setDevices([]);
      setSystem(null);
      setRemoteConfig(null);
      setConfirmation(null);
      setOtp("");
      setStatus("Signed out");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sign-out failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <div className="hero-kicker"><span className="brand-mark" aria-hidden="true" /> FAMILY SAFETY COMMAND CENTER</div>
      <h1>Smart Control</h1>
      <p className="hero-copy">Stay connected. Stay in control. Manage trusted devices, approved sessions, and system health from one clear dashboard.</p>

      {!firebaseConfigured ? (
        <section className="setup-panel" role="alert">
          <h2>Setup required</h2>
          <p>Firebase web configuration is missing. Add the required NEXT_PUBLIC_FIREBASE_* settings in the deployment environment, then rebuild the application. Sign-in is disabled until Firebase configuration is valid.</p>
        </section>
      ) : null}

      {!apiConfigured ? (
        <section className="setup-panel" role="alert">
          <h2>Backend setup required</h2>
          <p>{apiConfigurationError} Set NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL to the trusted HTTPS backend origin (HTTP is allowed only for localhost development) and rebuild the web application. Backend actions are disabled until this is valid.</p>
        </section>
      ) : null}

      <section className="auth-panel">
        <h2>Account access</h2>
        <p>{user ? `Signed in as ${user.email ?? user.uid}` : "Not signed in"}</p>
        <button onClick={signIn} disabled={!auth || busy || Boolean(user)}>Continue with Google</button>{" "}
        <div id="recaptcha-container" aria-hidden="true" />
        <label className="field-label" htmlFor="phone-number">Phone number</label>
        <input id="phone-number" type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91XXXXXXXXXX" aria-label="Phone number with country code" disabled={!auth || busy || Boolean(user)} />
        <button onClick={sendOtp} disabled={!auth || busy || Boolean(user)}>Send OTP</button>
        {confirmation ? (
          <>
            <label className="field-label" htmlFor="phone-otp">Verification code</label>
            <input id="phone-otp" type="text" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit OTP" aria-label="Six-digit verification code" disabled={busy} />
            <button onClick={verifyOtp} disabled={busy}>Verify OTP</button>
          </>
        ) : null}
        <button onClick={logout} disabled={busy || !user}>Sign out</button>
      </section>

      <section className="support-panel">
        <h2>Support</h2>
        <button onClick={async () => {
          if (!user) { setStatus("Sign in to contact support."); return; }
          setBusy(true);
          try { await initiateWhatsAppSupport(user); } catch (error) { setStatus(error instanceof Error ? error.message : "WhatsApp support failed"); } finally { setBusy(false); }
        }} disabled={busy || !user || !apiConfigured}>💬 WhatsApp Support</button>
        <p>Click → Talk to Support</p>
      </section>

      <section className="backend-panel">
        <h2>Backend session</h2>
        <button onClick={verifySession} disabled={busy || !user || !apiConfigured}>Verify authenticated session</button>
        <p className="status-message" role="status" aria-live="polite">{status}</p>
        {session ? (
          <pre><code>{JSON.stringify(session, null, 2)}</code></pre>
        ) : null}
      </section>

      {session ? (
        <>
          <section className="devices-panel">
            <h2>Trusted devices</h2>
            {devices.length === 0 ? <p>No devices returned.</p> : (
              <ul>
                {devices.map(device => (
                  <li key={device.id}>
                    <strong>{device.name ?? device.id}</strong>
                    {" — "}{[device.platform, device.status].filter(Boolean).join(" • ")}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {system ? (
            <section className="system-panel">
              <h2>System status</h2>
              <p>{system.ok ? "Healthy" : "Degraded"} · Firestore: {system.firestore} · PostgreSQL: {system.postgres.ok ? "Healthy" : system.postgres.configured ? "Unavailable" : "Not configured"}</p>
            </section>
          ) : null}
          {remoteConfig ? (
            <section className="config-panel">
              <h2>Remote configuration</h2>
              <pre><code>{JSON.stringify(remoteConfig, null, 2)}</code></pre>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
