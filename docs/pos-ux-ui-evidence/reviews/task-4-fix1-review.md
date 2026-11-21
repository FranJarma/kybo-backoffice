# Task 4 fix round 1 independent review

Range `77e0c52c78d88c0c3be79eaac9478486d41c49d7..27896c6dcdd30acafec63cc050280a8cb123c676`.

## Verdict

**ADDRESSED.** The Important finding about Deshacer blocking surviving lines at 320×720 and 390×640 is resolved. No new findings in the fix diff.

`src/components/sales/pos.css:411` removes sticky positioning and stacking from the notice. It now scrolls with the lines while keeping its minimum height and existing layout. The fix touches no other production behavior.

`tests/e2e/pos-surface.spec.ts:928` repeats the original reproduction at both viewports. It removes Shake Oreo from a three-line draft, increases Cappuccino, saves a note in the surviving line, and clicks Deshacer. It checks line identity, counts, the saved note and totals, and uses ordinary actionability checks for each click. The exact same sequence before the fix reached the first surviving-line edit and timed out because the notice intercepted pointer events in both viewports.

The review checked `task4-fix1-browser-red.log` and `task4-fix1-browser-green.log`. The final log shows both compact regressions and the existing mobile edit/undo and fixed heading/checkout scrolling checks passed, 4/4 in 15.3s. Scoped ESLint, formatting and diff checks passed according to the implementation report. No additional run was needed for this scoped review. The two minor touch issues and the pre-existing managed selector gap are outside this round.

