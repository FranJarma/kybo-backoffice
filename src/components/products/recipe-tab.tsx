"use client";
import { useEffect, useState } from "react";
import { ModifierRecipeEditor } from "@/components/recipes/modifier-editor";
import { RecipeEditor } from "@/components/recipes/recipes-manager";
import { getJson, useOperation } from "@/components/inventory/shared";
import { Button } from "@/components/ui/button";
import { OperationAlert } from "@/components/ui/operation-alert";
import { useErrorFeedback } from "@/components/ui/use-error-feedback";
import type { RecipeDetail, RecipeInput } from "@/modules/recipes/types";

export function ProductRecipeTab({
  productId,
  actorId,
  onBusy,
  onBack,
  onSaved,
  view = "recipe",
}: {
  productId: string;
  actorId: string;
  onBusy: (busy: boolean) => void;
  onBack: () => void;
  onSaved?: () => void;
  view?: "recipe" | "cost" | "preparation";
}) {
  const [recipe, setRecipe] = useState<RecipeDetail | null>();
  const [loadError, setLoadError, loadErrorAttempt] = useErrorFeedback();
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const operation = useOperation<RecipeInput>(actorId, "recipe", (result) => {
    const saved = result as RecipeDetail;
    if (saved.targetId === productId) setRecipe(saved);
    else setRefresh((n) => n + 1);
    onSaved?.();
    setNotice("Receta guardada. El producto conserva sus datos y precios.");
  });
  useEffect(() => {
    onBusy(operation.busy || operation.uncertain);
  }, [operation.busy, operation.uncertain, onBusy]);
  useEffect(() => {
    let live = true;
    getJson<{ recipe: RecipeDetail | null }>(
      `/api/products/${productId}/recipe`,
    )
      .then((result) => {
        if (live) {
          setRecipe(result.recipe);
          setLoadError("");
        }
      })
      .catch((error) => {
        if (live) setLoadError(error.message);
      });
    return () => {
      live = false;
    };
  }, [productId, refresh, setLoadError]);
  if (loadError)
    return (
      <div className="space-y-3">
        <OperationAlert
          message={loadError}
          eventKey={loadErrorAttempt}
          title="No pudimos cargar la receta"
          tone="error"
        />
        <Button variant="outline" onClick={() => setRefresh((n) => n + 1)}>
          Reintentar carga
        </Button>
      </div>
    );
  if (recipe === undefined) return <p role="status">Cargando receta…</p>;
  const props = {
    view,
    initial: recipe ?? undefined,
    disabled: operation.locked,
    error: operation.error,
    errorAttempt: operation.errorAttempt,
    onSave: (input: RecipeInput) => {
      setNotice("");
      operation.submit("/api/recipes", input);
    },
    onCancel: onBack,
  };
  return (
    <div className="space-y-5">
      <OperationAlert message={notice} title="Receta publicada" />
      {!recipe && (
        <p className="text-sm text-muted">
          Sin receta. Podés crearla ahora o dejarla para después. Los productos
          de reventa pueden usar consumo directo de inventario.
        </p>
      )}
      {operation.uncertain && (
        <Button
          variant="outline"
          onClick={operation.retry}
          disabled={operation.busy}
        >
          Confirmar guardado pendiente
        </Button>
      )}
      {recipe?.compositionModel === "legacy" ? (
        <RecipeEditor key={recipe.versionId} {...props} kind="product" />
      ) : (
        <ModifierRecipeEditor
          key={recipe?.versionId ?? productId}
          {...props}
          productId={productId}
        />
      )}
    </div>
  );
}
