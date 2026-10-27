"use client";
import { useSyncExternalStore } from "react";

// Cached layouts share the browser's latest choice, including when cookies
// cannot be saved. The server always uses its own request-specific snapshot.
let sessionPreference: boolean | undefined;
const listeners = new Set<() => void>();

function snapshot() {
  if (sessionPreference !== undefined) return sessionPreference;
  try {
    return document.cookie
      .split(";")
      .some((cookie) => cookie.trim() === "kybo-sidebar=collapsed");
  } catch {
    return false;
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function toggle() {
  sessionPreference = !snapshot();
  try {
    document.cookie = `kybo-sidebar=${sessionPreference ? "collapsed" : "expanded"}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  } catch {
    // The current session remains usable when saving preferences is blocked.
  }
  listeners.forEach((listener) => listener());
}

export function useSidebarPreference(initial: boolean) {
  const collapsed = useSyncExternalStore(subscribe, snapshot, () => initial);
  return [collapsed, toggle] as const;
}
