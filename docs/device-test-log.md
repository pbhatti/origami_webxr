# Fold & Fly — device test log

Physical Quest Pro results only. Do not mark headset checks as passed from desktop.

| Field | Value |
| --- | --- |
| Date | |
| Tester | |
| Build | origami-whale · 6 stages |
| Machine URL | `https://<lan-ip>:8082` |
| Quest Browser version | |
| Headset | Quest Pro |
| Lighting | |
| Seated / standing | |
| Notes | Live recipe is origami-whale, 6 stages. |

## Phase 0 checks

| ID | Scenario | Result | Notes |
| --- | --- | --- | --- |
| Q01 | Open HTTPS URL, tap Start Session | pass / fail | Passthrough, no blank screen, paper preview visible |
| Q02 | Open in an unsupported browser | pass / fail | "AR unavailable in this browser", desktop preview still renders |
| Q21 | Exit immersive mode, then relaunch | pass / fail | Clean teardown, Start Session works again |
| P0-HTTPS | HTTP vs HTTPS | pass / fail | HTTP must not pretend XR is available |
| P0-HAND | After session start, debug features | pass / fail | Record whether `hand-tracking` appears in enabledFeatures |
| P0-REF | Reference space | pass / fail | Record local-floor / local / viewer fallback used |

## Phase 1 checks

| ID | Scenario | Result | Notes |
| --- | --- | --- | --- |
| Q03 | Placement seated and standing | pass / fail | Paper within comfortable reach |
| Q04 | World stability | pass / fail | Turn head / lean; paper stays world-fixed |
| Q05 | Recenter | pass / fail | Paper relocates; tracker still 0/8 until a fold commits |
| Q20 | Restart | pass / fail | Square restored; progress 0/8 |
| P1-UI | Toolbar vs paper | pass / fail | Recenter/Restart do not sit on the sheet |
| P1-TRACK | Tracker | pass / fail | Readable, faces you modestly, shows 0/8 not 12 |

Copy console `[FoldFly]` lines into notes if a check fails.

## Phase 2 checks

| ID | Scenario | Result | Notes |
| --- | --- | --- | --- |
| Q06 | Left pinch moving region 20 times | pass / fail | >=19 recognized, no ghost grabs |
| Q07 | Right pinch 20 times | pass / fail | >=19 recognized |
| Q08 | Two hands: stabilize left, pinch right | pass / fail | ownership does not fight |
| Q09 | Hand swap: stabilize right, pinch left | pass / fail | symmetric |
| Q10 | Pinch stationary (left) half | pass / fail | no fold grab |
| Q15 | Hide folding hand <300ms | pass / fail | freeze then resume |
| Q16 | Hide folding hand >300ms | pass / fail | active grab cancels |
| Q17 | One-hand only | pass / fail | hold is optional |
| Q19 | Drag debug panel near paper | pass / fail | panel moves; paper does not grab |
| P2-DOTS | Debug fingertip dots | pass / fail | left/right index + thumb visible when tracked |

## Phase 3–4 checks (live hinge)

| ID | Scenario | Result | Notes |
| --- | --- | --- | --- |
| Q11 | Move opposite the arrow | pass / fail | angle stays ~0°, no commit |
| Q12 | Partial fold, release early | pass / fail | rolls back, tracker stays 0/8 |
| Q13 | Release near ghost | pass / fail | snaps once, tracker 1/8 |
| Q14 | Rapid open/close around target | pass / fail | no double progress |
| Q18 | Tracker | pass / fail | 0/8 … 8/8, never 12 |
| P3-HINGE | Fold follows the pinch | pass / fail | not a scripted auto-fold |
| P3-GUIDES | Crease, arrow, ghost | pass / fail | ghost hides while folding |
| P4-RESET | Restart after a commit | pass / fail | square + step 1 restored |

## Phase 5–7 checks (Seda fish)

| ID | Scenario | Result | Notes |
| --- | --- | --- | --- |
| Q25 | Full diagram fish | pass / fail | Complete all 8 authored folds; silhouette should read as a fish |
| Q26 | Completion | pass / fail | After 8/8 the folded sheet swims in front, bounded |
| Q27 | Replay 5 cycles | pass / fail | square returns, pinch still works, no duplicate fish |
| Q28 | Performance 5+ min with debug | pass / fail | record FPS from the debug panel |
| Q29 | UI readability | pass / fail | guides and labels in passthrough light |
| Q30 | Safety | pass / fail | no prompt to walk into furniture |

## PRD v1.2 checks (pink-paper candidate)

Physical Quest Pro only. Do not mark passed from desktop.

| ID | Scenario | Result | Notes |
| --- | --- | --- | --- |
| R01 | Diagonal fold then unfold | pass / fail | Square silhouette; diagonal crease remains |
| R02 | Horizontal fold after precreases | pass / fail | No tearing, missing faces, or stale hinges |
| R03 | Multi-crease collapse | pass / fail | Coherent at 0 / 25 / 50 / 75 / 100% |
| R04 | Overlapped layers | pass / fail | Only highlighted top flap moves |
| R05 | Press / flatten | pass / fail | Completes by pinch-and-hold; hover does not |
| R06 | Relocate after unfold and layered fold | pass / fail | Creases, hints, progress stay paper-local |
| R07 | Wrong layer or tracking occluded | pass / fail | Hint; action resets; progress kept |
| R08 | Final silhouette then swim | pass / fail | Animation only after all 8 actions + silhouette |

## Whale checks (Phase 1+)

Physical Quest Pro only.

| ID | Scenario | Result | Notes |
| --- | --- | --- | --- |
| W01 | Diamond spawn | pass / fail | Orange diamond at reach, not an axis-aligned square |
| W02 | Stage 1 half-fold | pass / fail | Bottom corner to top; snaps to triangle |
| W03 | Stage 2 unfold + two kites | pass / fail | Tracker stays on 2 until both inward folds snap |
| W04 | Move handle mid-fold | pass / fail | Relocate does not reset creases |
| W05 | Head and tail | pass / fail | Blunt head, tail up; no silent flip |
| W06 | Completion | pass / fail | 6/6, eye, bounded swim, Replay restores diamond |

## Known limitations

- Live recipe is origami-whale (6 stages). Fish recipes are unused references.
- Panel 5 turn-over is not auto-applied.
- Debug **A** assists a fold and must not be used as evidence of gesture quality.
