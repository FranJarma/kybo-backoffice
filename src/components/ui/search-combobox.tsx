"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Plus, X } from "lucide-react";
import { Input } from "./input";
import { cn } from "@/lib/utils";
import { filterComboboxOptions } from "./combobox-options";

type Option = { id: string; name: string; description?: string | null };

export function SearchCombobox({
  id,
  label,
  value,
  selectedLabel,
  options,
  required,
  disabled,
  loading,
  onChange,
  onSearch,
  onCreate,
  onTextChange,
  commitOnBlur = false,
  placeholder,
  inputClassName,
  maxLength,
  createLabel = "Crear opción",
  selectExactOnBlur = true,
  filterMode = "local",
}: {
  id: string;
  label: string;
  value: string;
  selectedLabel: string;
  options: Option[];
  required?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onChange: (value: string) => void;
  onSearch: (query: string) => void;
  onCreate?: (name: string) => void;
  onTextChange?: (text: string) => void;
  commitOnBlur?: boolean;
  placeholder?: string;
  inputClassName?: string;
  maxLength?: number;
  createLabel?: string;
  selectExactOnBlur?: boolean;
  filterMode?: "local" | "remote";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.setCustomValidity(
      required && !value ? "Seleccioná una opción de la lista." : "",
    );
  }, [required, value]);
  const rows = filterComboboxOptions(options, query, filterMode);
  const normalized = query.trim().replace(/\s+/g, " ");
  const exact = rows.filter(
    (option) =>
      option.name.trim().toLocaleLowerCase() ===
        normalized.toLocaleLowerCase() ||
      option.description?.trim().toLocaleLowerCase() ===
        normalized.toLocaleLowerCase(),
  );
  const canCreate = !!onCreate && !!normalized && !exact.length;
  const optionCount = rows.length + (canCreate ? 1 : 0);
  const listId = `${id}-options`;
  const activeId = open
    ? rows[active]
      ? `${listId}-${rows[active].id}`
      : canCreate && active === rows.length
        ? `${listId}-create`
        : undefined
    : undefined;
  useEffect(() => {
    if (activeId)
      document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);
  function search(text: string) {
    setQuery(text);
    setActive(-1);
    onSearch(text);
  }
  function choose(option: Option) {
    if (inputRef.current?.matches(":disabled")) return;
    onChange(option.id);
    setOpen(false);
    search("");
  }
  function commit(selectExact = true) {
    if (!normalized || disabled) return;
    if (selectExact && exact.length === 1) choose(exact[0]);
    else if (onCreate && (!selectExact || exact.length === 0)) {
      onCreate(normalized);
      setOpen(false);
      search("");
    }
  }
  return (
    <div
      className="relative min-w-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          if (commitOnBlur) commit(selectExactOnBlur);
          setOpen(false);
          search("");
        }
      }}
    >
      <Input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-required={required || undefined}
        aria-expanded={open && !disabled}
        aria-busy={loading || undefined}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={activeId}
        required={required && !value}
        disabled={disabled}
        autoComplete="off"
        maxLength={maxLength}
        placeholder={
          value && open
            ? selectedLabel
            : (placeholder ?? "Escribí para buscar y seleccionar…")
        }
        value={open ? query : selectedLabel}
        className={cn("pr-16", inputClassName)}
        onFocus={() => {
          setOpen(true);
          search(onTextChange ? selectedLabel : "");
        }}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          setOpen(true);
          search(event.target.value);
          onTextChange?.(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive((current) =>
              event.key === "ArrowDown"
                ? Math.min(current + 1, optionCount - 1)
                : Math.max(current - 1, 0),
            );
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            if (rows[active]) choose(rows[active]);
            else commit();
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            search("");
          }
        }}
      />
      <div
        className="pointer-events-none flex items-center gap-2"
        style={{ position: "absolute", right: 12, top: 0, height: "100%" }}
      >
        {value && !disabled && (
          <button
            type="button"
            aria-label={`Quitar ${label.toLowerCase()}`}
            className="pointer-events-auto rounded p-1 text-muted hover:text-brand focus-visible:outline-2"
            onClick={() => {
              onChange("");
              search("");
              setOpen(false);
            }}
          >
            <X size={16} />
          </button>
        )}
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="pointer-events-none text-muted"
        />
      </div>
      {open && !disabled && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border border-line bg-white p-1.5 shadow-lg">
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className="max-h-60 overflow-y-auto"
          >
            {rows.map((option, index) => (
              <li
                key={option.id}
                id={`${listId}-${option.id}`}
                role="option"
                aria-selected={option.id === value}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-3 text-sm ${index === active ? "bg-blue-50 text-brand" : "hover:bg-surface"}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                <span className="min-w-0">
                  <span className="block truncate">{option.name}</span>
                  {option.description && (
                    <span className="block truncate text-xs text-muted">
                      {option.description}
                    </span>
                  )}
                </span>
                {option.id === value && <Check size={16} aria-hidden="true" />}
              </li>
            ))}
            {canCreate && (
              <li
                id={`${listId}-create`}
                role="option"
                aria-selected={false}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-3 text-sm ${active === rows.length ? "bg-orange-50" : "hover:bg-surface"}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onCreate?.(normalized);
                  setOpen(false);
                  search("");
                }}
              >
                <Plus
                  className="size-4 shrink-0 text-orange-600"
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate">
                  {createLabel} «{normalized}»
                </span>
              </li>
            )}
          </ul>
          {loading && (
            <p role="status" className="px-3 py-2 text-sm text-muted">
              Buscando opciones…
            </p>
          )}
          {!rows.length && !loading && !canCreate && (
            <p role="status" className="px-3 py-4 text-sm text-muted">
              No hay coincidencias. Probá con otro nombre.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
