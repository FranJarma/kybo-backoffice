"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getJson } from "@/components/inventory/shared";

type Revisioned = { id: string; revision: number };
type Snapshot<T> = {
  query: string;
  rows: T[];
  known: Record<string, T>;
  members: Record<string, string[]>;
  missing: string[];
  hasMore: boolean;
  receivedAt: number;
  error: string;
  failedQuery: string;
};

export function useLiveProductionOrders<T extends Revisioned>(
  query: string,
  version: number,
  active: boolean,
) {
  const panel = useRef<HTMLDivElement>(null);
  const edited = useRef(new Set<string>());
  const [refreshing, setRefreshing] = useState(true);
  const [clock, setClock] = useState(() => Date.now());
  const [snapshot, setSnapshot] = useState<Snapshot<T>>({
    query: "",
    rows: [],
    known: {},
    members: {},
    missing: [],
    hasMore: false,
    receivedAt: 0,
    error: "",
    failedQuery: "",
  });
  useEffect(() => {
    let live = true;
    let controller: AbortController | null = null;
    let poll: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (live) poll = setTimeout(() => void load(), active ? 10_000 : 30_000);
    };
    const load = async () => {
      clearTimeout(poll);
      if (
        document.hidden ||
        panel.current?.closest('[hidden], [data-state="inactive"]')
      ) {
        schedule();
        return;
      }
      controller?.abort();
      const own = new AbortController();
      controller = own;
      const timeout = setTimeout(() => own.abort(), 9000);
      setRefreshing(true);
      try {
        if (!navigator.onLine)
          throw Error("Sin conexión. Actualizá antes de continuar.");
        const response = await getJson<{ rows: T[]; hasMore: boolean }>(
          query,
          own.signal,
        );
        if (
          !Array.isArray(response.rows) ||
          typeof response.hasMore !== "boolean"
        )
          throw Error("No pudimos confirmar las órdenes. Volvé a actualizar.");
        if (!live || controller !== own) return;
        setSnapshot((current) => {
          const known = { ...current.known };
          const incoming = new Set(response.rows.map((row) => row.id));
          // Dirty forms keep their revision and input state until the user reviews the change.
          const missing = (current.members[query] ?? [])
            .filter((id) => edited.current.has(id) && !incoming.has(id))
            .map((id) => known[id])
            .filter((row): row is T => !!row);
          for (const row of response.rows) {
            const previous = known[row.id];
            if (
              !previous ||
              (!edited.current.has(row.id) && previous.revision <= row.revision)
            )
              known[row.id] = row;
          }
          return {
            query,
            rows: [...response.rows, ...missing],
            known,
            members: {
              ...current.members,
              [query]: [...response.rows, ...missing].map((row) => row.id),
            },
            missing: missing.map((row) => row.id),
            hasMore: response.hasMore,
            receivedAt: Date.now(),
            error: "",
            failedQuery: "",
          };
        });
        setClock(Date.now());
      } catch (failure) {
        if (live && controller === own)
          setSnapshot((current) => ({
            ...current,
            failedQuery: query,
            error:
              failure instanceof Error && failure.name !== "AbortError"
                ? failure.message
                : "No pudimos confirmar la conexión. Actualizá para continuar.",
          }));
      } finally {
        clearTimeout(timeout);
        if (live && controller === own) {
          setRefreshing(false);
          schedule();
        }
      }
    };
    const wake = () => {
      void load();
    };
    const offline = () => {
      controller?.abort();
      setSnapshot((current) => ({
        ...current,
        failedQuery: query,
        error: "Sin conexión. Actualizá antes de continuar.",
      }));
    };
    const initial = setTimeout(wake, 0);
    const timer = setInterval(() => setClock(Date.now()), 2000);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", wake);
    const tab = panel.current?.closest('[role="tabpanel"]');
    const observer = tab ? new MutationObserver(wake) : null;
    if (tab)
      observer?.observe(tab, {
        attributes: true,
        attributeFilter: ["hidden", "data-state"],
      });
    return () => {
      live = false;
      controller?.abort();
      clearTimeout(initial);
      clearTimeout(poll);
      clearInterval(timer);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", wake);
      observer?.disconnect();
    };
  }, [query, version, active]);
  const markEdited = useCallback((id: string) => {
    edited.current.add(id);
  }, []);
  const setPanel = useCallback((node: HTMLDivElement | null) => {
    panel.current = node;
  }, []);
  const revealReview = useCallback(() => {
    const first = panel.current?.querySelector<HTMLElement>(
      'article[data-review-pending="true"]',
    );
    first?.scrollIntoView({
      block: "start",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    first?.focus({ preventScroll: true });
  }, []);
  const acceptSaved = useCallback((value: unknown) => {
    const id = (value as { result?: { id?: unknown } } | null)?.result?.id;
    if (typeof id === "string") edited.current.delete(id);
  }, []);
  const applyLatest = useCallback((id: string) => {
    edited.current.delete(id);
    setSnapshot((current) => {
      const latest = current.rows.find((row) => row.id === id);
      const known = { ...current.known };
      if (current.missing.includes(id)) delete known[id];
      else if (latest) known[id] = latest;
      return {
        ...current,
        known,
        rows: current.missing.includes(id)
          ? current.rows.filter((row) => row.id !== id)
          : current.rows,
        missing: current.missing.filter((value) => value !== id),
      };
    });
  }, []);
  const current = snapshot.query === query;
  const fresh =
    current &&
    snapshot.failedQuery !== query &&
    clock - snapshot.receivedAt < (active ? 30_000 : 60_000);
  return {
    setPanel,
    revealReview,
    ...snapshot,
    rows: current ? snapshot.rows : [],
    error: snapshot.failedQuery === query ? snapshot.error : "",
    fresh,
    clock,
    refreshing,
    loading: !current && snapshot.failedQuery !== query,
    markEdited,
    applyLatest,
    acceptSaved,
  };
}
