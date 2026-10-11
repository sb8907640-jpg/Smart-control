"use client";

import { useEffect, useState } from "react";
import { getApps, initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut, User } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

function authClient() {
  return getAuth(getApps()[0] ?? initializeApp(firebaseConfig));
}

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => onAuthStateChanged(authClient(), setUser), []);

  async function logout() {
    try {
      await signOut(authClient());
      setStatus("Signed out.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not sign out.");
    }
  }

  return (
    <main className="settings-page">
      <header><p className="eyebrow">FAMILY SURAKSHA</p><h1>Settings</h1><p>Account and connection safety</p></header>
      <section>
        <h2>Account</h2>
        <p>{user ? `Signed in as ${user.email ?? user.uid}` : "Not signed in"}</p>
        {user ? <button onClick={logout}>Sign out</button> : <a href="/link">Return to invitation</a>}
      </section>
      <section>
        <h2>Pairing & permissions</h2>
        <p>Family account linking does not automatically grant remote-control access, location access, microphone access, or other device permissions. Review and approve each permission in the relevant app and Android settings.</p>
        <a href="/link">← Back to link receive</a>
      </section>
      {status ? <p role="status">{status}</p> : null}
      <style jsx>{`
        .settings-page { max-width:620px; margin:0 auto; padding:32px 16px; }
        header { padding:8px 0 18px; }
        .eyebrow { color:#475569; font-size:12px; font-weight:800; letter-spacing:1.6px; }
        h1 { margin:0; font-size:32px; }
        header p:last-child { color:#64748b; }
        section { margin:14px 0; padding:20px; border:1px solid #e2e8f0; border-radius:16px; background:white; }
        h2 { margin-top:0; font-size:18px; }
        p { line-height:1.6; color:#475569; }
        button,a { display:inline-block; margin-top:8px; padding:11px 14px; border:0; border-radius:9px; background:#3730a3; color:white; font-weight:700; text-decoration:none; }
      `}</style>
    </main>
  );
}
