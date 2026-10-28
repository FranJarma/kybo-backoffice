"use client";
import { useMemo, useRef, useState, type FormEvent } from "react";
import {
  Plus,
  RefreshCw,
  Search,
  Pencil,
  Eye,
  EyeOff,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldCaption } from "@/components/ui/field-caption";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { OperationAlert } from "@/components/ui/operation-alert";
import { useErrorFeedback } from "@/components/ui/use-error-feedback";
import {
  userRoles,
  type ManagedUser,
  type UserRole,
  type UsersSnapshot,
  type MembershipInput,
} from "@/modules/users/types";
import { userCommandSchema } from "@/modules/users/validation";

type Draft = {
  name: string;
  username: string;
  email: string;
  password: string;
  role: UserRole;
  disabled: boolean;
  catalogManager: boolean;
  memberships: MembershipInput[];
};
const empty = (): Draft => ({
  name: "",
  username: "",
  email: "",
  password: "",
  role: "staff",
  disabled: false,
  catalogManager: false,
  memberships: [],
});
export function UsersManager({ initial }: { initial: UsersSnapshot }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initial);
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState<Draft>(empty),
    [showPassword, setShowPassword] = useState(false);
  const [error, setError, errorAttempt] = useErrorFeedback();
  const [notice, setNotice] = useState({ message: "", key: 0 });
  const [fields, setFields] = useState<Record<string, string>>({});
  const form = useRef<HTMLFormElement>(null);
  const retry = useRef<{ body: string; requestId: string } | null>(null);
  const visible = useMemo(() => {
    const text = query.trim().toLocaleLowerCase();
    return snapshot.rows.filter(
      (row) =>
        (status === "all" || row.disabled === (status === "inactive")) &&
        `${row.name} ${row.username ?? ""} ${row.email ?? ""}`
          .toLocaleLowerCase()
          .includes(text),
    );
  }, [snapshot.rows, query, status]);
  const ownAccount = editing?.id === snapshot.currentUserId;
  function update(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setFields({});
  }
  function edit(row: ManagedUser | null) {
    setEditing(row);
    setDraft(
      row
        ? {
            name: row.name,
            username: row.username ?? "",
            email: row.email ?? "",
            password: "",
            role: row.role,
            disabled: row.disabled,
            catalogManager: row.catalogManager,
            memberships: row.memberships.map((m) => ({ ...m })),
          }
        : empty(),
    );
    setError("");
    setFields({});
    setShowPassword(false);
    retry.current = null;
    setOpen(true);
  }
  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch("/api/settings/users", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "No pudimos actualizar los usuarios.");
      setSnapshot(data);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setRefreshing(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    const body = {
      ...draft,
      memberships: draft.role === "admin" ? [] : draft.memberships,
      ...(editing ? { id: editing.id, version: editing.version } : {}),
    };
    const serialized = JSON.stringify(body);
    if (retry.current?.body !== serialized)
      retry.current = { body: serialized, requestId: crypto.randomUUID() };
    const parsed = userCommandSchema.safeParse({
      ...body,
      requestId: retry.current.requestId,
    });
    if (!parsed.success) {
      const invalid = Object.fromEntries(
        parsed.error.issues.map((issue) => [
          String(issue.path[0]),
          issue.message,
        ]),
      );
      setFields(invalid);
      setError(parsed.error.issues[0].message);
      const first = Object.keys(invalid)[0];
      form.current
        ?.querySelector<HTMLElement>(`[data-user-field="${first}"]`)
        ?.focus();
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/settings/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "No pudimos guardar la cuenta.");
      if (
        ownAccount &&
        (parsed.data.password ||
          parsed.data.username !== (editing?.username ?? "") ||
          parsed.data.email !== (editing?.email ?? ""))
      ) {
        router.replace("/login");
        router.refresh();
        return;
      }
      setSnapshot(data.snapshot);
      setOpen(false);
      setDraft(empty());
      retry.current = null;
      setNotice((old) => ({
        message: editing
          ? "Los datos y accesos del usuario quedaron guardados."
          : "La cuenta quedó creada. Ya puede ingresar con su usuario y contraseña.",
        key: old.key + 1,
      }));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const fieldError = (key: string) =>
    fields[key] ? (
      <p className="mt-2 text-xs text-red-700">{fields[key]}</p>
    ) : null;
  return (
    <div className="page-container space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="page-eyebrow">Configuración</p>
          <h1 className="page-title">Usuarios</h1>
          <p className="page-description">
            Tu equipo, sus sucursales y lo que puede hacer en Kybo.
          </p>
        </div>
        <Button onClick={() => edit(null)}>
          <Plus size={18} />
          Nuevo usuario
        </Button>
      </div>
      <OperationAlert
        title="No pudimos completar la operación"
        message={error}
        eventKey={errorAttempt}
        tone="error"
      />
      <OperationAlert
        title="Usuarios"
        message={notice.message}
        eventKey={notice.key}
      />
      <section className="surface-panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-5">
          <div className="relative min-w-52 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
              size={17}
            />
            <Input
              aria-label="Buscar usuarios"
              className="pl-10"
              placeholder="Buscar por nombre, usuario o correo…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            aria-label="Estado de los usuarios"
            className="form-control w-auto"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">Todos los usuarios</option>
            <option value="active">Activos</option>
            <option value="inactive">Desactivados</option>
          </select>
          <Button variant="outline" disabled={refreshing} onClick={refresh}>
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            Actualizar
          </Button>
        </div>
        <div className="flex items-center gap-2 px-5 py-4 text-sm text-muted">
          <Users size={16} />
          {visible.length} {visible.length === 1 ? "usuario" : "usuarios"}
        </div>
        <div className="divide-y divide-line">
          {visible.map((row) => (
            <article
              key={row.id}
              className="grid gap-4 px-5 py-5 md:grid-cols-[minmax(180px,1.15fr)_minmax(140px,.8fr)_minmax(200px,1.3fr)_auto] md:items-center"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate font-semibold">{row.name}</h2>
                  {row.id === snapshot.currentUserId && (
                    <span className="text-xs text-muted">Vos</span>
                  )}
                </div>
                <p className="mt-1 break-all text-sm text-muted">
                  {row.username
                    ? `@${row.username}`
                    : (row.email ?? "Sin usuario")}
                </p>
                {row.email && row.username && (
                  <p className="mt-1 break-all text-xs text-muted">
                    {row.email}
                  </p>
                )}
              </div>
              <div>
                <p className="text-sm font-medium">{userRoles[row.role]}</p>
                <span
                  className={`mt-1 inline-flex items-center gap-1.5 text-xs ${row.disabled ? "text-slate-500" : "text-emerald-700"}`}
                >
                  <span
                    className={`size-1.5 rounded-full ${row.disabled ? "bg-slate-400" : "bg-emerald-500"}`}
                  />
                  {row.disabled ? "Desactivado" : "Activo"}
                </span>
              </div>
              <div className="space-y-1.5 text-sm text-muted">
                {row.role === "admin" ? (
                  <p className="flex items-center gap-2">
                    <ShieldCheck size={15} />
                    Todas las sucursales y permisos
                  </p>
                ) : (
                  <>
                    {row.memberships.length ? (
                      row.memberships.map((membership) => (
                        <p
                          key={membership.branchId}
                          className="flex items-start gap-2"
                        >
                          <Store size={15} className="mt-0.5 shrink-0" />
                          <span>
                            {snapshot.branches.find(
                              (b) => b.id === membership.branchId,
                            )?.name ?? "Sucursal"}
                            <span className="ml-1 text-xs">
                              · {userRoles[membership.role]}
                            </span>
                          </span>
                        </p>
                      ))
                    ) : (
                      <p className="text-amber-700">Sin sucursal asignada</p>
                    )}
                    {row.catalogManager && (
                      <p className="text-xs text-blue">
                        También gestiona catálogo compartido
                      </p>
                    )}
                  </>
                )}
              </div>
              <Button
                variant="outline"
                aria-label={`Editar a ${row.name}`}
                onClick={() => edit(row)}
              >
                <Pencil size={15} />
                Editar
              </Button>
            </article>
          ))}
          {!visible.length && (
            <p className="px-5 py-12 text-center text-sm text-muted">
              No hay usuarios que coincidan con la búsqueda.
            </p>
          )}
        </div>
      </section>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) {
            setOpen(next);
            if (!next) setDraft(empty());
          }
        }}
      >
        <DialogContent
          className="flex w-[calc(100%-2rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
          onInteractOutside={(event) => {
            if (busy) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <div className="shrink-0 border-b border-line px-6 py-6 sm:px-8">
            <DialogTitle className="text-2xl font-bold">
              {editing ? "Editar usuario" : "Nuevo usuario"}
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-relaxed text-muted">
              {editing
                ? "Actualizá sus datos y accesos. Las operaciones que ya realizó conservan su autor."
                : "Creá la cuenta y dejá listos sus accesos en el mismo lugar."}
            </DialogDescription>
          </div>
          <form
            ref={form}
            onSubmit={save}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-7 sm:px-8 [scrollbar-gutter:stable]">
              <fieldset disabled={busy} className="min-w-0 space-y-7">
                <section aria-labelledby="user-profile-title">
                  <h3 id="user-profile-title" className="mb-5 font-semibold">
                    Datos de la cuenta
                  </h3>
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label htmlFor="team-name" required>
                        Nombre
                      </Label>
                      <Input
                        id="team-name"
                        data-user-field="name"
                        className="mt-2"
                        required
                        maxLength={120}
                        autoComplete="name"
                        value={draft.name}
                        onChange={(e) => update({ name: e.target.value })}
                        aria-invalid={!!fields.name}
                      />
                      {fieldError("name")}
                    </div>
                    <div>
                      <Label
                        htmlFor="team-username"
                        required={!editing || !draft.email}
                        optional={!!editing && !!draft.email}
                      >
                        Usuario
                      </Label>
                      <Input
                        id="team-username"
                        data-user-field="username"
                        className="mt-2"
                        required={!editing || !draft.email}
                        minLength={3}
                        maxLength={30}
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={draft.username}
                        onChange={(e) => update({ username: e.target.value })}
                        aria-invalid={!!fields.username}
                      />
                      <p className="mt-2 text-xs leading-relaxed text-muted">
                        Para ingresar. Usá letras, números, punto o guion bajo.
                      </p>
                      {fieldError("username")}
                    </div>
                    <div>
                      <Label
                        htmlFor="team-email"
                        required={!!editing && !draft.username}
                        optional={!editing || !!draft.username}
                      >
                        Correo
                      </Label>
                      <Input
                        id="team-email"
                        data-user-field="email"
                        className="mt-2"
                        type="email"
                        required={!!editing && !draft.username}
                        autoComplete="off"
                        value={draft.email}
                        onChange={(e) => update({ email: e.target.value })}
                        aria-invalid={!!fields.email}
                      />
                      {fieldError("email")}
                    </div>
                    <div className="sm:col-span-2">
                      <Label
                        htmlFor="team-password"
                        required={!editing}
                        optional={!!editing}
                      >
                        {editing ? "Nueva contraseña" : "Contraseña inicial"}
                      </Label>
                      <div className="relative mt-2">
                        <Input
                          id="team-password"
                          data-user-field="password"
                          className="pr-12"
                          type={showPassword ? "text" : "password"}
                          required={!editing}
                          minLength={8}
                          maxLength={128}
                          autoComplete="new-password"
                          value={draft.password}
                          onChange={(e) => update({ password: e.target.value })}
                          aria-invalid={!!fields.password}
                        />
                        <button
                          type="button"
                          aria-label={
                            showPassword
                              ? "Ocultar contraseña"
                              : "Mostrar contraseña"
                          }
                          onClick={() => setShowPassword((value) => !value)}
                          className="absolute top-0 right-0 flex h-full w-12 items-center justify-center text-muted"
                        >
                          {showPassword ? (
                            <EyeOff size={17} />
                          ) : (
                            <Eye size={17} />
                          )}
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-muted">
                        {editing
                          ? "Dejá vacío para conservar la actual. Si la cambiás, se cierran sus sesiones."
                          : "Al menos 8 caracteres. Compartila con la persona para su primer ingreso."}
                      </p>
                      {fieldError("password")}
                      {ownAccount && (
                        <p className="mt-3 text-xs leading-relaxed text-muted">
                          Si cambiás tu usuario, correo o contraseña, vas a
                          tener que ingresar nuevamente.
                        </p>
                      )}
                    </div>
                  </div>
                </section>
                <section
                  className="border-t border-line pt-6"
                  aria-labelledby="user-permissions-title"
                >
                  <h3
                    id="user-permissions-title"
                    className="mb-5 font-semibold"
                  >
                    Rol y accesos
                  </h3>
                  <Label htmlFor="team-role" required={!ownAccount}>
                    Rol de la cuenta
                  </Label>
                  <select
                    id="team-role"
                    required={!ownAccount}
                    className="form-control mt-2"
                    disabled={ownAccount}
                    value={draft.role}
                    onChange={(e) => {
                      const role = e.target.value as UserRole;
                      update({
                        role,
                        memberships:
                          role === "admin"
                            ? []
                            : draft.memberships.map((m) => ({ ...m, role })),
                      });
                    }}
                  >
                    {Object.entries(userRoles).map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    {draft.role === "admin"
                      ? "Administra todo Kybo, incluido el equipo y todas las sucursales."
                      : draft.role === "manager"
                        ? "Gestiona la operación, inventario, producción y Finanzas de las sucursales asignadas."
                        : "Toma pedidos, consulta comandas y trabaja en sus tareas de producción. No administra Finanzas ni configuración."}
                  </p>
                  {draft.role !== "admin" && (
                    <>
                      <fieldset className="mt-6">
                        <legend className="mb-3 text-sm font-semibold">
                          <FieldCaption
                            required={!editing || !draft.disabled}
                            optional={!!editing && draft.disabled}
                          >
                            Sucursales habilitadas
                          </FieldCaption>
                        </legend>
                        <div
                          className="space-y-3"
                          data-user-field="memberships"
                          tabIndex={-1}
                        >
                          {snapshot.branches.map((branch) => {
                            const membership = draft.memberships.find(
                              (m) => m.branchId === branch.id,
                            );
                            return (
                              <div
                                key={branch.id}
                                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${membership ? "border-blue-200 bg-blue-50/30" : "border-line"}`}
                              >
                                <label className="flex min-h-6 min-w-0 flex-1 items-center gap-3 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={!!membership}
                                    onChange={(e) =>
                                      update({
                                        memberships: e.target.checked
                                          ? [
                                              ...draft.memberships,
                                              {
                                                branchId: branch.id,
                                                role: draft.role as
                                                  "manager" | "staff",
                                              },
                                            ]
                                          : draft.memberships.filter(
                                              (m) => m.branchId !== branch.id,
                                            ),
                                      })
                                    }
                                  />
                                  {branch.name}
                                </label>
                                {membership && (
                                  <label className="grid gap-2 text-xs font-medium">
                                    <FieldCaption required>
                                      Rol en la sucursal
                                    </FieldCaption>
                                    <select
                                      aria-label={`Rol en ${branch.name}`}
                                      required
                                      className="form-control w-auto"
                                      value={membership.role}
                                      onChange={(e) =>
                                        update({
                                          memberships: draft.memberships.map(
                                            (m) =>
                                              m.branchId === branch.id
                                                ? {
                                                    ...m,
                                                    role: e.target.value as
                                                      "manager" | "staff",
                                                  }
                                                : m,
                                          ),
                                        })
                                      }
                                    >
                                      <option value="staff">Personal</option>
                                      <option value="manager">Encargado</option>
                                    </select>
                                  </label>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {!snapshot.branches.length && (
                          <p className="text-sm text-muted">
                            Primero{" "}
                            <Link
                              className="text-blue underline"
                              href="/settings/branches"
                            >
                              agregá una sucursal
                            </Link>{" "}
                            para asignarle un lugar de trabajo.
                          </p>
                        )}
                        {fieldError("memberships")}
                        {(!editing || !draft.disabled) && (
                          <p className="mt-3 text-xs text-muted">
                            Seleccioná al menos una sucursal.
                          </p>
                        )}
                        <p className="mt-3 text-xs leading-relaxed text-muted">
                          Personal ingresa automáticamente a su sucursal
                          asignada. Si tiene varias, se utiliza la primera
                          habilitada de esta lista.
                        </p>
                      </fieldset>
                      <label className="mt-6 flex items-start gap-3 rounded-xl border border-line p-4">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={draft.catalogManager}
                          onChange={(e) =>
                            update({ catalogManager: e.target.checked })
                          }
                        />
                        <span>
                          <span className="block text-sm font-semibold">
                            Gestionar catálogo compartido
                          </span>
                          <span className="mt-1 block text-xs leading-relaxed text-muted">
                            Puede crear y modificar productos, ingredientes,
                            recetas y precios. Este permiso se aplica a todas
                            las sucursales.
                          </span>
                        </span>
                      </label>
                    </>
                  )}
                </section>
                <section className="border-t border-line pt-6">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      disabled={ownAccount}
                      checked={!draft.disabled}
                      onChange={(e) => update({ disabled: !e.target.checked })}
                    />
                    <span>
                      <span className="block text-sm font-semibold">
                        Cuenta activa
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted">
                        {ownAccount
                          ? "Tu cuenta de administrador permanece activa."
                          : "Al desactivarla se cierra su acceso. El historial de sus operaciones se conserva."}
                      </span>
                    </span>
                  </label>
                </section>
              </fieldset>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-line bg-white px-6 py-5 sm:px-8">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setDraft(empty());
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy
                  ? "Guardando…"
                  : editing
                    ? "Guardar cambios"
                    : "Crear usuario"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
