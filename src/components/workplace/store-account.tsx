"use client";
import { useRef, useState, type FormEvent } from "react";
import { Copy, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchCombobox } from "@/components/ui/search-combobox";
export function StoreAccountForm({
  branches,
}: {
  branches: { id: string; name: string }[];
}) {
  const [branchId, setBranchId] = useState(
    branches.length === 1 ? branches[0].id : "",
  );
  const [name, setName] = useState(""),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [created, setCreated] = useState(false),
    [copied, setCopied] = useState(false);
  const attempt = useRef<{ fingerprint: string; requestId: string } | null>(
    null,
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const payload = {
        action: "createStore",
        branchId,
        name,
        username,
        password,
      },
      fingerprint = JSON.stringify(payload);
    if (attempt.current?.fingerprint !== fingerprint)
      attempt.current = { fingerprint, requestId: crypto.randomUUID() };
    try {
      const response = await fetch("/api/workplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          requestId: attempt.current.requestId,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ?? "No pudimos crear la cuenta del local.",
        );
      setCreated(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No hay conexión. Reintentá para confirmar la misma cuenta.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div>
        <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-brand">
          <Store size={25} />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-brand">
          Cuenta del local
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Creá el acceso compartido para la PC o tablet del mostrador. Permite
          tomar pedidos, mostrar el QR y abrir la gestión con autorización
          personal de la encargada.
        </p>
      </div>
      <p className="rounded-xl border border-line bg-surface p-4 text-sm leading-relaxed text-muted">
        La cuenta pertenece a una sola sucursal. No ficha como una empleada ni
        administra usuarios, producción o configuración.
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {created ? (
        <div
          role="status"
          className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6"
        >
          <h2 className="font-semibold text-emerald-900">
            Cuenta del local creada
          </h2>
          <p className="text-sm text-emerald-900">
            Ingresá con estos datos en la PC o tablet de{" "}
            {branches.find((b) => b.id === branchId)?.name}.
          </p>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="inline font-semibold">Usuario: </dt>
              <dd className="inline">{username}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Contraseña: </dt>
              <dd className="inline select-all break-all">{password}</dd>
            </div>
          </dl>
          <p className="text-xs text-emerald-900">
            Guardá estos datos antes de salir. La contraseña no se muestra en el
            historial.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard
                .writeText(
                  `Cuenta del local · ${branches.find((b) => b.id === branchId)?.name}\nUsuario: ${username}\nContraseña: ${password}`,
                )
                .then(() => setCopied(true))
                .catch(() =>
                  setError("No pudimos copiar. Podés seleccionar los datos."),
                );
            }}
          >
            <Copy size={16} />
            {copied ? "Datos copiados" : "Copiar datos de acceso"}
          </Button>
        </div>
      ) : (
        <form
          onSubmit={submit}
          className="rounded-2xl border border-line bg-white p-6"
        >
          <fieldset disabled={busy} className="space-y-5">
            <div>
              <Label htmlFor="store-branch" required>
                Sucursal
              </Label>
              <div className="mt-2">
                <SearchCombobox
                  id="store-branch"
                  label="Sucursal"
                  required
                  value={branchId}
                  selectedLabel={
                    branches.find((b) => b.id === branchId)?.name ?? ""
                  }
                  options={branches}
                  onSearch={() => {}}
                  onChange={setBranchId}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="store-name" required>
                Nombre de la cuenta
              </Label>
              <Input
                id="store-name"
                className="mt-2"
                placeholder="Mostrador · Alberdi"
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="store-username" required>
                Usuario para ingresar
              </Label>
              <Input
                id="store-username"
                className="mt-2"
                placeholder="mostrador.alberdi"
                required
                pattern="[a-z0-9_.]{3,30}"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
              />
            </div>
            <div>
              <Label htmlFor="store-password" required>
                Contraseña
              </Label>
              <Input
                id="store-password"
                className="mt-2"
                required
                type="password"
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button
                type="button"
                variant="link"
                className="mt-1 px-0"
                onClick={() => setPassword(`Kybo-${crypto.randomUUID()}!`)}
              >
                Generar contraseña segura
              </Button>
            </div>
            <div className="flex justify-end border-t border-line pt-5">
              <Button type="submit" className="min-h-11">
                {busy ? "Creando cuenta…" : "Crear cuenta del local"}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
