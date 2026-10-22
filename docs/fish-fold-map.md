# Fish fold map

Source: **BALIK MODELİ KATLAYALIM** (@origamist seda). 20 cm virtual sheet. The poster numbers ①–⑭; ④ and ⑭ are notes, ⑫ is skipped. **Verified live count: 8 folds.**

| Recipe step | Poster | Action | Mesh |
| --- | --- | --- | --- |
| 1 `book-fold` | ② | Right edge to left, vertical crease | Live hinge 180° |
| 2 `packet-square` | ③–④ | Bottom short edge to top | Live hinge 180° |
| 3 `squash-front` | ⑤–⑥ | Open top square, squash to triangle | Pinch-driven interpolation |
| 4 `flip-packet` | ⑦ | Turn the packet over | Live hinge 180° |
| 5 `squash-back` | ⑧–⑨ | Squash remaining square to diamond | Pinch-driven interpolation |
| 6 `tuck-bottom` | ⑩ | Lower kite edge in | Live hinge 180° |
| 7 `tuck-top` | ⑪ | Upper kite edge in | Live hinge 180° |
| 8 `tail-back` | ⑬–⑭ | Short tail flaps back | Pinch-driven interpolation |

Recipe id: `seda-fish`. Tracker `0/8` → `8/8`.

Squash folds are not a single hinge in real paper. They still follow the pinch (0°→180° interpolates snapshots). They are not a scripted auto-fold.

## Coordinates (paper-local meters, sheet 0.20)

Square corners `A(-0.10,-0.10)` `B(0.10,-0.10)` `C(0.10,0.10)` `D(-0.10,0.10)`.

After step 1 the packet is the left rectangle `x ∈ [-0.10, 0]`. After step 2 it is the upper-left square `x ∈ [-0.10, 0]`, `y ∈ [0, 0.10]`. The diamond is that square rotated 45° about `(-0.05, 0.05)`.

| Step | Crease | Moving UV | Status |
| --- | --- | --- | --- |
| 1 | `x=0` | right half | Authored from diagram ② + proven fixture |
| 2 | `y=0` on the rectangle | bottom short edge | Authored from diagram ③ |
| 3 | right edge of packet | small square | Authored from diagram ⑤–⑥ |
| 4 | horizontal through packet center | packet | Authored from diagram ⑦ |
| 5 | right edge of packet | small square | Authored from diagram ⑧–⑨ |
| 6 | horizontal inset on lower kite | lower diamond | Authored from diagram ⑩ |
| 7 | horizontal inset on upper kite | upper diamond | Authored from diagram ⑪ |
| 8 | vertical near the right point | tail | Authored from diagram ⑬ |

Poster ① is the starting square. ④ and ⑭ are captions, not extra creases.
