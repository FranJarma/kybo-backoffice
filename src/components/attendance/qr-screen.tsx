"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Clock3, ScanLine, Store, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { privateRequest } from "@/components/identity/client";
import "./qr.css";
import { qrClientDeadline, qrSecondsRemaining } from "./qr-clock";

type QrData = { qrDataUrl: string; now: string; expiresAt: string };
export function AttendanceQrScreen({
  branchId,
  branchName,
}: {
  branchId: string;
  branchName: string;
}) {
  const [data, setData] = useState<QrData | null>(null),
    [remaining, setRemaining] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    let pending = false,
      deadline = 0,
      lastAttempt = 0;
    async function refresh() {
      if (
        pending ||
        abort.signal.aborted ||
        document.visibilityState === "hidden"
      )
        return;
      pending = true;
      lastAttempt = performance.now();
      try {
        const response = await privateRequest<QrData>(
          "/api/attendance/qr",
          branchId,
          undefined,
          abort.signal,
        );
        if (abort.signal.aborted) return;
        deadline =
          qrClientDeadline(response.now, response.expiresAt, lastAttempt) - 750;
        const seconds = qrSecondsRemaining(deadline, performance.now());
        setRemaining(seconds);
        setData(seconds ? response : null);
        setError("");
      } catch (e) {
        if (!abort.signal.aborted) {
          setData(null);
          setError((e as Error).message);
        }
      } finally {
        pending = false;
      }
    }
    const offline = () => {
      deadline = 0;
      setData(null);
      setRemaining(0);
      setError(
        "No hay conexión. El QR volverá a mostrarse cuando podamos renovarlo.",
      );
    };
    const tick = () => {
      const seconds = qrSecondsRemaining(deadline, performance.now());
      setRemaining(seconds);
      if (!seconds) {
        setData(null);
        if (navigator.onLine && performance.now() - lastAttempt > 2000)
          void refresh();
      }
    };
    const resume = () => {
      tick();
      if (navigator.onLine) void refresh();
    };
    void refresh();
    const interval = setInterval(tick, 500);
    window.addEventListener("offline", offline);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      abort.abort();
      clearInterval(interval);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [branchId]);
  return (
    <div className="attendance-qr-page">
      <header>
        <div className="attendance-qr-brand">
          <Image
            src="/assets/kybo-logo.png"
            alt="Kybo"
            width={132}
            height={70}
          />
          <span>ASISTENCIA DEL EQUIPO</span>
        </div>
        <Button variant="outline" asChild>
          <Link href="/sales">
            <ArrowLeft />
            Volver al puesto
          </Link>
        </Button>
      </header>
      <main>
        <section className="attendance-qr-copy">
          <span className="attendance-qr-branch">
            <Store size={18} />
            {branchName}
          </span>
          <p className="attendance-qr-eyebrow">TU JORNADA EN KYBO</p>
          <h1>
            Escaneá.
            <br />
            Verificá.
            <br />
            <span>Ya podés fichar.</span>
          </h1>
          <p>Usá la cámara de tu celular y continuá con tu cuenta personal.</p>
          <ol>
            {[
              ["Abrí tu asistencia", "Si falta sesión, ingresá con tus datos."],
              [
                "Elegí entrada, pausa o salida",
                "Solo aparecen las acciones disponibles.",
              ],
              [
                "Confirmá desde tu celular",
                "Verificamos cercanía y el desbloqueo del teléfono.",
              ],
            ].map(([title, description], i) => (
              <li key={title}>
                <b>{i + 1}</b>
                <div>
                  <strong>{title}</strong>
                  <span>{description}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section
          className="attendance-qr-panel"
          aria-label="QR vigente del local"
        >
          <div className="attendance-qr-status">
            <i className={data && remaining ? "available" : ""} />
            <strong>
              {data && remaining ? "Código disponible" : "Esperando conexión"}
            </strong>
            <span>Se actualiza solo</span>
          </div>
          <div className="attendance-qr-image">
            {data && remaining ? (
              <Image
                unoptimized
                src={data.qrDataUrl}
                alt="Escaneá este QR para abrir tu fichaje personal"
                width={560}
                height={560}
                priority
              />
            ) : (
              <div className="attendance-qr-unavailable">
                <WifiOff size={42} />
                <h2>{error ? "QR no disponible" : "Preparando el código…"}</h2>
                <p role={error ? "alert" : undefined}>
                  {error ||
                    "Se mostrará cuando el servidor confirme su vigencia."}
                </p>
              </div>
            )}
          </div>
          <div className="attendance-qr-timer">
            <span>
              <Clock3 size={18} />
              Se renueva en
            </span>
            <strong>{data && remaining ? `${remaining} s` : "—"}</strong>
            <progress
              value={data ? remaining : 0}
              max={60}
              aria-label="Tiempo restante del QR"
            />
          </div>
          <p className="attendance-qr-help">
            <ScanLine size={19} />
            Cada persona ficha con su propia cuenta. El QR no cambia la sesión
            del puesto.
          </p>
        </section>
      </main>
    </div>
  );
}
