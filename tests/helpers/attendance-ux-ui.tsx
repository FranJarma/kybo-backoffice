/* eslint-disable @next/next/no-html-link-for-pages -- The isolated shell tests layout without Next navigation. */
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AttendanceManager } from "../../src/components/attendance/manager";

const params = new URLSearchParams(location.search);
const planning = params.get("mode") === "planning";
const manager = (
  <AttendanceManager
    branchId="branch"
    actorId={planning ? "manager" : "staff"}
    mode={planning ? "planning" : "attendance"}
    personalView={!planning}
    qrCode={!planning && params.get("qr") !== "no" ? "fixture-qr" : undefined}
  />
);
const root = document.createElement("div");
document.body.append(root);
createRoot(root).render(
  <AppRouterContext.Provider
    value={{
      back() {},
      forward() {},
      refresh() {},
      push() {},
      replace() {},
      prefetch() {},
      bfcacheId: "fixture",
    }}
  >
    {planning ? (
      <main>{manager}</main>
    ) : (
      <div className="personal-frame">
        <header className="personal-frame-header">
          {/* The standalone fixture serves the existing logo without Next's image runtime. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/kybo-logo.png" alt="Kybo" width={90} height={48} />
          <div>
            <strong>Constanza Maldonado</strong>
            <span>Peatonal Alberdi</span>
          </div>
        </header>
        <main>{manager}</main>
        <nav className="personal-bottom-nav" aria-label="Mi trabajo en Kybo">
          <a href="/staff/attendance" aria-current="page">
            Mi jornada
          </a>
          <a href="/staff/work">Mis tareas</a>
          <a href="/staff/work?tab=production">Producción</a>
        </nav>
      </div>
    )}
  </AppRouterContext.Provider>,
);
