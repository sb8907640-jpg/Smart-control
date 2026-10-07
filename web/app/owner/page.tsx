"use client";

import { useEffect, useState } from "react";
import { getApps, initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, User } from "firebase/auth";

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

function authClient() {
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  return getAuth(app);
}

function apiBase() {
  return (process.env.NEXT_PUBLIC_SMARTCONTROL_API_BASE_URL ?? "").replace(/\/$/, "");
}

async function apiGet<T>(path: string, user: User): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch(apiBase() + path, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store"
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `Request failed (HTTP ${response.status}).`);
  return body as T;
}

export default function OwnerPanel() {
  const [user, setUser] = useState<User | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [auditCount, setAuditCount] = useState<number | null>(null);
  const [status, setStatus] = useState("Authenticating owner session...");

  useEffect(() => {
    const auth = authClient();
    return onAuthStateChanged(auth, async nextUser => {
      setUser(nextUser);
      if (!nextUser) {
        setStatus("Owner authentication required.");
        setPanel(null);
        return;
      }
      try {
        const [nextPanel, audit] = await Promise.all([
          apiGet<Panel>("/api/owner/panel", nextUser),
          apiGet<{ logs: unknown[] }>("/api/owner/audit", nextUser)
        ]);
        setPanel(nextPanel);
        setAuditCount(audit.logs.length);
        setStatus("OWNER control panel verified.");
      } catch (error) {
        setPanel(null);
        setStatus(error instanceof Error ? error.message : "OWNER verification failed.");
      }
    });
  }, []);

  if (!user || !panel) {
    return <main><h1>Owner Control Panel</h1><p>{status}</p></main>;
  }

  return (
    <main>
      <h1>🔒 OWNER Control Panel</h1>
      <p>{status}</p>
      <p>Access: {panel.role} · Visibility: {panel.publicVisibility} · Identity: {panel.identityVisibility}</p>
      <p>Owner identity is never rendered here. Audit activity remains private to authenticated OWNER access.</p>

      <section>
        <h2>Control capabilities</h2>
        <ul>
          {Object.entries(panel.capabilities).map(([area, actions]) => (
            <li key={area}><strong>{area}</strong>: {actions.join(" / ")}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Audit trail</h2>
        <p>{auditCount ?? 0} audit records available to the authenticated OWNER session.</p>
      </section>

      <section>
        <h2>Security</h2>
        <p>This panel is unlisted from the normal public UI and still requires Firebase authentication plus the server-side OWNER allowlist. It does not bypass consent, OS permissions, or approved remote-control sessions.</p>
      </section>
    </main>
  );
}
