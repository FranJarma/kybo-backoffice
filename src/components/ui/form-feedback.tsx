"use client";

import { useEffect, useState } from "react";
import { OperationAlert } from "./operation-alert";

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function caption(control: Control) {
  const aria = control.getAttribute("aria-label");
  if (aria) return aria;
  const label = control.labels?.item(0);
  if (!label) return "Campo obligatorio";
  const copy = label.cloneNode(true) as HTMLElement;
  copy
    .querySelectorAll("input,select,textarea,button,p,small,[aria-hidden=true]")
    .forEach((node) => node.remove());
  return copy.textContent?.replace(/\s+/g, " ").trim() || "Campo obligatorio";
}

export function FormFeedback() {
  const [notice, setNotice] = useState({ sequence: 0, message: "" });
  useEffect(() => {
    let first: Control | null = null;
    let live = true;
    let frame = 0;
    function invalid(event: Event) {
      const control = event.target;
      if (!(
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      ))
        return;
      event.preventDefault();
      control.setAttribute("aria-invalid", "true");
      control.dataset.nativeInvalid = "true";
      if (first) return;
      first = control;
      frame = requestAnimationFrame(() => {
        const target = first;
        first = null;
        if (!live || !target?.isConnected) return;
        target.focus();
        const message = target.validity.valueMissing
          ? "Completá este campo."
          : target.validationMessage || "Revisá el valor ingresado.";
        setNotice((old) => ({
          sequence: old.sequence + 1,
          message: `${caption(target)}: ${message}`,
        }));
      });
    }
    function editing(event: Event) {
      const control = event.target;
      if (control instanceof HTMLElement && control.dataset.nativeInvalid) {
        control.removeAttribute("aria-invalid");
        delete control.dataset.nativeInvalid;
      }
    }
    document.addEventListener("invalid", invalid, true);
    document.addEventListener("input", editing, true);
    document.addEventListener("change", editing, true);
    return () => {
      live = false;
      cancelAnimationFrame(frame);
      document.removeEventListener("invalid", invalid, true);
      document.removeEventListener("input", editing, true);
      document.removeEventListener("change", editing, true);
    };
  }, []);
  return (
    <OperationAlert
      key={notice.sequence}
      title="Revisá el formulario"
      message={notice.message}
      tone="error"
    />
  );
}
