import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Button } from "../../src/components/ui/button";
import { Input } from "../../src/components/ui/input";
import { Tabs } from "../../src/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../../src/components/ui/dialog";
import { CatalogManager } from "../../src/components/catalog-manager";
import { definitions } from "../../src/modules/catalog/definitions";

function Foundation() {
  const [open, setOpen] = useState(false);
  const [nested, setNested] = useState(false);
  return (
    <main className="space-y-6 p-6">
      <h1>Controles compartidos</h1>
      <Button variant="outline-primary">Abrir caja</Button>
      <Button variant="outline" className="min-h-12">
        Actualizar
      </Button>
      <Button size="sm">Acción auxiliar</Button>
      <Tabs.Root defaultValue="tasks">
        <Tabs.List aria-label="Vistas de prueba">
          <Tabs.Trigger value="tasks">Tareas</Tabs.Trigger>
          <Tabs.Trigger value="stock">Stock</Tabs.Trigger>
          <Tabs.Trigger value="history" disabled>
            Historial
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="tasks" forceMount>
          <Input aria-label="Borrador de tarea" />
        </Tabs.Content>
        <Tabs.Content value="stock">Stock disponible</Tabs.Content>
      </Tabs.Root>
      <div className="kybo-cash">
        <label className="cash-field">
          <span>Fondo inicial</span>
          <Input />
        </label>
      </div>
      <Button onClick={() => setOpen(true)}>Abrir ficha</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Ficha de prueba</DialogTitle>
          <DialogDescription>
            Comprobación aislada, sin conexión a la base.
          </DialogDescription>
          <Input aria-label="Nombre de prueba" />
          <Button onClick={() => setNested(true)}>Abrir detalle</Button>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Dialog open={nested} onOpenChange={setNested}>
            <DialogContent>
              <DialogTitle>Detalle de prueba</DialogTitle>
              <DialogDescription>Segundo diálogo.</DialogDescription>
              <Button onClick={() => setNested(false)}>Volver</Button>
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>
    </main>
  );
}

const view = new URLSearchParams(location.search).get("view");
createRoot(document.getElementById("root")!).render(
  view === "categories" ? (
    <CatalogManager entity="categories" definition={definitions.categories} />
  ) : view === "ingredients" ? (
    <CatalogManager
      entity="items"
      definition={definitions.items}
      ingredientsOnly
    />
  ) : view === "products" ? (
    <CatalogManager entity="products" definition={definitions.products} />
  ) : (
    <Foundation />
  ),
);
