"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        setError("Invalid credentials.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleMicrosoftLogin() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/auth/microsoft/start`, { credentials: "include" });
      if (!response.ok) {
        setError("Microsoft sign-in unavailable.");
        return;
      }

      const data = (await response.json()) as { url: string };
      window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="mt-4 space-y-4" onSubmit={handleLogin}>
      <input
        className="w-full rounded-md border border-border bg-transparent px-3 py-2"
        placeholder="Email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <input
        className="w-full rounded-md border border-border bg-transparent px-3 py-2"
        type="password"
        placeholder="Password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <Button className="w-full" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </Button>
      <Button className="w-full" variant="secondary" type="button" onClick={handleMicrosoftLogin} disabled={loading}>
        Sign in with Microsoft
      </Button>
    </form>
  );
}
