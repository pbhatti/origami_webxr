# Fold & Fly

WebXR origami for **Meta Quest Pro** / Quest Browser. A 20 cm orange square, shown as a diamond, is folded live into a whale that swims in passthrough.

Live recipe: **`origami-whale`** (`docs/whale-fold-map.md`) — six stages. Stage 2 has two inward kite folds after an unfold. Older fish recipes remain in the repo as unused references.

Headset features are **unverified** until you record results in `docs/device-test-log.md`. Desktop success is not Quest success.

## What this build does

- 20 cm world-stable orange diamond, Welcome / Start Session / Recenter / Restart / Replay
- Custom pinch (joints, not IWSDK grabbing). Controllers are not the product input
- Six stages: half-fold, unfold + two kite folds, body, head, tail, set silhouette
- Unfold keeps locked creases. Flatten is pinch-and-hold (no force sensors)
- Tracker `0/6` → `6/6`. Swim starts only after silhouette validation. Replay restores the diamond
- Debug panel: hands, pinch, stage/sub-fold, crease, Move vs Fold, FPS
- Gold **Move** tab repositions the whole origami without undoing creases
- Desktop: click-drag the highlight to fold, or the Move tab to place. `?debug=1` `?simhands=1` `?noxr=1`
- Debug **A** assists a fold; it is logged as assist, not a gesture

## Requirements

- Node.js **20.19+** (or 22.12+)
- A desktop browser for the preview
- Quest Pro + Quest Browser on the same LAN for AR

## Commands

```bash
npm install
npm run test
npm run lint
npm run typecheck
npm run build
npm run dev
```

Dev server: **`https://localhost:8082`**

## Quest Browser

1. `npm run dev`, headset on the same Wi-Fi.
2. Quest Browser → `https://YOUR_LAN_IP:8082` (accept the cert warning).
3. Tap **Start Session**. Pinch the highlight and fold along the dotted line.
4. Early release rolls back; a near-target release snaps once. Stage 2 needs both inward folds.
5. After `6/6` the folded whale swims. **Replay** restores the diamond.
6. Record whale checks W01–W06 in `docs/device-test-log.md`.

## Architecture

```text
src/
  origami/CreaseSolver.ts     hinge angle about the step crease
  origami/FoldPaper.ts        snapshot mesh, hinge, interpolation
  origami/OrigamiEngine.ts    live fold, snap, rollback, commit
  origami/PaperMover.ts       Move-handle translation, rotation, scale
  origami/recipes/whale.recipe.ts   live origami-whale 6 stages
  animation/WhaleCreature.ts        completion swim + eye
docs/whale-fold-map.md
```

Grabbing and locomotion remain off. Toolbar stays IWSDK ray/poke; paper uses custom pinch.

## Known limitations

- Panel 5 may imply a turn-over before the tail; this build does not silently flip
- Head and tail insets are estimated from the diagram
- Quest Pro quality is unverified until you log it
