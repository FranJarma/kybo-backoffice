"use client";
import { useEffect, useId, useState } from "react";
import { getJson } from "@/components/inventory/shared";
export function LocationSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [locations, setLocations] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    getJson<{ locations: typeof locations }>("/api/branches/current")
      .then((data) => {
        if (live) setLocations(data.locations);
      })
      .catch(() => {
        if (live)
          setError("Seleccioná una sucursal para cargar sus ubicaciones.");
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-semibold">
        Ubicación
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required
        className="w-full rounded-lg border bg-white px-3 py-2"
      >
        <option value="">Elegí una ubicación</option>
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
