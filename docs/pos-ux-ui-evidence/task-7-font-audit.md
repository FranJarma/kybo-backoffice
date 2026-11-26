# Task 7: Barlow font audit

The available runtime cannot produce a verified WOFF2 conversion without installing tooling. No project dependency, original font, font license, app file, or test was modified. No conversion candidate was generated.

## Runtime evidence

- CODEX_PRIMARY_RUNTIME_PYTHON is not present in this host environment.
- The available `python` resolves to `C:\Python312\python.exe`.
- `importlib.util.find_spec('fontTools')` returned absent.
- `importlib.util.find_spec('brotli')` returned absent.
- No package was installed and no font conversion or subsetting was attempted.

## Exact source inventory

| Font | Bytes | SHA-256 |
| --- | ---: | --- |
| barlow-regular.ttf | 104068 | 95aa02c7c43096e0dd44d787ba6216864a67157e402adab59b35572e0c1577ea |
| barlow-medium.ttf | 103536 | f8906f762cb73dca441da034bc363b2d8e2e68bc10d5c05e58717646c20cc4b4 |
| barlow-semibold.ttf | 108348 | 86577cb32f8abe3673db53ca0f4221e6856751a4f6730c867e00f720f8bb1fc5 |
| barlow-bold.ttf | 108220 | 84e6a4d61e7c3e21f3c50ea6a4f7e5303a3467864c038be6ea3759bab8d547f9 |

Total original font bytes: **424172** (the proposed 424144 baseline differs by 28 bytes).

License: public/fonts/OFL-Barlow.txt, 4377 bytes, SHA-256 186d750eb496a4c17a76385f82be6aea2ac1cf2de074a811d63786cf374ea73f.

## Recommendation

Keep the four approved TTF files and the existing next/font/local integration for this feature. Treat WOFF2 compression as deferred until a runtime already containing fontTools and Brotli is available, or the user authorizes tooling. Before adopting candidates, verify per-weight cmap, glyph outlines, horizontal metrics, name records and OS/2 metrics against the exact originals, preserve the OFL license, and measure actual transfer bytes under the same browser conditions. This audit makes no claim of an achieved size reduction or typographic equivalence.

