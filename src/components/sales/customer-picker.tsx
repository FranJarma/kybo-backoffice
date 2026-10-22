"use client";
import { useState } from "react";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { LookupSelect } from "./shared";

export function CustomerPicker({
  id,
  name,
  disabled,
  onChange,
}: {
  id: string;
  name: string;
  disabled: boolean;
  onChange: (id: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftId, setDraftId] = useState("");
  const [draftName, setDraftName] = useState("");
  return (
    <>
      <Button
        variant="outline"
        className="min-h-12 max-w-full"
        disabled={disabled}
        onClick={() => {
          setDraftId(id);
          setDraftName(name);
          setOpen(true);
        }}
      >
        <UserRound size={18} aria-hidden="true" />
        <span className="truncate">
          {name ? `Cliente: ${name}` : "Agregar cliente"}
        </span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cliente del pedido</DialogTitle>
            <DialogDescription>
              Elegí un cliente de tu listado o escribí un nombre para esta
              venta.
            </DialogDescription>
          </DialogHeader>
          <LookupSelect
            kind="customers"
            label="Cliente guardado"
            value={draftId}
            initialName={draftId ? draftName : undefined}
            disabled={disabled}
            empty="Seleccionar del listado"
            onChange={(nextId, nextName) => {
              setDraftId(nextId);
              setDraftName(nextName ?? "");
            }}
          />
          <div className="space-y-2 border-t border-line pt-4">
            <label
              htmlFor="pos-customer-name"
              className="block text-sm font-semibold"
            >
              O escribí un nombre
            </label>
            <Input
              id="pos-customer-name"
              className="min-h-12"
              maxLength={160}
              autoComplete="off"
              placeholder="Ej. Martina"
              value={draftId ? "" : draftName}
              disabled={disabled}
              onChange={(event) => {
                setDraftId("");
                setDraftName(event.target.value);
              }}
            />
            <p className="text-xs text-muted">
              Se guarda en la venta, sin agregar un cliente al listado.
            </p>
          </div>
          <Button
            className="min-h-12"
            disabled={disabled || !draftName.trim()}
            onClick={() => {
              onChange(draftId, draftName.trim());
              setOpen(false);
            }}
          >
            Usar cliente
          </Button>
          <Button
            variant="ghost"
            className="min-h-12"
            disabled={disabled}
            onClick={() => {
              onChange("", "");
              setOpen(false);
            }}
          >
            Continuar sin cliente
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
