import { useId } from "react";
import { Check, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ModifierAppearance } from "./modifier-presentation";

type ModifierControls =
  | {
      type: "radio";
      groupName: string;
      required: boolean;
      checked: boolean;
      onSelect: () => void;
    }
  | {
      type: "counter";
      count: number;
      increaseDisabled: boolean;
      onIncrease: () => void;
      onDecrease: () => void;
    };

export function ModifierOption({
  name,
  includedInRecipe,
  description,
  appearance,
  unavailable,
  controls,
}: {
  name: string;
  includedInRecipe: boolean;
  description: string | null;
  appearance: ModifierAppearance;
  unavailable: boolean;
  controls: ModifierControls;
}) {
  const id = useId();
  const selected =
    controls.type === "radio" ? controls.checked : controls.count > 0;
  const rowProps = {
    className: "pos-modifier-option",
    "data-selected": selected,
    "data-unavailable": unavailable,
  };
  const hasDetails = includedInRecipe || description;
  const optionText = (
    <>
      <span
        className="pos-modifier-visual"
        data-modifier-visual={appearance.kind}
        style={
          appearance.kind === "swatch"
            ? {
                backgroundColor: appearance.color,
                color: appearance.checkColor,
              }
            : undefined
        }
        aria-hidden="true"
      >
        {appearance.kind === "no-pearls" && <X className="size-10" />}
        {selected && <Check className="size-7" data-modifier-check />}
      </span>
      <span className="pos-modifier-text">
        <span className="pos-modifier-name" id={`${id}-name`}>
          {name}
        </span>
        {hasDetails && (
          <span className="pos-modifier-details" id={`${id}-details`}>
            {includedInRecipe && <span>Viene incluida en la receta</span>}
            {description && <span>{description}</span>}
          </span>
        )}
      </span>
    </>
  );

  if (controls.type === "radio")
    return (
      <label {...rowProps}>
        <input
          className="pos-modifier-radio"
          type="radio"
          name={controls.groupName}
          required={controls.required}
          checked={controls.checked}
          disabled={unavailable}
          aria-labelledby={`${id}-name`}
          aria-describedby={hasDetails ? `${id}-details` : undefined}
          onChange={controls.onSelect}
        />
        {optionText}
      </label>
    );

  return (
    <div {...rowProps}>
      {optionText}
      <div className="pos-modifier-stepper">
        <Button
          type="button"
          size="icon-lg"
          variant="ghost"
          aria-label={`Disminuir ${name}`}
          disabled={controls.count <= 0}
          onClick={controls.onDecrease}
        >
          <Minus size={18} />
        </Button>
        <output aria-label={`Cantidad ${name}`}>{controls.count}</output>
        <Button
          type="button"
          size="icon-lg"
          variant="ghost"
          aria-label={`Aumentar ${name}`}
          disabled={controls.increaseDisabled}
          onClick={controls.onIncrease}
        >
          <Plus size={18} />
        </Button>
      </div>
    </div>
  );
}
