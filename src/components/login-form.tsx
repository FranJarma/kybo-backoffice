"use client";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
const subscribe = () => () => {};
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? "Demasiados intentos. Probá de nuevo más tarde."
            : "No pudimos iniciar sesión. Revisá el correo y la contraseña.",
        );
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("No hay conexión. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={!hydrated || busy} className="space-y-6">
        <div>
          <Label htmlFor="email">Correo electrónico</Label>
          <div className="relative">
            <Mail
              size={18}
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <Input
              id="email"
              autoComplete="username"
              type="email"
              placeholder="tu@correo.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 pl-11"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="password">Contraseña</Label>
          <div className="relative">
            <LockKeyhole
              size={18}
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <Input
              id="password"
              autoComplete="current-password"
              type="password"
              placeholder="Ingresá tu contraseña"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 pl-11"
            />
          </div>
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm leading-relaxed text-red-700"
          >
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} className="h-12 w-full">
          {busy ? "Ingresando…" : "Ingresar"}
          {busy ? (
            <LoaderCircle
              size={18}
              aria-hidden="true"
              className="motion-safe:animate-spin"
            />
          ) : (
            <ArrowRight size={18} aria-hidden="true" />
          )}
        </Button>
      </fieldset>
    </form>
  );
}
