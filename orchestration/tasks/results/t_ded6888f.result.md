# t_ded6888f result — Heaveneye Pass 02 W3: Rive Avatars

## Summary
Refactored `RiveAvatar.tsx` — enhanced emoji fallback with per-agent identity icons, richer CSS animations, and amber pulse ring for blocked state.

## Files modified

### web/src/components/RiveAvatar.tsx
- Added agent-specific emoji map with `shihao: 🛠️` and `yefan: ⚡` (no generic 👤 fallback for these two)
- Added `anim-pulse-amber` for `blocked` status
- Added amber glow box-shadow ring for blocked state (amber pulsing overlay div)
- Color-matched `drop-shadow` filter on emoji that activates for non-idle states
- Extracted `DIM_CLASS` constant map for size

### web/src/styles.css
- Added `@keyframes pulse-amber` (opacity + scale pulse)
- Added `.anim-pulse-amber` CSS class

## Status → Animation mapping
| Status | CSS class | Visual |
|--------|-----------|--------|
| `idle` | `anim-breathe` | slow scale breathing, grayscale 40% |
| `thinking` | `anim-breathe` | slow scale breathing |
| `working` | `anim-wiggle` | rotation wiggle ±3° |
| `done` | `anim-bounce` | bounce-soft translateY |
| `blocked` | `anim-pulse-amber` | opacity + scale pulse, amber glow ring |

## Rive .riv note
No .riv files found in `web/public/rive/`. Community marketplace (rive.app/community) returned 404. Flag: **ตัวเลือกว่างกว่าไม่มี animation studio quality** — emoji fallback is acceptable. `@rive-app/react-canvas` is in package.json and can be wired up when a suitable .riv asset is sourced.

## Verification
Dashboard at localhost:5173 — all 7 agents render with distinct emoji, shihao (🛠️) and yefan (⚡) confirmed non-generic.