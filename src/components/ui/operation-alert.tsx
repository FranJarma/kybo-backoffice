"use client";
import { useState } from "react";
import { Portal, Toast } from "radix-ui";
import { CircleCheck, CircleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  message: string;
  title: string;
  tone?: "success" | "error";
  viewportClassName?: string;
};

export function OperationAlert({
  message,
  title,
  tone = "success",
  viewportClassName,
}: Props) {
  return message ? (
    <Notification
      key={tone + ":" + message}
      message={message}
      title={title}
      tone={tone}
      viewportClassName={viewportClassName}
    />
  ) : null;
}

function Notification({ message, title, tone, viewportClassName }: Props) {
  const [open, setOpen] = useState(true);
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const Icon = tone === "success" ? CircleCheck : CircleAlert;
  return (
    <>
      <span ref={setAnchor} className="sr-only" />
      <Toast.Provider
        label="Notificación"
        duration={tone === "success" ? 5000 : 8000}
        swipeDirection="right"
        announcerContainer={anchor?.closest('[role="dialog"]') ?? undefined}
      >
        <Toast.Root
          open={open}
          onOpenChange={setOpen}
          className="pointer-events-auto relative flex gap-3 rounded-xl border border-line bg-white p-4 pr-10 shadow-xl motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:slide-in-from-right-4 motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0"
        >
          <Icon
            aria-hidden="true"
            className={
              "mt-0.5 size-5 shrink-0 " +
              (tone === "success" ? "text-emerald-600" : "text-red-600")
            }
          />
          <div className="min-w-0">
            <Toast.Title className="text-sm font-semibold text-brand">
              {title}
            </Toast.Title>
            <Toast.Description className="mt-1 text-sm leading-5 text-muted">
              {message}
            </Toast.Description>
          </div>
          <Toast.Close
            aria-label="Cerrar notificación"
            className="absolute right-2 top-2 rounded-md p-1 text-muted hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue"
          >
            <X size={16} aria-hidden="true" />
          </Toast.Close>
        </Toast.Root>
        <Portal.Root>
          <Toast.Viewport
            label="Notificaciones ({hotkey})"
            className={cn(
              "pointer-events-none fixed bottom-4 right-4 z-[110] m-0 flex w-[calc(100vw-2rem)] max-w-sm list-none flex-col gap-2 outline-none sm:bottom-6 sm:right-6",
              viewportClassName,
            )}
          />
        </Portal.Root>
      </Toast.Provider>
    </>
  );
}
