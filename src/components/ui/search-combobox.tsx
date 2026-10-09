"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Check, X } from "lucide-react";
import { Input } from "./input";

type Option = { id: string; name: string };

export function SearchCombobox({
  id,
  label,
  value,
  selectedLabel,
  options,
  required,
  onChange,
  onSearch,
}: {
  id: string;
  label: string;
  value: string;
  selectedLabel: string;
  options: Option[];
  required?: boolean;
  onChange: (value: string) => void;
  onSearch: (query: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const rows = options.filter((option) =>
    option.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const listId = `${id}-options`;
  const activeId =
    open && rows[active] ? `${listId}-${rows[active].id}` : undefined;
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
    onChange(option.id);
    setOpen(false);
    search("");
  }
  return (
    <div
      className="relative min-w-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          search("");
        }
      }}
    >
      <Input
        id={id}
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={
          open && rows[active] ? `${listId}-${rows[active].id}` : undefined
        }
        required={required}
        autoComplete="off"
        placeholder={
          value && open ? selectedLabel : "Escribí para buscar y seleccionar…"
        }
        value={open ? query : selectedLabel}
        className="pr-16"
        onFocus={() => {
          setOpen(true);
          search("");
        }}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          setOpen(true);
          search(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive((current) =>
              event.key === "ArrowDown"
                ? Math.min(current + 1, rows.length - 1)
                : Math.max(current - 1, 0),
            );
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            if (rows[active]) choose(rows[active]);
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
        style={{ position: "absolute", right: 12, top: 0, height: 44 }}
      >
        {value && (
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
      {open && (
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
                <span>{option.name}</span>
                {option.id === value && <Check size={16} aria-hidden="true" />}
              </li>
            ))}
          </ul>
          {!rows.length && (
            <p role="status" className="px-3 py-4 text-sm text-muted">
              No hay coincidencias. Probá con otro nombre.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
