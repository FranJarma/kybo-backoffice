"use client";

import { useEffect, useReducer, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Check,
  LoaderCircle,
  MapPin,
  Pencil,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchCombobox } from "@/components/ui/search-combobox";
import { FieldCaption } from "@/components/ui/field-caption";
import type { GeocodedAddress } from "@/modules/branches/geocoding";
import type { BranchAddressSnapshot } from "@/modules/branches/address";
import { useBranchAddress } from "./use-address";
import { FormDialog } from "./forms";
import {
  addressDraftReducer,
  draftCoordinates,
  initialAddressDraft,
  reconcileAddressDraft,
} from "./address-draft";

export function BranchAddress({
  branchId,
  branchName,
}: {
  branchId: string;
  branchName: string;
}) {
  const address = useBranchAddress(branchId);
  const [editing, setEditing] = useState(false);
  return (
    <div className="branches-address-row">
      <MapPin aria-hidden="true" />
      <span>
        {address.loading
          ? "Consultando dirección…"
          : address.error ||
            address.data?.address?.address ||
            "Dirección del local pendiente"}
      </span>
      {address.error ? (
        <Button variant="ghost" onClick={address.refresh}>
          Reintentar
        </Button>
      ) : (
        <Button
          variant="ghost"
          disabled={address.loading}
          onClick={() => setEditing(true)}
        >
          <Pencil />
          {address.data?.address ? "Editar" : "Agregar dirección"}
        </Button>
      )}
      {editing && address.data && (
        <AddressForm
          branchId={branchId}
          branchName={branchName}
          snapshot={address.data}
          onClose={() => {
            setEditing(false);
            address.refresh();
          }}
          onSaved={() => {
            setEditing(false);
            address.refresh();
          }}
        />
      )}
    </div>
  );
}

function AddressForm({
  branchId,
  branchName,
  snapshot: initialSnapshot,
  onClose,
  onSaved,
}: {
  branchId: string;
  branchName: string;
  snapshot: BranchAddressSnapshot;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [draft, dispatch] = useReducer(
    addressDraftReducer,
    snapshot.address,
    initialAddressDraft,
  );
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<GeocodedAddress[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [reconciliation, setReconciliation] = useState<
    BranchAddressSnapshot["address"] | undefined
  >();
  const coordinates = draftCoordinates(draft);
  useEffect(() => {
    if (query.trim().length < 5 || (draft.selectedId && query === draft.text))
      return;
    let live = true;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      setSearchError("");
      fetch(`/api/branches/${branchId}/address/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: abort.signal,
      })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.error ?? "No pudimos buscar la dirección.");
          return result.rows as GeocodedAddress[];
        })
        .then((results) => {
          if (live) setRows(results);
        })
        .catch((e) => {
          if (live) {
            setRows([]);
            setSearchError(e.message);
          }
        })
        .finally(() => {
          if (live) setSearching(false);
        });
    }, 700);
    return () => {
      live = false;
      abort.abort();
      clearTimeout(timer);
    };
  }, [query, branchId, searchAttempt, draft.selectedId, draft.text]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!coordinates || !draft.confirmed || !snapshot.ready || needsRefresh)
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/branches/${branchId}/address`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: draft.text,
          ...coordinates,
          source: draft.source,
          expectedRevision: snapshot.address?.revision ?? 0,
          confirmed: true,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "No pudimos guardar la dirección.");
      onSaved();
    } catch (e) {
      setNeedsRefresh(true);
      dispatch({ type: "confirm", value: false });
      setError(
        e instanceof Error ? e.message : "No pudimos guardar la dirección.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function reconcile() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/branches/${branchId}/address`, {
        cache: "no-store",
      });
      const latest: BranchAddressSnapshot = await response.json();
      if (!response.ok)
        throw new Error(
          "No pudimos actualizar la dirección guardada. Tu propuesta se conserva.",
        );
      setSnapshot(latest);
      const result = reconcileAddressDraft(draft, latest.address);
      if (result.alreadySaved) {
        onSaved();
        return;
      }
      dispatch({ type: "reconcile", value: latest.address });
      setReconciliation(latest.address);
      setNeedsRefresh(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No pudimos consultar la dirección guardada.",
      );
    } finally {
      setBusy(false);
    }
  }
  const mapLink = coordinates
    ? `https://www.openstreetmap.org/?mlat=${coordinates.latitude}&mlon=${coordinates.longitude}#map=18/${coordinates.latitude}/${coordinates.longitude}`
    : "";
  const mapUrl = coordinates
    ? `https://www.openstreetmap.org/export/embed.html?${new URLSearchParams({ bbox: [coordinates.longitude - 0.002, coordinates.latitude - 0.0014, coordinates.longitude + 0.002, coordinates.latitude + 0.0014].join(","), layer: "mapnik", marker: `${coordinates.latitude},${coordinates.longitude}` })}`
    : "";
  return (
    <FormDialog
      title="Dirección de la sucursal"
      description={`Buscá la dirección de ${branchName} y confirmá en el mapa dónde está la entrada del local.`}
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={submit} className="branches-form branches-address-form">
        {!snapshot.ready && (
          <p role="status" className="branches-note">
            Podés buscar y revisar el punto. Falta completar la habilitación de
            direcciones para poder guardarlo.
          </p>
        )}
        <div>
          <label htmlFor="branch-street-address">
            <FieldCaption required>Dirección del local</FieldCaption>
          </label>
          <SearchCombobox
            filterMode="remote"
            id="branch-street-address"
            label="Dirección del local"
            value={draft.selectedId}
            selectedLabel={draft.text}
            options={
              draft.selectedId === "saved"
                ? [
                    {
                      id: "saved",
                      name: draft.text,
                      description: "Dirección guardada de esta sucursal",
                    },
                    ...rows,
                  ]
                : rows
            }
            loading={searching}
            disabled={busy}
            maxLength={240}
            placeholder="Alberdi 143, Salta Capital, Salta"
            onSearch={(value) => {
              setQuery(value);
              setRows([]);
              setSearchError("");
              if (value.trim().length < 5) setSearching(false);
            }}
            onTextChange={(value) => {
              dispatch({ type: "text", value });
              setError("");
            }}
            onChange={(id) => {
              if (!id) {
                dispatch({ type: "text", value: "" });
                setRows([]);
                return;
              }
              const result = rows.find((row) => row.id === id);
              if (result) {
                dispatch({ type: "select", value: result });
                setSearchError("");
                setSearching(false);
              }
            }}
          />
          <p className="branches-field-help">
            Incluí calle, altura, ciudad y provincia. Elegí la coincidencia de
            tu ciudad.
          </p>
          <p className="branches-address-attribution">
            Búsqueda: Photon ·{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              © OpenStreetMap contributors
            </a>
          </p>
          {searching && (
            <p role="status" className="branches-field-help">
              <LoaderCircle className="animate-spin" />
              Buscando dirección…
            </p>
          )}
          {searchError && (
            <div role="alert" className="branches-error">
              {searchError}
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setQuery(draft.text);
                  setSearchAttempt((v) => v + 1);
                }}
              >
                <Search />
                Reintentar búsqueda
              </Button>
            </div>
          )}
        </div>
        {coordinates ? (
          <div className="branches-address-map">
            <iframe
              title="Punto de la entrada de la sucursal"
              src={mapUrl}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
            <a href={mapLink} target="_blank" rel="noreferrer">
              Ver mapa más grande
              <ArrowUpRight />
            </a>
            <p>
              La dirección puede dar un punto aproximado. Revisá que el marcador
              corresponda a la entrada del local.
            </p>
          </div>
        ) : (
          <div className="branches-empty">
            <MapPin />
            <strong>Elegí una dirección para ver el mapa</strong>
            <p>La búsqueda no guarda cambios hasta que confirmes el punto.</p>
          </div>
        )}
        <details className="branches-address-advanced">
          <summary>Ajuste avanzado del punto</summary>
          <p>
            Si ya conocés las coordenadas exactas, podés corregirlas. Después
            confirmá nuevamente el marcador.
          </p>
          <div className="branches-address-coordinates">
            <label>
              <FieldCaption required>Latitud</FieldCaption>
              <Input
                type="number"
                step="any"
                min={-90}
                max={90}
                disabled={busy}
                value={draft.latitude}
                onChange={(e) =>
                  dispatch({ type: "latitude", value: e.target.value })
                }
              />
            </label>
            <label>
              <FieldCaption required>Longitud</FieldCaption>
              <Input
                type="number"
                step="any"
                min={-180}
                max={180}
                disabled={busy}
                value={draft.longitude}
                onChange={(e) =>
                  dispatch({ type: "longitude", value: e.target.value })
                }
              />
            </label>
          </div>
        </details>
        <label className="branches-check branches-address-confirm">
          <input
            type="checkbox"
            disabled={
              busy ||
              needsRefresh ||
              !coordinates ||
              draft.text.trim().length < 5
            }
            checked={draft.confirmed}
            onChange={(e) =>
              dispatch({ type: "confirm", value: e.target.checked })
            }
          />
          <span>
            <strong>
              Confirmo que el marcador corresponde a la entrada del local{" "}
              <span aria-hidden="true">*</span>
            </strong>
            <small>
              Asistencia usará este punto para comprobar la cercanía.
            </small>
          </span>
        </label>
        {error && (
          <p role="alert" className="branches-error">
            {error}
          </p>
        )}
        {needsRefresh && (
          <div className="branches-note">
            <p>
              Tu propuesta se conserva. Consultá la dirección guardada antes de
              volver a confirmar.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              disabled={busy}
              onClick={() => void reconcile()}
            >
              Actualizar dirección guardada
            </Button>
          </div>
        )}
        {reconciliation !== undefined && (
          <div role="status" className="branches-note">
            <p>
              {reconciliation
                ? `La sucursal tiene guardada: ${reconciliation.address}.`
                : "Tu propuesta todavía no figura guardada."}
            </p>
            {reconciliation && (
              <a
                className="inline-flex min-h-10 items-center text-blue underline"
                target="_blank"
                rel="noreferrer"
                href={`https://www.openstreetmap.org/?mlat=${reconciliation.latitude}&mlon=${reconciliation.longitude}#map=18/${reconciliation.latitude}/${reconciliation.longitude}`}
              >
                Ver ubicación guardada
              </a>
            )}
            <p>
              Tu propuesta sigue en el mapa. Revisala y confirmá nuevamente
              antes de guardarla.
            </p>
          </div>
        )}
        <div className="branches-form-footer">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={
              busy ||
              needsRefresh ||
              searching ||
              !snapshot.ready ||
              !coordinates ||
              !draft.confirmed
            }
          >
            <Check />
            {busy ? "Guardando…" : "Guardar dirección"}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
