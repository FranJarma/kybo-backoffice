import type { ReactNode } from "react";

export function FieldCaption({
  children,
  required = false,
}: {
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <span data-field-caption>
      {children}
      {required && (
        <span aria-hidden="true" className="ml-1 text-orange-600">
          *
        </span>
      )}
    </span>
  );
}
