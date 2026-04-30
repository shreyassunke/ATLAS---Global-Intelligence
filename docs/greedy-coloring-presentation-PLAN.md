# Plan: Greedy coloring presentation documentation (updated)

## Goal

Author **[atlas/docs/greedy-coloring-presentation.md](greedy-coloring-presentation.md)** as a single educational handout/slide script covering: four-color problem, codespace + tech stack, live animation play-by-play, non-map use cases, and **embedded source excerpts** so the presenter rarely opens other files during Q&A.

---

## Deliverable

- Create `atlas/docs/greedy-coloring-presentation.md` (implementation phase — not done until you approve execution).
- Optional later: link from [atlas/RESOURCES.md](../RESOURCES.md).

---

## Structure of the markdown doc (sections)

1. **Four-color map theorem** — graph model; planar intuition; χ vs greedy.
2. **Two pipelines in ATLAS** — world offline exact vs US live greedy (table + short flow).
3. **Tech stack** — React, Vite, MapLibre, Natural Earth URLs, Carto labels raster, Node precompute script.
4. **Live play-by-play** — viewport trigger, step timer, Welsh–Powell order, first-fit, palette modulo.
5. **Beyond maps** — scheduling, compilers/register coloring, spectrum allocation (high level).
6. **Appendix: glossary**.

---

## Embedded code excerpts (new requirement)

In **`greedy-coloring-presentation.md`**, include fenced citations using the repository standard:

````markdown
```startLine:endLine:path/to/file.js
// pasted or summarized lines
```
````

**Maintenance:** After edits to source files, refresh line numbers (search symbols in IDE) so citations stay accurate.

### Snippet inventory (what to embed + what to say)

| # | Source | Lines (approx.) | Audience-facing purpose |
|---|--------|-----------------|---------------------------|
| A | [usStatesGreedyColoringPresentation.js](../src/map/usStatesGreedyColoringPresentation.js) | 49–57 | **Canonical boundary segment**: `round4` + `edgeKey` — why rounding stabilizes GIS edges. |
| B | Same | 94–117 | **`buildUsStateAdjacency`**: scan rings → edges owned by exactly two features → adjacency sets. |
| C | Same | 253–255 | **`welshPowellOrder`**: degree descending — “hard/high-connectivity states first.” |
| D | Same | 261–281 | **`greedyColorStepsWelshPowell`**: collect neighbor colors; smallest missing index; push animation step + hex from palette. |
| E | Same | 124–133 | **`verifyProperColoring`**: definition of “proper” after greedy. |
| F | Same | 218–246 | **`exactColorStepsForAnimation`**: minimal k via `findKColoring`; same **Welsh–Powell step order** for the demo if greedy fails verification. |
| G | Same | 153–216 | **`findKColoring`** (optional separate block): MRV-style vertex choice + backtracking — tie to offline script (“same idea as world map”). |
| H | Same | 288–317 | **`prepareUsGreedyColoringPresentation`**: pipeline glue — adjacency → order → greedy → verify → optional exact; `meta.coloringMode`. |
| I | Same | 344–355 | **`applyGreedyStepToCollection`**: one MapLibre-friendly GeoJSON update per tick. |
| J | [FlatMap.jsx](../src/components/Globe/FlatMap.jsx) | 32–42 | **`ATLAS_COLORS`**: indices → hex (RGB-first vintage palette). |
| K | Same | 69–84 | **`injectColors`**: world countries use offline JSON indices → same palette. |
| L | Same | 153–202 | **`prepareUsGreedyColoringPresentation` call**, **`onViewportForUsaGreedy`**, **`setInterval`** applying `usaGreedy.steps` — live commentary anchor. |
| M | [precompute-map-coloring.mjs](../scripts/precompute-map-coloring.mjs) | 21–57 | Parallel **shared-edge** construction for offline graph (shows symmetry with snippet B). |
| N | Same | 282–294 | **Exact χ loop**: try k from ω upward with `findKColoring` — contrast with greedy D. |

### Presentation tips for snippets

- Show **B + D** together as “geometry → graph → greedy paint order.”
- Show **N** vs **D** as “optimal offline world” vs “live heuristic US demo (+ exact fallback F).”
- Keep **L** on screen during the actual map demo so viewers tie animation to `setData`.

---

## Execution todos (completed)

1. Added [`greedy-coloring-presentation.md`](greedy-coloring-presentation.md) with sections 1–8 + embedded citations **A–N** (including **G**).
2. Linked from [`RESOURCES.md`](../RESOURCES.md) under **Atlas repository docs**.
3. Re-run line-number refresh after substantive edits to cited files.

---

## Out of scope unless requested

- Auto-generated docs from CI.
- Runtime `console.debug` for step traces.
