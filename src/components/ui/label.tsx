"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Label as LabelPrimitive } from "radix-ui";
import { FieldCaption } from "./field-caption";

function Label({
  className,
  required = false,
  optional = false,
  children,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & {
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {required || optional ? (
        <FieldCaption required={required} optional={optional}>
          {children}
        </FieldCaption>
      ) : (
        children
      )}
    </LabelPrimitive.Root>
  );
}

export { Label };
