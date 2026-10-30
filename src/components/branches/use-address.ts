"use client";

import { useEffect, useState } from "react";
import { getJson } from "@/components/inventory/shared";
import type { BranchAddressSnapshot } from "@/modules/branches/address";

export function useBranchAddress(branchId: string) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{
    branchId: string;
    data: BranchAddressSnapshot | null;
    error: string;
    loading: boolean;
  }>({ branchId, data: null, error: "", loading: true });
  useEffect(() => {
    let live = true;
    getJson<BranchAddressSnapshot>(`/api/branches/${branchId}/address`)
      .then((data) => {
        if (live) setState({ branchId, data, error: "", loading: false });
      })
      .catch(() => {
        if (live)
          setState({
            branchId,
            data: null,
            error: "No pudimos cargar la dirección de la sucursal.",
            loading: false,
          });
      });
    return () => {
      live = false;
    };
  }, [branchId, version]);
  return {
    data: state.branchId === branchId ? state.data : null,
    error: state.branchId === branchId ? state.error : "",
    loading: state.branchId !== branchId || state.loading,
    refresh: () => {
      setState({ branchId, data: null, error: "", loading: true });
      setVersion((v) => v + 1);
    },
  };
}
