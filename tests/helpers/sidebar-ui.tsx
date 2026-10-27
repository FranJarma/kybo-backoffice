import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { AppShell } from "../../src/components/app-shell";

function Fixture() {
  const [layout, setLayout] = useState({
    key: 0,
    collapsed: document.documentElement.dataset.sidebarInitial === "true",
  });
  useEffect(() => {
    const changeLayout = (event: Event) => {
      const { path, collapsed } = (
        event as CustomEvent<{ path: string; collapsed: boolean }>
      ).detail;
      const url = new URL(location.href);
      url.searchParams.set("path", path);
      history.pushState(null, "", url);
      setLayout((previous) => ({ key: previous.key + 1, collapsed }));
    };
    window.addEventListener("fixture-sidebar-layout", changeLayout);
    return () =>
      window.removeEventListener("fixture-sidebar-layout", changeLayout);
  }, []);
  return (
    <AppShell
      key={layout.key}
      role="admin"
      name="Francisco"
      dateLabel="27 de octubre"
      branches={[
        { id: "test-branch", name: "Kalú Gamezone — Peatonal Alberdi" },
      ]}
      selectedBranchId="test-branch"
      initialSidebarCollapsed={layout.collapsed}
    >
      <section className="surface-panel space-y-5 p-6">
        <h1 className="text-2xl font-bold text-brand">Contenido de prueba</h1>
        <p className="text-muted">
          Datos simulados para verificar el espacio de trabajo.
        </p>
        <label className="block max-w-md space-y-2 font-semibold">
          Pedido en curso
          <input className="form-control" defaultValue="" />
        </label>
      </section>
    </AppShell>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
