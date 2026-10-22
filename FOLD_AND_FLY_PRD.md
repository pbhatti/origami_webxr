# Fold & Fly — Cursor-ready Product Requirements and Engineering Specification
Version 1.0 · 2026-10-13 · Target: Meta Quest Pro / Quest Browser · Three.js + TypeScript + WebXR + Meta IWSDK

## 0. Instructions to Cursor coding agent
Implement in **gated phases**, never the whole product in one pass. Read this document first. At each phase: (a) inspect current repository, (b) propose file changes, (c) implement, (d) run lint/typecheck/tests/build, (e) report changed files and test evidence, (f) stop for user approval before the next phase. Never claim headset features are verified without testing on a physical Quest Pro. Preserve a usable non-XR desktop simulator for geometry and UI debugging. Do not silently substitute a scripted animation for live hand-driven folding. Log feature detection and failures. Ask for confirmation if SDK APIs differ from this design; inspect installed package types and official examples instead of guessing imports.

## 1. Vision, user promise, scope
A floating 20 cm orange square of virtual paper appears at comfortable reach in passthrough. After Start Session, a dotted crease and animated arrow show the next move. User pinches a highlighted fold region with one hand, optionally stabilizes the stationary region with the other, physically moves the fold through a guided hinge motion, and releases near its target. Magnetic assist pulls it into alignment, locks the fold, advances a nearby 1…N numbered progress tracker, and shows the next instruction. On completion the recognizably folded fish transforms into a rigged origami fish and swims within a conservative zone in front of the user. Offer Replay.

MVP includes: XR capability checks; session/welcome/start; stable floating paper; two tracked hands; pinch/hold/move/release; one-hand folding with optional second-hand stabilization; fold hints; target ghost; constraint solver; validation and snapping; progress; 12-step fish *only after every crease is geometrically authored and QA'd*; celebration fish; spatial debug panel; desktop test harness; automated geometry/state tests and Quest device test plan.

Non-goals: arbitrary folding or physical cloth simulation; paper cutting; raw camera capture; AI shape recognition; scene meshing dependency; physical collision with real surfaces; automatic conversion of 2D paper instructions into exact fold meshes; obstacle-aware room roaming; multiplayer; controllers as the primary input.

## 2. Platform realities and constraints
- Require secure context (HTTPS or localhost for desktop). Use `navigator.xr?.isSessionSupported('immersive-ar')`; verify support for `hand-tracking` via session feature negotiation, not just browser detection. Prefer `local-floor` or `local` reference space with graceful fallback, as appropriate.
- Quest Pro passthrough is composed by the headset/browser; do not expect readable camera pixel buffers in WebXR. No computer vision requirement.
- WebXR hands provide tracked joints/poses, not force/haptics; pinch must be inferred from thumb/index joint distance (or a verified SDK abstraction), with hysteresis and smoothing. Pinch confidence can degrade due to self-occlusion.
- IWSDK package names, component signatures, and support matrix change; validate actual installed version and examples before coding. Prefer IWSDK for UI/interactors where proven, and custom WebXR hand-joint logic for fold manipulation where needed. Avoid two independent systems claiming the same pinch gesture.
- No full paper physics: use authored crease graph and face transforms. Some folds may need topology changes or layers; use explicit precomputed per-step mesh assets/geometry rather than assuming one hinge can represent all 12 fish steps.
- Reference photograph is a visual tutorial, **not** an unambiguous machine-readable geometry specification. Turkish captions, overlapping faces, and image perspective require manual reconstruction. Treat the 12 steps as **provisional** until a physical paper prototype or authored SVG fold diagrams validate vertices, face layering, and mountain/valley direction. Do not fabricate a complete crease pattern.
- Fish swimming is a bounded local animation; without robust room understanding it must not claim collision avoidance or swim through walls accurately.

## 3. Product acceptance criteria
AC01 launch: XR supported → welcome appears, unsupported → clear fallback message; no blank screen.
AC02 spawn: orange square visible ~0.55–0.8m from viewer and ~0.1–0.2m below eye level, oriented toward the hands, world-stable after placement; no continuous head-locking.
AC03 Start Session: begins only on explicit user action; resets paper, current fold, and progress.
AC04 instruction: active dotted crease, curved arrow, moving fold-region highlight, destination ghost, short verb label.
AC05 two hands: both tracked independently; one hand can stabilize, the other can fold; swapping dominant hand supported.
AC06 grab: a pinch inside the current valid fold region (and only that region) activates fold; release outside or invalid pinch does not advance.
AC07 deformation: fold angle follows hand movement along authored hinge; clamp to legal range; no wild flips/jitter.
AC08 snap: if released within calibrated angle AND target-distance tolerances, animate to target over 180–300 ms, lock geometry, play subtle audio, advance exactly once.
AC09 invalid: outside tolerances returns to previous valid state over 250–400 ms, with hint; progress unchanged.
AC10 tracking: loss <300ms freezes active fold; longer loss cancels and safely resets only the active fold; prior steps remain.
AC11 progress: anchored to paper root, readable from typical reach, shows 1..N and current/completed states; updates only on confirmed lock.
AC12 finish: after final validated fold, fish remains visually folded paper, animates tail, swims a short loop, offers replay.
AC13 debug: headset panel shows XR features, hands, pinch distances, active region, fold angle, validation error, FPS and state; panel can be moved/hidden.
AC14 tests: unit tests pass, desktop simulation works, physical Quest acceptance checklist is signed off.

## 4. UX flow and interaction states
Application state machine:
BOOT -> CAPABILITY_CHECK -> READY -> WELCOME -> PAPER_READY -> INSTRUCTION -> GRAB_ARMED -> FOLDING -> (SNAP_PENDING -> SNAP_ANIMATING -> FOLD_LOCKED -> INSTRUCTION | RETURN_ANIMATING -> INSTRUCTION) -> COMPLETION -> CREATURE_ALIVE -> REPLAY.
Separate transient states: HAND_TRACKING_DEGRADED, XR_SESSION_PAUSED, XR_SESSION_ENDED, FATAL_ERROR.
- BOOT: load assets and engine; no fake XR button if unavailable.
- WELCOME: title, one sentence, Start Session, hand tracking tips, optional desktop preview.
- PAPER_READY: stable square with soft edge glow, Start Session in comfortable field of view. Avoid positioning UI where pinch will accidentally grab paper.
- INSTRUCTION: dotted line fades in (300ms), arrow animates (600ms looping), destination ghost appears, foldable face pulses once; prompt 'Pinch highlighted corner and fold to the guide'.
- GRAB_ARMED: fingertip enters region; highlight turns brighter; only pinch transition from open to closed starts grab.
- FOLDING: hand maps to crease angle; stationary face remains stable; show alignment meter, no intrusive tutorial popup.
- SNAP_PENDING: on release, validate; do not lock merely because hand enters target region.
- SNAP_ANIMATING: disable grabbing until complete; progress changes after animation commits.
- RETURN_ANIMATING: elastic but restrained reset; hint 'Bring this edge to the highlighted target'.
- COMPLETION: fold lines fade, fish makes first tail movement, progress shows all completed.
- CREATURE_ALIVE: 2–4 sec small swimming path within forward safe zone; no uncontrolled flight behind player.
- REPLAY: reset mesh, tracked grips, hints, and tracker; do not need to restart XR session.

Transitions must be centralized and deterministic. Ignore duplicate pinch/release events while snapping. XR session end must clean listeners and RAF callbacks. Pause animation on visibility loss.

## 5. Placement and spatial layout
Paper root: initially at viewer-local offset (0, -0.15, -0.65) meters from headset pose at spawn time; freeze transform in world after spawn. Adjust based on actual user reach and seated/standing tests. Paper square: 0.20m x 0.20m. Orient surface approximately facing user with slight 15–25 degree tilt so it reads as a sheet while allowing natural folding. Provide Recenter Paper action (never automatically follow head after placement). Use stable XR local reference space; optionally persist root in session. Progress root: paper-relative offset (+0.16m, +0.10m, +0.015m), auto face camera modestly while remaining nearby; maintain at least 4–6 cm separation from grab regions. Avoid clipping and eye strain. Start UI: above/side, not occluding paper. Debug panel: default right side, draggable with a dedicated grab bar; never grab paper when dragging panel.

## 6. Hand tracking and gesture specification
Input source per hand: XRInputSource with `hand`, handedness; fetch wrist, thumb-tip, index-finger-tip, index-finger-metacarpal, palm-representative joints using XRFrame.getJointPose when supported. Transform all points into common XR reference coordinates. Missing joints -> invalid sample, no NaN propagation.
Pinch metric: `distance(thumbTip, indexTip)`; initial suggested engage <0.025m, release >0.040m; calibrate on Quest Pro and consider hand-size-normalized alternative. Debounce engage 2–3 valid frames; release 2–3 frames. Smooth positions with low-latency adaptive filter; avoid smoothing fold so much that it feels disconnected. Track `handConfidence` from valid pose availability and temporal stability, not invented device confidence.
Valid grab: fingertip/pinch midpoint within projected 2D polygon of the active moving region, plus depth tolerance ~0.035m; reject stationary face and other steps. When valid pinch starts, capture hand and initial angle/pose. One hand moves face, optional second hand pinches hold-zone to stabilize; stabilization is a visual affordance, not a mandatory two-hand simultaneous gesture in MVP. If second hand pinches moving face, do not permit competing ownership; first valid grab wins. For advanced steps, explicitly declare dual-moving-hand requirements; not assumed.
Angle mapping: project grabbed hand displacement onto fold motion plane or derive angle around crease from vector between hinge and hand; calculate signed angle with stable reference normal; clamp to per-step range. Avoid naive world-Y drag mappings. Compute hand-driven angle using initial grab offset to prevent jump on acquisition. For folded multi-layer meshes, map to pre-authored articulated group(s) and prevent interpenetration with layer offsets.
Gesture conflicts: UI pointer actions must be disabled while actively folding; no palm system pinch dependencies; verify Quest system gesture collisions. Handedness agnostic. On tracking loss freeze briefly then rollback active step; show 'Hand tracking lost — show your hands'.

## 7. Paper geometry and fold definition contract
Recommended model: a crease graph with paper vertices (2D UV and rest positions), faces (ordered vertex indices, material/layer), hinges (edge endpoints, moving face IDs, fixed face IDs), and per-step transforms. Use a hierarchical group of foldable faces for simple stages, and **authored snapshots** for topology-changing stages. Geometry must be manifold where appropriate; keep front/back materials orange with subtly different tones; tiny layer offsets 0.3–0.8mm avoid z-fighting. Do not treat crease visuals as physical geometry unless required.

TypeScript interfaces (conceptual; adjust to repo types):
```ts
type Vec2 = [number, number];
type Vec3 = [number, number, number];
type FoldDirection = 'mountain' | 'valley';
interface FaceDefinition { id: string; vertices: number[]; layer: number; materialId: string; }
interface HingeDefinition { id: string; p0: Vec3; p1: Vec3; fixedFaces: string[]; movingFaces: string[]; }
interface GrabRegion { id: string; faceIds: string[]; polygonUV: Vec2[]; allowedHands: 'either'|'left'|'right'; }
interface FoldStep {
  id: string; ordinal: number; title: string; instruction: string;
  fromSnapshotId: string; toSnapshotId: string;
  hinge: HingeDefinition; direction: FoldDirection;
  movingRegion: GrabRegion; optionalHoldRegion?: GrabRegion;
  startAngleDeg: number; targetAngleDeg: number;
  minAngleDeg: number; maxAngleDeg: number;
  angleToleranceDeg: number; targetPointToleranceM: number;
  targetLandmarks: Array<{sourceVertexId: string; target: Vec3}>;
  arrowPathLocal: Vec3[]; creaseLineLocal: [Vec3,Vec3];
  meshStrategy: 'hinge'|'authored-interpolation';
  validationNotes: string;
}
interface OrigamiRecipe {
  id: string; name: string; sheetSizeM: number;
  snapshots: Record<string, { vertices: Vec3[]; faces: FaceDefinition[] }>;
  steps: FoldStep[];
  finalCreatureAsset: string;
}
```
Snapshot IDs are deterministic. A fold must define exactly one expected next snapshot. On lock, replace temporary interactive deformation with authored next snapshot to prevent accumulated numerical drift. Fold engine must validate recipe schema on startup (missing face, hinge endpoints, non-finite coordinates, duplicate step IDs, unreachable targets, malformed polygons). Maintain stable vertex IDs across snapshots where possible; use explicit remapping where topology changes.

### 7.1 Fish recipe authoring — do not guess fold topology
Reference image depicts ~12 numbered stages of an orange paper fish. First action appears to be a vertical half-fold of a square; subsequent actions involve opening, folding a corner, and layered triangle manipulations. Because perspective and small captions obscure geometry, **do not hardcode all 12 fold coordinates from the screenshot**. Create `fish.recipe.ts` with an initially validated 1-step square-to-rectangle fold, then manually author each next stage using a physical-paper reference or precise vector diagrams. Add `docs/fish-fold-map.md` with for each step: top-view before/after diagram, mountain/valley, crease endpoints in normalized UV, fixed faces, moving faces, layering order, grab polygon, target vertices, acceptance tolerances, screenshot evidence, and manual approval status.

### 7.2 First validated fold fixture (phase 3)
Initial square UV corners: A(0,0), B(1,0), C(1,1), D(0,1); centerline x=0.5. Hinge along UV (0.5,0)->(0.5,1). Fixed half x<=0.5; moving half x>=0.5. Target: right half rotates 180° about vertical center crease onto left half. Use `valley` or `mountain` according to face-normal convention; verify visually rather than relying on label. Fold progression 0..180°; snap when angle within 12° and corner alignment within 0.018m, both tunable. Post-fold geometry should show a 10cm x 20cm rectangle with layered right half, not disappear or invert due to backface culling. This is an engineering fixture and may be different from the first fold in the photograph; use it to prove interaction before committing fish recipe.

### 7.3 Authoring checklist for every subsequent fish step
- Confirm before/after paper shape against manual physical fold.
- Author crease and which faces move; define fixed face(s).
- Define direction and target angle, layer order, and target landmarks.
- Identify if step is a hinge fold, squash fold, reverse fold, or needs an authored interpolation.
- Create mesh snapshot and compare silhouette to reference.
- Validate undo/replay; verify face normals and no significant z-fighting.
- Get explicit acceptance of this step before authoring the next.

## 8. Guided folding / magnetic snapping algorithm
1. Load step and show crease/arrow/ghost.
2. On valid pinch, capture active moving region, initial hand vector, initial angle, and step ID.
3. Every XR frame: read joint poses; compute constrained fold angle; update moving face group / authored interpolation; update target error and alignment meter.
4. On release: evaluate `abs(currentAngle-targetAngle) <= angleTolerance` AND `max(targetLandmarkDistance) <= targetPointTolerance`; use both only if landmark definitions are valid. Otherwise fail safely and log recipe error.
5. If valid, animate easeOutCubic to exact target (180–300ms), commit next snapshot, mark step complete, emit one `foldCommitted` event, advance tracker.
6. If invalid, animate back to fromSnapshot, show specific correction, preserve prior completed steps.
7. Prevent further input during transitions. Provide optional accessibility `Assist fold` action in debug/test mode only (not counted as gesture success).
Magnetic assist may softly pull angle near the target while dragging (within e.g. 20°) but must not auto-complete before user releases. Tolerances are calibration defaults, not measured Quest Pro guarantees. Ensure snapping does not pull an unintended corner across the whole paper.

## 9. Instruction overlays and progress tracker
Dotted line follows current crease endpoints and sits 1–2mm above face; update orientation with folded geometry. Curved arrow is an authored local 3D polyline/tube with arrowhead and looping directional motion; animate its opacity/offset without strobing. Ghost target: translucent mesh of moving face at target angle; opacity 0.15–0.25; disable depth-write to prevent artifacts; preserve correct occlusion when possible. Moving region highlight: thin outline or edge glow, not solid fill that hides crease. Prompt text <=1 sentence; default 'Pinch this corner and fold along the dotted line.'
Progress tracker: 12 small numbered circles for full fish (responsive arc or two-row layout if too small), completed = checkmark, active = bright amber, future = neutral; anchored to paper root. For first one-fold fixture, display 1/1; never lie about total fish progress. Step count is read from recipe, not hardcoded. Recenter, Restart, Help, Show/Hide Debug available in separate toolbar.

## 10. Completion and creature animation
When final snapshot is committed: lock paper interactions, wait 350ms, hide guides, transition geometry to final fish rig using authored correspondences or a short crossfade if topology differs (avoid claiming true morph if vertex correspondence absent). Tail oscillates at modest amplitude; fish rotates slightly and follows a bounded Bezier loop within 0.5m of spawn and always forward of user. After ~4 sec, settle in front and show Replay. Ensure fish animation stops on XR pause/end. Add optional quiet paper-rustle, fold snap, and completion sound with user-initiated audio context; mute control. No external models or Blender required: procedural low-poly fish with paper-style faces is acceptable.

## 11. Suggested code architecture
```text
src/
  main.ts
  app/App.ts
  xr/XRSessionManager.ts
  xr/XRCapabilities.ts
  xr/ReferenceSpace.ts
  input/HandTrackingAdapter.ts
  input/PinchRecognizer.ts
  input/HandOwnership.ts
  origami/types.ts
  origami/RecipeValidator.ts
  origami/OrigamiEngine.ts
  origami/CreaseSolver.ts
  origami/FoldValidator.ts
  origami/SnapshotRenderer.ts
  origami/recipes/fish.recipe.ts
  origami/recipes/fixture-half-fold.ts
  ui/WelcomePanel.ts
  ui/FoldGuides.ts
  ui/ProgressTracker.ts
  ui/DebugPanel.ts
  ui/SpatialToolbar.ts
  animation/FishCreature.ts
  state/AppStateMachine.ts
  telemetry/DebugEvents.ts
  desktop/SimulatedHands.ts
  utils/math.ts
  utils/dispose.ts
tests/unit/
tests/integration/
docs/fish-fold-map.md
docs/device-test-log.md
```
Core responsibilities: XRSessionManager owns XR session lifecycle; HandTrackingAdapter converts XR poses to engine coordinates; PinchRecognizer owns hysteresis; HandOwnership arbitrates active grabs; OrigamiEngine owns immutable committed snapshots + mutable current preview; CreaseSolver computes constrained transforms; FoldValidator is pure and unit-testable; UI components subscribe to state and never mutate fold geometry; DebugEvents records structured events and errors. Keep rendering and geometry logic separate from state transitions.

Suggested event model: `xrReady`, `sessionStarted`, `paperSpawned`, `handsUpdated`, `pinchStarted`, `foldGrabbed`, `foldAngleChanged`, `pinchReleased`, `foldValidated`, `foldRejected`, `foldCommitted`, `trackingLost`, `trackingRecovered`, `recipeError`, `creatureStarted`, `sessionEnded`. Include timestamp, step ID, hand, state, angle, target error, and relevant feature flags. Avoid collecting or storing camera imagery or identifying user data.

## 12. Failure and recovery matrix
| Condition | User feedback | Engine response | Recovery |
|---|---|---|---|
| immersive-ar unsupported | 'AR unavailable in this browser' | disable XR launch | desktop preview / supported browser |
| hand tracking missing | 'Hand tracking unavailable' | no active fold | explain browser permissions/support; allow simulator |
| only one hand tracked | 'Show your other hand for two-hand guidance' | allow one-hand fold when valid | continue |
| pinch outside active region | brief region pulse | reject grab | move to highlighted region |
| hand briefly occluded | subtle hold indicator | freeze <=300ms | resume if stable |
| prolonged occlusion | 'Tracking lost; retry this fold' | cancel active fold | return to last committed snapshot |
| wrong fold direction | 'Fold toward the arrow' | constrain angle, show target | reverse direction |
| release too early | 'Almost — bring edge to guide' | rollback active fold | retry |
| duplicate release event | none | idempotent commit | ignore |
| invalid recipe | 'This step is unavailable' + debug detail | stop advancing safely | fix recipe, restart |
| XR session ended | exit message | cleanup listeners/resources | Start XR again |
| low frame rate | reduced guide effects | disable expensive visual effects | debug performance |
| reference space reset | 'Recenter paper' | preserve paper state, update root | user recenter |
| UI occludes grab zone | debug warning | move panel or tracker | drag UI |

## 13. Debug panel requirements
Default hidden for normal users; available via toolbar and optional `?debug=1`. Dark translucent 3D panel with high contrast, large enough for headset readability; grab handle to drag; pin/unpin; collapse; reset position. Sections:
**XR:** session state, immersive-ar supported, requested/granted features, reference space, browser/user agent, frame rate.
**Hands:** left/right tracked, valid joint count, pinch distance (mm), pinch state, wrist/index/thumb position, active owner, dropped frames.
**Origami:** recipe ID, step i/N, snapshot IDs, hinge axis, active face, current angle, target angle, angle error, landmark error, validation result, snap/rollback status.
**UI:** guide visibility, tracker position, current prompt.
**Events:** rolling last 30 structured events, errors with codes and timestamps, copy diagnostics where supported.
**Controls:** show/hide crease, show/hide grab polygons, show/hide axes, pause creature, reset active fold, reset paper, recenter, toggle simulated hands in desktop mode, export session JSON via normal browser download outside XR if supported.
Diagnostics must not block grabbing; pointer interaction on panel has priority only when pointing at panel. Never display raw private camera imagery.

## 14. Performance and quality budgets
Target stable 72 FPS on Quest Pro as an aspirational target, not a guaranteed device/browser mode. Keep frame CPU/GPU timing and actual refresh rate in debug. No per-frame geometry allocations in hot path; cache matrices/vectors and mesh buffers. Minimize transparent overdraw and draw calls. Avoid high-resolution shadow maps; simple unlit/standard materials. Fold input-to-visual latency should feel immediate; target <=2 rendered frames in normal tracking conditions. Paper remains world-stable with no visible drift under stationary-head test. Guard against NaNs and missing XR joint data. Dispose geometry/materials/listeners when restarting and ending sessions.

## 15. Phased Cursor implementation plan and gates
### Phase 0 — Project scaffolding and capability audit
Deliver: Vite + TypeScript + Three.js app; pinned dependency versions; verified IWSDK integration with current examples; HTTPS dev workflow; XR support screen; desktop preview; build/lint/test scripts. Gate: desktop renders and Quest Browser opens HTTPS build, XR session can enter/exit cleanly. Ask user to test and record browser version.
### Phase 1 — Floating paper and spatial UI
Deliver: 20cm orange square; fixed-at-spawn transform; Welcome, Start Session, Recenter; camera-facing readable tracker placeholder; safe distances. Gate: paper reachable and remains stable when user turns head, no controllers required for UI in final.
### Phase 2 — Hand tracking and interaction diagnostics
Deliver: two independent tracked hands, fingertip indicators (debug), pinch recognizer with hysteresis, grab regions, hand ownership, loss handling, drag-enabled debug panel. Gate: 20 successive pinches each hand and 10 alternating pinches without double activation; validate on Quest Pro.
### Phase 3 — One complete live fold (hard gate)
Deliver: authored square-to-rectangle half-fold fixture, dotted center crease, animated arrow, ghost target, real-time hand-driven hinge, validation, magnetic snap, rollback, 1/1 tracker. Gate: 10/10 intentional correct folds complete; 10/10 intentionally early releases do not advance; 5 tracking-loss tests recover; no scripted animation replacing gesture.
### Phase 4 — Origami recipe system
Deliver: recipe schema/validator, snapshot transitions, layer offsets, deterministic fold state, unit tests, desktop recipe inspector, documentation template. Gate: at least two consecutive distinct validated folds without visual corruption and reset works.
### Phase 5 — Full fish recipe authoring
Deliver: `fish-fold-map.md` with verified diagrams and 12 authored stages or the actual verified count; per-step snapshot, crease, region, direction, target, layers; test cases. Gate: each step approved from real paper or exact vector reference; no placeholder geometry passed off as complete. If reference insufficient, pause and ask user for clearer images or video.
### Phase 6 — Creature comes alive
Deliver: fish rig, tail animation, bounded swimming path, completion/replay, optional sounds. Gate: only triggers after all folds; replay 5 times without leaked meshes/listeners or lost interaction.
### Phase 7 — Device hardening and polish
Deliver: debug improvements, occlusion recovery, UI readability, comfort adjustments, perf optimization, accessibility, cross-browser support notes, release README and known limitations. Gate: pass device matrix and record defects/severity.

## 16. Device test plan — physical Quest Pro required
Prerequisites: headset charged; Quest Browser current version recorded; adequate room light; hands unobstructed; stable Wi-Fi; app served via HTTPS; clear play area. Record date, browser version, build hash, handedness, lighting, seated/standing, pass/fail, screenshot/video if available, and issue ID.

| ID | Scenario | Procedure | Expected |
|---|---|---|---|
| Q01 | XR launch | open HTTPS URL and start XR | passthrough + paper, no errors |
| Q02 | XR unsupported | open unsupported browser | clear fallback, no blank page |
| Q03 | Placement | launch seated and standing | paper within comfortable reach |
| Q04 | World stability | turn head and lean sideways | paper stays world-fixed |
| Q05 | Recenter | move then press Recenter | paper relocates without losing progress |
| Q06 | Left pinch | pinch moving region 20 times | >=19 correctly recognized, no ghost grabs |
| Q07 | Right pinch | repeat with right hand | >=19 correctly recognized |
| Q08 | Two hands | stabilize left, fold right | correct ownership and movement |
| Q09 | Hand swap | stabilize right, fold left | symmetric behavior |
| Q10 | Wrong region | pinch stationary region | no fold starts |
| Q11 | Wrong direction | move opposite arrow | constrained, understandable guidance |
| Q12 | Partial fold | release far from target | rolls back, no progress increment |
| Q13 | Near target | release within thresholds | snap completes exactly once |
| Q14 | Double release | rapid open/close around target | no double progress |
| Q15 | Short occlusion | hide folding hand <300ms | frozen then resumes if stable |
| Q16 | Long occlusion | hide hand >300ms | current fold safely cancels |
| Q17 | One-hand only | remove stabilizing hand | optional stabilization doesn't block basic fold |
| Q18 | Tracker | complete each authored step | numbers reflect committed state |
| Q19 | UI drag | drag debug panel near paper | panel moves; paper doesn't fold |
| Q20 | Restart | fold, then restart | original square + step 1 restored |
| Q21 | Session end | exit immersive mode | clean teardown, can relaunch |
| Q22 | Low light | repeat hand gestures in dim room | degrades gracefully; no false completion |
| Q23 | Fast motion | move hands rapidly | no mesh explosion/NaNs |
| Q24 | Layer rendering | view folded model from both sides | correct layering and no z-fighting |
| Q25 | Full fish | complete verified recipe | recognizably folded fish, no skipped steps |
| Q26 | Completion | finish final fold | fish animates once, bounded in front |
| Q27 | Replay | replay 5 cycles | no leaks or broken input |
| Q28 | Performance | run 5+ min with debug | stable measured FPS, no worsening stutter |
| Q29 | UI readability | test varied lighting | guides and labels remain legible |
| Q30 | Safety | turn around / walk away | app doesn't encourage unsafe movement |

Acceptance thresholds Q06/Q07 are initial design targets, not claims of device performance. Log failures rather than masking them with assist mode.

## 17. Automated tests
Unit: pinch hysteresis and debouncing; no tracking poses; coordinate transforms; signed fold angle; angle clamp; target landmark distance; validator boundary conditions; recipe schema errors; idempotent fold commit; progress index; reset/replay. Property tests: angles always finite and clamped, invalid snapshot never committed. Integration desktop: simulated hand pinch drives fold through 0→180°, release snaps; early release rolls back; loss cancels; state machine rejects invalid transitions; 12-step mock recipe progresses deterministically (not proof fish geometry). Visual regression: initial square, midpoint fold, completed rectangle, tracker states, front/back normals. Device tests remain mandatory; desktop tests cannot prove WebXR hand quality.

## 18. Telemetry / privacy
Local in-memory event ring buffer; export only on explicit user action. Do not send raw hand pose streams, camera imagery, room maps, or personal identifiers to servers. Optional anonymous metrics later: fold completion rate, attempts/step, tracking interruptions, average time/step, FPS percentiles. All network analytics off by default in MVP.

## 19. Definition of Done
- Physical Quest Pro passthrough session works and can be exited/re-entered.
- Both hands can grab and guide an actual geometry-changing fold.
- User cannot advance by simply pressing Next or moving a pointer without folding.
- Invalid releases and tracking loss do not corrupt progress.
- All fish steps are manually validated and correctly authored, with no placeholder stages.
- Progress UI accurately follows committed folds.
- Final fish remains visibly origami and comes alive.
- Debug panel is readable, draggable and reports useful failures.
- Tests and build pass; device QA log has no open critical defects.

## 20. Cursor prompt — start here
> Read `FOLD_AND_FLY_PRD.md` fully. Implement **Phase 0 only**. Inspect installed Meta IWSDK docs/examples and select currently valid APIs; do not invent imports. Scaffold Vite + TypeScript + Three.js with a clear XR capability check, immersive-ar launch/exit, desktop preview, tests, and a useful README explaining HTTPS deployment to Quest Browser. Produce a concise architecture summary, exact changed files, commands to run, test results, known Quest-specific unknowns, and a manual Quest Pro validation checklist. **Stop after Phase 0** and ask me to approve before starting Phase 1. Never claim headset testing occurred unless I provide the results.

## 21. Subsequent Cursor prompt template
> Read the PRD and current code. Implement Phase [N] only, respecting all preceding acceptance gates. Begin by stating the intended files, expected headset limitations and test plan. Write code, run lint/typecheck/unit tests/build, and provide exact manual steps for Quest Pro. If blocked by an uncertain SDK API or unverified fish fold geometry, stop and ask a specific question rather than fabricating behavior. Do not proceed to Phase [N+1] without my approval.

## 22. Feature amendment — Free spatial paper relocation (v1.1, 2026-10-14)
**Requirement:** At any point before completion, user can pick up the **entire paper assembly** with a dedicated move handle, translate and rotate it freely within tracked reach, and release it in a new world-stable pose. Fold geometry, current step, and committed progress must remain unchanged. The handle is attached to the paper's root, not to any individual foldable face. Paper may be relocated before Start Session and between folds; during an active fold, user must first release/cancel the fold to move the paper. This resolves ambiguity in 'during folding' without conflicting simultaneous transformations.

**UX:** A small, discoverable 'Move' tab/handle sits 2–4 cm outside a paper edge, never covering a fold region. On hover it glows and shows 'Pinch to move paper'. Pinch-hold the handle to enter MOVING_PAPER; paper follows hand's 6DoF pose using captured hand-to-root offset (no jump). Release freezes paper in its new local-reference-space pose. Optional second hand can grab a second move handle to rotate and uniformly scale in a later enhancement; scaling is out of MVP to preserve fold geometry and readable controls. The Move handle should remain accessible after any fold, repositioning itself relative to the current paper bounding box.

**Interaction arbitration:** UI pointer > move handle > active fold region > background. One pinch can own only one action. While MOVING_PAPER, disable fold acquisition, snap and validation; while FOLDING/SNAP_ANIMATING, disable move acquisition. If user tries to move while actively folding, show 'Release fold to move paper'. A second hand may stabilize the paper during a fold but must not translate the root. When moving, fold animation progress is frozen and resumed when released.

**Scene graph:** `worldRoot -> paperPoseRoot -> {foldMeshRoot, creaseGuideRoot, arrowRoot, progressRoot, moveHandleRoot}`. Keep all fold geometry in paper-local coordinates. Apply relocation only to `paperPoseRoot.position/quaternion`, and update any world-space hand/grab calculations using inverse root transform. Recalculate camera-facing text orientation and avoid placing progress UI over the user's hands. Preserve root pose on step transition and rejected fold; Recenter explicitly resets root pose to a comfortable viewer-relative location without resetting fold progress.

**Tracking loss and safety:** Loss of the owning hand during movement freezes the paper immediately; after ~300 ms, release ownership and keep the last valid pose. Do not teleport to the initial location. Clamp movement to a configurable reachable radius and minimum viewer distance, with a soft warning instead of abrupt snapping. If the paper is lost from view, Recenter remains accessible via an independent head-relative toolbar. Never auto-follow the head after release. If the user moves into an unsupported physical surface, do not claim real-world collision prevention.

**New state/events:** Add `MOVING_PAPER` as an orthogonal exclusive interaction mode entered from `PAPER_READY` or `INSTRUCTION` (and after a fold is locked); exit back to prior state on release/loss. Add `paperMoveStarted`, `paperPoseChanged`, `paperMoveEnded`, `paperMoveCancelled`, `paperRecentered` debug events with hand, old/new pose and reason. Expose paper pose (XYZ meters and quaternion), active grab owner, move mode, hand tracking confidence in debug panel. Add a 'Show move handle' toggle and 'Recenter paper' action.

**Acceptance:** (1) User can grab/reposition/release the whole square with either hand 20 times without false fold starts. (2) Repeat after steps 1, 3 and 6; geometry and step index unchanged. (3) Paper, crease, arrow, progress and handle travel together with no visible drift. (4) Releasing holds the world-space pose while user turns head. (5) Tracking loss mid-move freezes safely and allows reacquisition. (6) Recenter works even if paper is out of view. (7) Moving and folding never execute from the same pinch. (8) Tests verify parent transform and inverse-coordinate fold solver, state exclusivity, and persisted step after move. Include Quest Pro seated and standing testing.

**Implementation sequencing:** Insert Phase 2A after hand tracking/grab primitives and before complex fold mechanics: implement `PaperMoveController`, handle hit target, input arbitration, pose ownership, and debug telemetry. Gate the phase on tests (1), (3), (4), (5), (7). Re-run all fold tests after Phase 3 to confirm fold behavior in rotated/translated paper coordinates. No additional room mapping, anchors, or permissions required for world-stable pose within the active XR session.

## 23. Reference-video screenshot amendment (v1.2, 2026-10-14)

**Status:** User provided eleven ordered screenshots (`1.png` through `11.png`) of a pink-paper origami fish tutorial. These are **keyframes, not the full video**; intermediate gestures and exact crease coordinates cannot be verified from stills. This tutorial may represent a different fish recipe from the original orange-paper Turkish diagram. **Do not combine their steps into one unverified recipe.** Make this screenshot sequence the candidate `fish-pink-reference` recipe, retaining the original as a separate reference.

### Observed keyframes and required capabilities

1. `1.png`: flat square sheet, tutorial starting pose.
2. `2.png`: square folded diagonally into a triangular shape; corner alignment and crease creation.
3. `3.png`: hand presses a triangular fold; crease setting/flattening.
4. `4.png`: paper reopened to a square with diagonal crease traces; **unfold must preserve crease history**.
5. `5.png`: paper folded in half into a horizontal rectangle; edge alignment.
6. `6.png`: intermediate layered triangular form, a small projecting flap; exact collapse order not established.
7. `7.png`: one triangular flap is manipulated across the body; selective face/layer control.
8. `8.png`: user smooths/presses a triangle; crease-set gesture or equivalent guided confirmation.
9. `9.png`: layered paper is lifted/opened; requires multi-face motion, not a single flat hinge.
10. `10.png`: overlapping flaps converge near the top; track face ordering and avoid z-fighting.
11. `11.png`: later-stage triangle with protruding tail elements; shape requires visual validation against finished red fish shown in earlier frames.

**Important:** Screenshot numbers above reflect filenames and do not guarantee chronological order. The uploaded collage suggests the order of frames 6–11 may be reversed relative to the actual tutorial; the visible timestamp in the screenshots should be used where legible. Do not mark the fold sequence verified until the source video or complete ordered frames are reviewed.

### New functional requirements

- **Unfold/re-fold:** Opening a previously folded section does not erase crease history; preserve face topology, creases, and step completion independently. Model `FOLD`, `UNFOLD`, `COLLAPSE`, `FLAP_FOLD`, and `CREASE_PRESS` action types, rather than assuming every step is a single hinge.
- **Crease graph:** Distinguish latent/precreased lines, active instructional line, and locked creases. Maintain mountain/valley direction and crease persistence across intermediate unfolded shapes.
- **Multi-crease collapse:** Use authored coupled transforms or mesh snapshots with interactive scalar progress; don't fake arbitrary origami physics. All transitions must preserve coherent paper silhouette and layer order.
- **Layer selection:** Allow only the currently highlighted top flap/face to be grabbed. A stabilizing pinch on an underlying face must not pull the whole assembly.
- **Crease setting:** For pressing/flattening gestures, provide an accessible pinch-and-hold or tap-confirm fallback rather than requiring physical force sensing (unavailable through WebXR hand joints).
- **Spatial relocation:** Moving the entire paper through its Move handle remains available between steps, including after unfolding and during layered stages. Active folding and whole-object moving remain mutually exclusive.
- **Guides and validation:** Per action, define moving faces, stationary faces, hinge(s), target landmarks, grab zones, tolerance, correct layer order, rollback state, and hint/ghost. Progress increments only on validated action completion, including unfolding when it is a tutorial step.
- **Final creature:** Match the fish silhouette in the tutorial (triangular body and protruding tail), then animate tail and swim; use a rigged final folded-paper model if continuous vertex morph is not feasible.

### Recipe authoring gate (mandatory before claiming full fish complete)

Create `docs/fish-pink-reference-fold-map.md` with one entry per **actual instructional action**, including source frame/timestamp, before/after orthographic diagrams, crease endpoints in normalized paper UV, mountain/valley designation, faces/layers, moving and stationary region, gesture, target alignment, interactive interpolation method, and QA approval. Reconstruct missing actions using the original video or a physical paper build. Number the progress circles from the **verified action count**, not from screenshot count or a hardcoded 12.

### Additional Quest Pro device tests

- R01: diagonal fold then unfold: correct square silhouette and persistent diagonal crease.
- R02: horizontal fold after precreases: no mesh tearing, missing faces, or stale hinge constraints.
- R03: multi-crease collapse: animated face transitions remain coherent at 0%, 25%, 50%, 75%, 100%.
- R04: overlapped layers: only highlighted top flap moves, bottom flap stays fixed.
- R05: pressing/flattening: interaction can complete without pressure sensors; no false completion from hovering.
- R06: relocate after unfold and after layered fold: paper-local crease graph, hints, and progress remain aligned.
- R07: wrong layer grabbed or tracking occluded: hint appears and action safely resets without progress loss.
- R08: fish silhouette matches verified reference; final animation only triggers after all authored actions pass.
