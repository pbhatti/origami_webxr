# Whale fold map

Recipe id: `origami-whale`. Tracker **six stages** (`0/6` → `6/6`). Stage 2 contains an unfold plus two kite sub-folds; the tracker stays on 2 until both inward folds snap.

Source: six-panel whale diagram (diamond → kite → body → head → tail → silhouette). Paper is a 20 cm square shown as a **diamond** (corners on the axes).

| Stage | Engine steps | Action | Mesh | Diagram | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | `diag-fold` | Bottom corner to top about the horizontal diagonal | Live hinge 180° | Panel 1 | Left–right crease |
| 2 | `unfold-diag` | Open back to diamond; crease stays | Unfold interpolation | Panel 2 open | Does not complete stage 2 |
| 2 | `kite-upper` | Upper-right edge to centerline | Interpolation | Panel 2 | Sub-fold 1 |
| 2 | `kite-lower` | Lower-right edge to centerline | Interpolation | Panel 2 | Sub-fold 2; stage 2 completes |
| 3 | `body-center` | Fold kite in half on the horizontal crease | Live hinge 180° | Panel 3 | Pointed end remains right |
| 4 | `head-in` | Fold left tip inward | Live hinge 180° | Panel 4 | Head inset estimated |
| 5 | `tail-up` | Fold right point upward | Interpolation | Panel 5 | **No silent flip** |
| 6 | `complete-whale` | Pinch-and-hold flatten; silhouette; swim | Crease-press | Panel 6 | Eye added on completion |

## Orientation uncertainty (panel 5)

The tail panel includes a wrap-around arrow at the right tip. That may be a mountain fold of the tail, a small reverse fold, or a turn-over of the packet. This candidate **does not auto-flip**. If a physical fold-through shows the tail on the wrong side of the body, add an explicit Flip Paper instruction rather than rotating the model in code.

## Coordinates (paper-local meters)

Diamond corners: `L(-0.141,0)` `RIGHT(0.141,0)` `T(0,0.141)` `B(0,-0.141)`. Horizontal crease `y=0`. Kite creases from `RIGHT` to `PU/PL` on the left edges.

## Phase 2 (stage 1 half-fold)

Live hinge of the lower diamond about `L–RIGHT`. Bottom corner `B` maps onto `T`. The committed sheet is a two-layer triangle (`top-*` layer 0, `bot-*` layer 1) with outline `L–T–RIGHT`. The Move tab sits below the diamond tip (offset `y=-0.22`) so it cannot steal the bottom-corner pinch.

Fish recipes `seda-fish` and `fish-pink-reference` remain in the repository as unused references and are not the live PaperStage recipe.
