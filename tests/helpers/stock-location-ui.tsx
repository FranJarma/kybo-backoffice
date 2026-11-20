import { createRoot } from "react-dom/client";
import { useState } from "react";
import { StockByLocation } from "../../src/components/daily-operations/stock-by-location";
import type { StockRow } from "../../src/modules/daily-operations/types";
const base = {
  physical: "0.000000",
  reserved: "0.000000",
  unusable: "0.000000",
  available: "0.000000",
};
const rows = [
  {
    ...base,
    itemId: "milk",
    itemName: "Leche",
    unit: "ml",
    locationId: "bar",
    locationName: "Barra",
    physical: "1000.000000",
    available: "1000.000000",
    minimumQuantity: "2000.000000",
    targetQuantity: "5000.000000",
  },
  {
    ...base,
    itemId: "milk",
    itemName: "Leche",
    unit: "ml",
    locationId: "depot",
    locationName: "Depósito principal",
    physical: "21000.000000",
    reserved: "1000.000000",
    available: "20000.000000",
  },
  {
    ...base,
    itemId: "ham",
    itemName: "Jamón cocido",
    unit: "g",
    locationId: "kitchen",
    locationName: "Cocina",
    physical: "3000.000000",
    available: "3000.000000",
    minimumQuantity: "2000.000000",
    targetQuantity: "4000.000000",
  },
  {
    ...base,
    itemId: "cups",
    itemName: "Vasos descartables",
    unit: "unit",
    locationId: "bar",
    locationName: "Barra",
    physical: "50.000000",
    available: "50.000000",
  },
] as StockRow[];
function App() {
  const [location, setLocation] = useState("");
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4">
      <label>
        Ubicación
        <select
          aria-label="Ubicación"
          className="ml-3 min-h-12 rounded border bg-white px-3"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        >
          <option value="">Todas las ubicaciones</option>
          <option value="bar">Barra</option>
          <option value="kitchen">Cocina</option>
        </select>
      </label>
      <StockByLocation rows={rows} locationId={location} canManage={true} />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
