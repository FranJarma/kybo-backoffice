"use client";
export type RecipeEditorView = "recipe" | "cost" | "preparation";
export function RecipeEditorTabs({
  id,
  value,
  onChange,
}: {
  id: string;
  value: RecipeEditorView;
  onChange: (value: RecipeEditorView) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Receta, costeo y preparación"
      className="flex gap-7 border-b border-line"
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        const tabs = ["recipe", "cost", "preparation"] as const;
        const next =
          tabs[
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? 2
                : (tabs.indexOf(value) +
                    (event.key === "ArrowRight" ? 1 : -1) +
                    tabs.length) %
                  tabs.length
          ];
        onChange(next);
        document.getElementById(`${id}-tab-${next}`)?.focus();
      }}
    >
      {(["recipe", "cost", "preparation"] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          id={`${id}-tab-${tab}`}
          aria-controls={`${id}-panel-${tab}`}
          aria-selected={value === tab}
          tabIndex={value === tab ? 0 : -1}
          onClick={() => onChange(tab)}
          className="min-h-11 border-b-2 border-transparent px-1 py-3 text-sm font-medium text-muted aria-selected:border-blue aria-selected:text-blue"
        >
          {tab === "recipe"
            ? "Receta"
            : tab === "cost"
              ? "Costeo"
              : "Preparación"}
        </button>
      ))}
    </div>
  );
}
