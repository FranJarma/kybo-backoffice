<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## UI de Kybo

- Los selectores con búsqueda (clientes, insumos y otras relaciones) deben reutilizar `src/components/ui/search-combobox.tsx` como Autocomplete. No separar un campo de búsqueda de un `<select>` ni crear ese patrón dentro de un modal.
- En la toma de pedidos, priorizar controles en línea y pocas interacciones. El usuario pidió explícitamente mantener este criterio para los cambios futuros.
