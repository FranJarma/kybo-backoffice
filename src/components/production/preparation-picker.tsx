"use client";

import { useEffect, useId, useState } from "react";
import { ChefHat, LoaderCircle, RefreshCw } from "lucide-react";
import { SearchCombobox } from "@/components/ui/search-combobox";
import { FieldCaption } from "@/components/ui/field-caption";
import { Button } from "@/components/ui/button";
import { getJson, quantity } from "@/components/inventory/shared";
import type { RecipeDetail, RecipeList } from "@/modules/recipes/types";
import styles from "./production.module.css";

export function PreparationPicker({
  initialRecipe = "",
  onChange,
  onReadyChange,
  disabled = false,
  refreshKey = 0,
}: {
  initialRecipe?: string;
  onChange: (recipe: RecipeDetail | null) => void;
  onReadyChange: (ready: boolean) => void;
  disabled?: boolean;
  refreshKey?: number;
}) {
  const id = useId();
  const [selectedId, setSelectedId] = useState(initialRecipe);
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [selectedName, setSelectedName] = useState("");
  const [settledRequest, setSettledRequest] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [list, setList] = useState<RecipeList>({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const requestKey = `${selectedId}:${version}:${refreshKey}`;
  const detailLoading = !!selectedId && settledRequest !== requestKey;
  useEffect(() => {
    let live = true;
    const timer = setTimeout(
      () => {
        setLoading(true);
        getJson<RecipeList>(
          `/api/recipes?kind=preparation&q=${encodeURIComponent(query)}&offset=0`,
        )
          .then((result) => {
            if (live) setList(result);
          })
          .catch(() => {
            if (live) setError("No pudimos cargar las preparaciones.");
          })
          .finally(() => {
            if (live) setLoading(false);
          });
      },
      query ? 200 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, version]);
  useEffect(() => {
    if (!selectedId) return;
    let live = true;
    onReadyChange(false);
    getJson<RecipeDetail>(`/api/recipes/${selectedId}`)
      .then((result) => {
        if (!live) return;
        if (result.kind !== "preparation" || result.archived)
          throw new Error("Elegí una preparación activa.");
        setRecipe(result);
        setSelectedName(result.name);
        onChange(result);
        onReadyChange(true);
        setError("");
      })
      .catch((cause) => {
        if (live)
          setError(
            cause instanceof Error
              ? cause.message
              : "No pudimos cargar la receta.",
          );
      })
      .finally(() => {
        if (live) setSettledRequest(requestKey);
      });
    return () => {
      live = false;
    };
  }, [selectedId, onChange, onReadyChange, requestKey]);
  return (
    <div className={styles.picker}>
      <label htmlFor={id}>
        <FieldCaption required>Preparación</FieldCaption>
      </label>
      <SearchCombobox
        id={id}
        label="Preparación"
        value={selectedId}
        selectedLabel={
          recipe?.id === selectedId
            ? recipe.name
            : selectedName ||
              list.rows.find((row) => row.id === selectedId)?.name ||
              ""
        }
        options={list.rows
          .filter((row) => !row.archived)
          .map((row) => ({
            id: row.id,
            name: row.name,
            description: `${quantity(row.yieldQuantity, row.baseUnit)} por tanda`,
          }))}
        required
        disabled={disabled}
        loading={loading}
        filterMode="remote"
        placeholder="Buscá una preparación…"
        onSearch={setQuery}
        onChange={(value) => {
          if (value === selectedId) return;
          onReadyChange(false);
          setSelectedId(value);
          setSelectedName(
            list.rows.find((row) => row.id === value)?.name ?? "",
          );
          setSettledRequest(null);
          setError("");
          if (!value) {
            setRecipe(null);
            onChange(null);
          }
        }}
      />
      {detailLoading ? (
        <p role="status" className={styles.recipeHint}>
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
          Actualizando receta{selectedName ? ` de ${selectedName}` : ""}…
        </p>
      ) : error ? (
        <div role="alert" className={styles.pickerError}>
          <p>{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => {
              setError("");
              setVersion((n) => n + 1);
            }}
          >
            <RefreshCw size={14} /> Reintentar
          </Button>
        </div>
      ) : recipe ? (
        <p className={styles.recipeHint}>
          <ChefHat size={16} /> Una tanda rinde{" "}
          <strong>{quantity(recipe.yieldQuantity, recipe.baseUnit)}</strong>
          <span>Receta v{recipe.revision}</span>
        </p>
      ) : (
        <p className={styles.helper}>
          Elegí qué se va a preparar para ver su receta e ingredientes.
        </p>
      )}
    </div>
  );
}
