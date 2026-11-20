"use client";
import { useId } from "react";
import { SearchCombobox } from "@/components/ui/search-combobox";
import { FieldCaption } from "@/components/ui/field-caption";

export function AssigneeField({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { id: string; name: string }[];
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-2 text-sm">
      <label htmlFor={id}>
        <FieldCaption required>Responsable</FieldCaption>
      </label>
      <SearchCombobox
        id={id}
        label="Responsable"
        required
        disabled={disabled}
        value={value}
        selectedLabel={
          options.find((person) => person.id === value)?.name ?? ""
        }
        options={options}
        onChange={onChange}
        onSearch={() => {}}
        placeholder="Buscá una persona…"
      />
    </div>
  );
}
