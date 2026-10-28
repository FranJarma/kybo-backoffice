"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Clock3, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchCombobox } from "@/components/ui/search-combobox";
import { OperationAlert } from "@/components/ui/operation-alert";
import type {
  CashSettingsCommand,
  CashSettingsSnapshot,
} from "@/modules/cash/types";
import { editableMoney, parseMoney } from "./draft";
import {
  CashNotice,
  CashRequestError,
  MoneyField,
  cashBranchRequest,
} from "./shared";
import "./cash.css";

export function CashSettingsManager({ branchId }: { branchId: string }) {
  const [snapshot, setSnapshot] = useState<CashSettingsSnapshot>();
  const [closeTime, setCloseTime] = useState("23:00"),
    [targetFund, setTargetFund] = useState("");
  const [userId, setUserId] = useState(""),
    [grants, setGrants] = useState({
      canOpen: false,
      canClose: false,
      canExpense: false,
    });
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [generation, setGeneration] = useState(0);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState({ message: "", key: 0 });
  const retry = useRef<{ body: string; id: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void cashBranchRequest<CashSettingsSnapshot>(
      branchId,
      "/api/settings/cash",
      {
        signal: controller.signal,
      },
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setError("");
          setSnapshot(result);
          setCloseTime(result.settings.closeTime);
          setTargetFund(editableMoney(result.settings.targetFund));
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError((error as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [generation, branchId]);
  const selected = snapshot?.employees.find(
    (employee) => employee.id === userId,
  );
  async function run(command: CashSettingsCommand) {
    setBusy(true);
    setError("");
    const body = JSON.stringify(command);
    if (retry.current?.body !== body)
      retry.current = { body, id: crypto.randomUUID() };
    try {
      const result = await cashBranchRequest<CashSettingsSnapshot>(
        branchId,
        "/api/settings/cash",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: retry.current.id, command }),
        },
      );
      setSnapshot(result);
      retry.current = null;
      if (command.action === "configure") {
        setCloseTime(result.settings.closeTime);
        setTargetFund(editableMoney(result.settings.targetFund));
      }
      setNotice((previous) => ({
        message:
          command.action === "configure"
            ? "Configuración guardada. Se usará en las próximas aperturas."
            : "Los permisos de caja quedaron actualizados.",
        key: previous.key + 1,
      }));
    } catch (error) {
      if (error instanceof CashRequestError && error.status === 409) {
        setError(
          "Otra persona cambió la configuración. Conservamos tus valores; revisalos antes de volver a guardar.",
        );
        try {
          setSnapshot(
            await cashBranchRequest<CashSettingsSnapshot>(
              branchId,
              "/api/settings/cash",
            ),
          );
        } catch {
          /* Preserve the complete form on refresh failure. */
        }
      } else setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function configure(event: FormEvent) {
    event.preventDefault();
    if (!snapshot) return;
    try {
      void run({
        action: "configure",
        closeTime,
        targetFund: targetFund.trim() ? parseMoney(targetFund) : null,
        revision: snapshot.settings.revision,
      });
    } catch (error) {
      setError((error as Error).message);
    }
  }
  function choose(id: string) {
    setUserId(id);
    const person = snapshot?.employees.find((employee) => employee.id === id);
    setGrants({
      canOpen: person?.canOpen ?? false,
      canClose: person?.canClose ?? false,
      canExpense: person?.canExpense ?? false,
    });
  }
  return (
    <div className="kybo-cash cash-page">
      <OperationAlert
        message={notice.message}
        eventKey={notice.key}
        title="Configuración de caja"
      />
      <header className="cash-page-heading">
        <div>
          <p className="cash-eyebrow">
            CONFIGURACIÓN · {snapshot?.branchName ?? "CAJA"}
          </p>
          <h1>Configuración de caja</h1>
          <p>Parámetros y autorizaciones de la sucursal activa.</p>
        </div>
        <ShieldCheck aria-hidden="true" size={28} />
      </header>
      {error ? <CashNotice error>{error}</CashNotice> : null}
      {loading ? (
        <p role="status">Consultando la configuración…</p>
      ) : !snapshot ? (
        <Button
          variant="outline"
          onClick={() => {
            setLoading(true);
            setGeneration((value) => value + 1);
          }}
        >
          Volver a intentar
        </Button>
      ) : !snapshot.available ? (
        <CashNotice>
          La configuración estará disponible al completar la actualización de
          Caja.
        </CashNotice>
      ) : (
        <div className="cash-settings-grid">
          <section className="cash-card">
            <div className="cash-section-heading">
              <div>
                <h2>Jornada y fondo de cambio</h2>
                <p>Estos valores se fijan al abrir cada caja.</p>
              </div>
              <Clock3 size={23} />
            </div>
            <form className="cash-stack" onSubmit={configure}>
              <label className="cash-field">
                <span>Horario previsto de cierre</span>
                <Input
                  type="time"
                  value={closeTime}
                  required
                  disabled={busy}
                  onChange={(event) => setCloseTime(event.target.value)}
                />
                <small>
                  Hora de la sucursal. No cierra la caja automáticamente.
                </small>
              </label>
              <MoneyField
                label="Fondo de cambio objetivo"
                value={targetFund}
                disabled={busy}
                onChange={setTargetFund}
                hint="Dejá el campo vacío si todavía no hay un objetivo. Es una referencia para el cierre."
              />
              <div className="cash-form-footer">
                <Button className="cash-primary" type="submit" disabled={busy}>
                  {busy ? "Guardando…" : "Guardar configuración"}
                </Button>
              </div>
            </form>
          </section>
          <section className="cash-card">
            <div className="cash-section-heading">
              <div>
                <h2>Personal autorizado</h2>
                <p>Permisos independientes para operar la caja.</p>
              </div>
              <ShieldCheck size={23} />
            </div>
            <div className="cash-stack">
              <div className="cash-field">
                <label htmlFor="cash-employee">Empleado de la sucursal</label>
                <SearchCombobox
                  id="cash-employee"
                  label="Empleado de la sucursal"
                  value={userId}
                  selectedLabel={selected?.name ?? ""}
                  options={snapshot.employees.map((employee) => ({
                    id: employee.id,
                    name: employee.name,
                    description:
                      employee.role === "staff"
                        ? "Personal"
                        : employee.role === "manager"
                          ? "Encargado"
                          : "Administrador",
                  }))}
                  disabled={busy}
                  onChange={choose}
                  onSearch={() => {}}
                />
              </div>
              {selected ? (
                selected.role === "staff" ? (
                  <form
                    className="cash-stack"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run({ action: "permission", userId, ...grants });
                    }}
                  >
                    <div className="cash-grants">
                      {(
                        [
                          {
                            key: "canOpen",
                            label: "Abrir caja",
                            detail: "Contar y confirmar el fondo inicial.",
                          },
                          {
                            key: "canClose",
                            label: "Cerrar caja",
                            detail:
                              "Confirmar efectivo, lotes y diferencias con motivo.",
                          },
                          {
                            key: "canExpense",
                            label: "Registrar gastos del día",
                            detail:
                              "Registrar un gasto una sola vez desde Caja.",
                          },
                        ] as const
                      ).map(({ key, label, detail }) => (
                        <label key={key} className="cash-grant">
                          <input
                            type="checkbox"
                            checked={grants[key]}
                            disabled={busy}
                            onChange={(event) =>
                              setGrants((previous) => ({
                                ...previous,
                                [key]: event.target.checked,
                              }))
                            }
                          />
                          <span>
                            <b>{label}</b>
                            <small>{detail}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="cash-muted">
                      Los retiros, pagos a proveedores y revisiones siguen
                      reservados a encargados y administradores.
                    </p>
                    <div className="cash-form-footer">
                      <Button
                        className="cash-primary"
                        disabled={busy}
                        type="submit"
                      >
                        {busy ? "Guardando…" : "Guardar permisos"}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <CashNotice>
                    Encargados y administradores operan la caja de las
                    sucursales a las que tienen acceso. Estos permisos no
                    cambian su rol.
                  </CashNotice>
                )
              ) : (
                <p className="cash-muted">
                  Seleccioná una persona para ver y cambiar sus permisos de
                  caja.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
