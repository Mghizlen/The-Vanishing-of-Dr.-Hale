"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    const body = await response.json() as { ok?: boolean; error?: { message?: string } };
    if (response.ok && body.ok) router.push("/lobby");
    else setError(body.error?.message ?? "Unable to sign in.");
    setBusy(false);
  }

  return <main className="auth-page"><form className="card auth-card" onSubmit={submit}>
    <p className="eyebrow">BLACKWOOD OBSERVATORY</p><h1>Return to the case</h1>
    <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
    <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label>
    {error && <p className="error-text">{error}</p>}<button disabled={busy}>{busy ? "Checking..." : "Sign in"}</button>
    <a href="/register">Create an investigator account</a>
  </form></main>;
}
