"use client";
import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { SearchCombobox } from "@/components/ui/search-combobox";
import { Input } from "@/components/ui/input";
import { getJson } from "@/components/inventory/shared";
import type { SaleLookup } from "@/modules/sales/types";

export function CustomerPicker({
  id,
  name,
  email,
  issue,
  disabled,
  onChange,
}: {
  id: string;
  name: string;
  email: string;
  disabled: boolean;
  issue: string;
  onChange: (id: string, name: string, email: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<SaleLookup["rows"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const timer = setTimeout(
      () => {
        setLoading(true);
        getJson<SaleLookup>(
          `/api/sales/lookup?kind=customers&q=${encodeURIComponent(query)}`,
        )
          .then((result) => {
            if (live) {
              setRows(result.rows);
              setError("");
            }
          })
          .catch(() => {
            if (live)
              setError(
                "No pudimos buscar clientes. Podés escribir su nombre; lo verificaremos al guardar.",
              );
          })
          .finally(() => {
            if (live) setLoading(false);
          });
      },
      query ? 150 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);
  return (
    <div className="min-w-0">
      <label
        htmlFor="pos-customer"
        className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-brand"
      >
        <UserRound className="size-3.5" aria-hidden="true" /> Cliente{" "}
        <span className="font-normal text-muted">· Opcional</span>
      </label>
      <SearchCombobox
        createLabel="Nuevo cliente:"
        id="pos-customer"
        label="Cliente"
        value={id || (name ? "__new__" : "")}
        selectedLabel={name}
        options={rows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.email,
        }))}
        loading={loading}
        disabled={disabled}
        placeholder="Buscar cliente o escribir nombre…"
        maxLength={160}
        inputClassName={`min-h-12 bg-white text-sm ${name.trim() ? "border-orange-300 bg-orange-50/40" : "border-line"}`}
        commitOnBlur
        selectExactOnBlur={false}
        onSearch={setQuery}
        onTextChange={(text) =>
          onChange("", text, id || !text.trim() ? "" : email)
        }
        onCreate={(text) => onChange("", text, id ? "" : email)}
        onChange={(value) => {
          const selected = rows.find((row) => row.id === value);
          onChange(value, selected?.name ?? "", "");
        }}
      />
      {!id && name.trim() && (
        <div className="mt-2">
          <label
            htmlFor="pos-customer-email"
            className="mb-1 block text-xs text-muted"
          >
            Email del cliente (opcional)
          </label>
          <Input
            id="pos-customer-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={254}
            placeholder="nombre@ejemplo.com"
            className="min-h-11 bg-white text-sm"
            value={email}
            disabled={disabled}
            aria-invalid={!!issue}
            aria-describedby={issue ? "pos-customer-email-issue" : undefined}
            onChange={(event) => onChange("", name, event.target.value)}
          />
        </div>
      )}
      {issue && (
        <p
          id="pos-customer-email-issue"
          role="status"
          className="mt-1 text-xs text-red-600"
        >
          {issue}
        </p>
      )}
      {error && (
        <p role="status" className="mt-1 text-xs text-muted">
          {error}
        </p>
      )}
    </div>
  );
}
