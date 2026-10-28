import type { ReactNode } from "react";

export function FieldCaption({
  children,
  required = false,
  optional = false,
}: {
  children: ReactNode;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <span data-field-caption>
      {children}
      {required && (
        <span aria-hidden="true" className="ml-1 text-orange-600">
          *
        </span>
      )}
      {!required && optional && (
        <span aria-hidden="true" className="ml-1 font-normal text-muted">
          (opcional)
        </span>
      )}
    </span>
  );
}
