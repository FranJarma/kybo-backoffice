import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Crumb } from "@/lib/navigation";
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Ubicación" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5">
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li
              key={`${index}:${item.label}`}
              className={`flex min-w-0 items-center gap-2 ${index < items.length - 2 ? "hidden sm:flex" : ""}`}
            >
              {index > 0 && (
                <ChevronRight
                  size={13}
                  aria-hidden="true"
                  className={`shrink-0 text-muted ${index === items.length - 2 ? "hidden sm:block" : ""}`}
                />
              )}
              {item.href && !current ? (
                <Link
                  href={item.href}
                  className="rounded text-muted underline-offset-4 hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={current ? "page" : undefined}
                  className={
                    current ? "break-words font-bold text-brand" : "text-muted"
                  }
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
