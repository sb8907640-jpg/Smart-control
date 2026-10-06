"use client";

import { useEffect, useState } from "react";
import { getApps, initializeApp } from "firebase/app";
import { getAuth, Auth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, User, RecaptchaVerifier, ConfirmationResult, signInWithPhoneNumber } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

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
  return (process.env.NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL ?? "").replace(/\/$/, "");
}

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

  useEffect(() => {
    const client = authClient();
    setAuth(client);
    return onAuthStateChanged(client, setUser);
  }, []);

  async function signIn() {
    setBusy(true);
    setStatus("Signing in with Google...");
    if (!auth) return;
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
    if (!auth) return;
    const normalized = phone.trim();
    if (!/^\+[1-9]\d{9,14}$/.test(normalized)) {
      setStatus("Enter a valid phone number with country code.");
      return;
    }
    setBusy(true);
    try {
      const verifier = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
      const result = await signInWithPhoneNumber(auth, normalized, verifier);
      setConfirmation(result);
      setStatus("OTP sent. Enter the verification code.");
    } catch (error) {
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
        apiGet<{ values: Record<string, unknown> }>("/api/config", user)
      ]);
      setSession(nextSession);
      setDevices(deviceResponse.devices);
      setSystem(nextSystem);
      setRemoteConfig(configResponse.values);
      setStatus("Backend session verified");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Backend request failed");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    if (!auth) return;
    try {
      await signOut(auth);
      setSession(null);
      setDevices([]);
      setSystem(null);
      setStatus("Signed out");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Smart Control</h1>
      <p>Consent-based family safety and remote support. Sensitive actions remain subject to platform permissions and explicit sessions.</p>

      <section>
        <h2>Authentication</h2>
        <p>{user ? `Signed in as ${user.email ?? user.uid}` : "Not signed in"}</p>
        <button onClick={signIn} disabled={busy || Boolean(user)}>Continue with Google</button>{" "}
        <div id="recaptcha-container" />
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91XXXXXXXXXX" disabled={busy || Boolean(user)} />
        <button onClick={sendOtp} disabled={busy || Boolean(user)}>Send OTP</button>
        {confirmation ? (
          <>
            <input value={otp} onChange={e => setOtp(e.target.value.replace(/\\D/g, "").slice(0, 6))} placeholder="6-digit OTP" disabled={busy} />
            <button onClick={verifyOtp} disabled={busy}>Verify OTP</button>
          </>
        ) : null}
        <button onClick={logout} disabled={busy || !user}>Sign out</button>
      </section>

      <section>
        <h2>Backend session</h2>
        <button onClick={verifySession} disabled={busy || !user}>Verify authenticated session</button>
        <p>{status}</p>
        {session ? (
          <pre><code>{JSON.stringify(session, null, 2)}</code></pre>
        ) : null}
      </section>

      {session ? (
        <>
          <section>
            <h2>Devices</h2>
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
            <section>
              <h2>System status</h2>
              <p>{system.ok ? "Healthy" : "Degraded"} · Firestore: {system.firestore} · PostgreSQL: {system.postgres.ok ? "Healthy" : system.postgres.configured ? "Unavailable" : "Not configured"}</p>
            </section>
          ) : null}
          {remoteConfig ? (
            <section>
              <h2>Remote configuration</h2>
              <pre><code>{JSON.stringify(remoteConfig, null, 2)}</code></pre>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
