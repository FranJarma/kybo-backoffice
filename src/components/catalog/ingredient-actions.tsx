"use client";

import { useRef, useState } from "react";
import { DropdownMenu } from "radix-ui";
import { Archive, ArchiveRestore, Copy, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

export function IngredientActions({
  name,
  archived,
  pending,
  onDuplicate,
  onArchive,
  onFocusFallback,
}: {
  name: string;
  archived: boolean;
  pending: boolean;
  onDuplicate: (opener: HTMLButtonElement | null) => void;
  onArchive: () => void;
  onFocusFallback: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const openingForm = useRef(false);
  const ArchiveIcon = archived ? ArchiveRestore : Archive;
  return (
    <DropdownMenu.Root
      open={open}
      onOpenChange={(next) => {
        if (next && pending) return;
        if (next) openingForm.current = false;
        setOpen(next);
      }}
    >
      <DropdownMenu.Trigger asChild>
        <Button
          ref={trigger}
          type="button"
          variant="ghost"
          size="icon"
          aria-disabled={pending || undefined}
          aria-busy={pending || undefined}
          className="aria-disabled:opacity-50"
          aria-label={`Más acciones de ${name}`}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          collisionPadding={8}
          className="z-[60] min-w-48 rounded-xl border border-line bg-white p-1.5 text-sm text-brand shadow-lg"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (openingForm.current) return;
            if (trigger.current?.isConnected)
              trigger.current.focus({ preventScroll: true });
            else onFocusFallback();
          }}
        >
          {!archived && (
            <DropdownMenu.Item
              disabled={pending}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 outline-none data-highlighted:bg-secondary data-highlighted:text-blue"
              onSelect={() => {
                openingForm.current = true;
                onDuplicate(trigger.current);
              }}
            >
              <Copy size={16} aria-hidden="true" /> Duplicar
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item
            disabled={pending}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 outline-none data-highlighted:bg-secondary data-highlighted:text-blue"
            onSelect={onArchive}
          >
            <ArchiveIcon size={16} aria-hidden="true" />
            {archived ? "Restaurar" : "Archivar"}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
