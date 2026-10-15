import type { PreparationGuide } from "@/modules/recipes/preparation-guide";

export function PreparationInstructions({
  guide,
}: {
  guide?: PreparationGuide | null;
}) {
  if (
    !guide ||
    (!guide.steps.length && !guide.estimatedMinutes && !guide.observations)
  )
    return null;
  return (
    <details className="mt-3 rounded-lg border border-line bg-surface/50 p-4">
      <summary className="cursor-pointer font-semibold text-brand">
        Cómo preparar
        {guide.estimatedMinutes
          ? ` · ${guide.estimatedMinutes} min estimados`
          : ""}
      </summary>
      {!!guide.steps.length && (
        <ol className="mt-4 list-decimal space-y-3 pl-5">
          {guide.steps.map((step, i) => (
            <li key={i} className="whitespace-pre-wrap pl-1 leading-relaxed">
              {step}
            </li>
          ))}
        </ol>
      )}
      {guide.observations && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="font-medium">Observaciones</p>
          <p className="mt-1 whitespace-pre-wrap leading-relaxed">
            {guide.observations}
          </p>
        </div>
      )}
    </details>
  );
}
