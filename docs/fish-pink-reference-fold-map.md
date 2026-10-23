# Fish fold map — pink-paper screenshot candidate

Recipe id: `fish-pink-reference`. Playable tracker `0/8` → `8/8`.

**Status: candidate, not QA-approved, not video-verified.** Source is eleven keyframe screenshots (`1.png`–`11.png`) plus a 10-stage logical table. Intermediate hand motion is missing. Frames 6–11 may be reversed. Do not treat this as the original orange Seda diagram (`seda-fish` / `docs/fish-fold-map.md`). Do not mix the two recipes.

A 51-second source video would replace guessed collapse order, layer turns, and flap timing.

Sheet: 0.20 m. Corners `A(-0.10,-0.10)` `B(0.10,-0.10)` `C(0.10,0.10)` `D(-0.10,0.10)`. Midpoints `ML(-0.10,0)` `MR(0.10,0)` `MB(0,-0.10)` `MT(0,0.10)` `O(0,0)`.

| # | Recipe step | User stage | Action type | Mesh | Source | QA |
| --- | --- | --- | --- | --- | --- | --- |
| — | spawn square | 1 | — | Flat 8-triangle square | `1.png` | n/a |
| 1 | `diag-ac` | 2 | FOLD | Live hinge 180° about AC; B→D | `2.png` | not approved |
| 2 | `unfold-ac` | 3 open | UNFOLD | Interpolation triangle→square; crease AC stays locked | `4.png` | not approved |
| 3 | `diag-bd` | 3 fold | FOLD | Live hinge 180° about BD; A→C | logical table | not approved |
| 4 | `unfold-bd` | 4 | UNFOLD | Interpolation triangle→square; AC and BD both locked | `4.png` | not approved |
| 5 | `book-horizontal` | 5 | FOLD | Live hinge 180° about y=0; C→B, D→A | `5.png` | not approved |
| 6 | `triangle-collapse` | 6 | COLLAPSE | Pinch-driven interpolation; coupled creases ML–MB and MR–MB | `6.png` / table | not approved |
| 7 | `tail-flaps` | 7 | FLAP_FOLD | Left flap only (ML→tail). Right flap is hold/stabilize | `7.png` / `11.png` | not approved |
| 8 | `flatten-body` | 8 | CREASE_PRESS | Pinch-and-hold ~650 ms or drag 0–180. Right tail settles | `8.png` | not approved |
| — | silhouette + swim | 9–10 | validate then CREATURE_ALIVE | Mouth + forked tail vs `finalSilhouette` | finished fish in stills | not approved |

Screenshot `3.png` (press the first triangle) is folded into flatten/crease-press rather than an extra step, because the logical table has no dedicated press after the first diagonal. `9.png` / `10.png` look like layer lifts; they are not separate tracker steps until the video orders them.

## Crease graph (normalized UV, origin at paper center → UV = p / 0.20 + 0.5)

| Id | Endpoints (m) | UV | Direction | Lifecycle |
| --- | --- | --- | --- | --- |
| `ac` | A→C | (0,0)–(1,1) | valley | locked after step 1; remains through unfolds |
| `bd` | B→D | (1,0)–(0,1) | valley | locked after step 3 |
| `y0` | ML→MR | (0,0.5)–(1,0.5) | valley | locked after step 5 |
| `left-collapse` | ML→MB | (0,0.5)–(0.5,0) | valley | locked after step 6 |
| `right-collapse` | MR→MB | (1,0.5)–(0.5,0) | valley | locked after step 6 |

## Collapse (the missing engine capability)

This is not one polygon rotating about one crease. After the horizontal rectangle, corners A and B interpolate to `MB` while `ML` and `MR` stay, forming a 2-layer triangle `(ML, MR, MB)`. Extra dotted guides show both collapse creases. Geometry is authored snapshots with a pinch scalar (0°→180°), not cloth physics.

## Layer grab

Step 7 moving UV is triangle `ML–O–MB` (highlighted top/left flap). The right triangle `MR–MB–O` is hold-only. A pinch there must not fold the left flap.

## Crease-press

WebXR joints have no force. Step 8 completes if the pinch is held ~650 ms **or** the flatten angle is within 12° of 180°. Hover without pinch does not complete.

## Final silhouette

Reference points: mouth `(0,-0.10)`, tail L `(-0.038,0.022)`, tail R `(0.038,0.022)`. Swim starts only after 8/8 **and** silhouette error ≤ 0.03 m.

## Move handle

Whole-paper Move remains available after unfolds and during layered steps. Fold pinch and Move pinch stay mutually exclusive.
