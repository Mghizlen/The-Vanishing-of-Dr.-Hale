"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [values, setValues] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const response = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
    const body = await response.json() as { ok?: boolean; error?: { message?: string } };
    if (response.ok && body.ok) router.push("/lobby"); else setError(body.error?.message ?? "Unable to register.");
    setBusy(false);
  }
  return <main className="auth-page"><form className="card auth-card" onSubmit={submit}>
    <p className="eyebrow">BLACKWOOD OBSERVATORY</p><h1>Join the investigation</h1>
    <label>Username<input value={values.username} onChange={(event) => setValues({ ...values, username: event.target.value })} minLength={3} maxLength={24} required /></label>
    <label>Password<input value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} type="password" minLength={8} required /></label>
    {error && <p className="error-text">{error}</p>}<button disabled={busy}>{busy ? "Creating..." : "Register"}</button>
    <a href="/login">I already have an account</a>
  </form></main>;
}
