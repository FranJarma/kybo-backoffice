"use client";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkplaceManager } from "./manager";
/** Mounted over the POS: its sale draft and operational login stay intact. */
export function WorkplaceActions({ branchId }: { branchId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <ShieldCheck size={16} />
        Gestionar turno
      </Button>
      <WorkplaceDialog
        branchId={branchId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
export function WorkplaceDialog({
  branchId,
  open,
  onClose,
}: {
  branchId: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-4xl"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogTitle className="sr-only">
          Gestión protegida del turno
        </DialogTitle>
        <DialogDescription className="sr-only">
          Autorizá con una cuenta personal, organizá los puestos y volvé al
          pedido.
        </DialogDescription>
        {open && <WorkplaceManager branchId={branchId} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
