"use client";

import type { ComponentProps } from "react";
import { Tabs as Primitive } from "radix-ui";
import { cn } from "@/lib/utils";

function List({ className, ...props }: ComponentProps<typeof Primitive.List>) {
  return (
    <Primitive.List
      data-slot="tabs-list"
      className={cn("section-tab-list", className)}
      {...props}
    />
  );
}
function Trigger({
  className,
  ...props
}: ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      data-slot="tabs-trigger"
      className={cn("section-tab", className)}
      {...props}
    />
  );
}
function Content({
  className,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Content
      data-slot="tabs-content"
      className={cn("section-tab-panel", className)}
      {...props}
    />
  );
}

export const Tabs = { Root: Primitive.Root, List, Trigger, Content };
