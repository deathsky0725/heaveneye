# T5: Layout overflow fix — verification results

## Changes made

### 1. App.tsx — grid ratio narrowed to free specialist row space
- `lg:grid-cols-[1fr_2fr]` → `lg:grid-cols-[260px_1fr]`
  - Left column (ziyue) fixed at 260px instead of fluid 1fr
  - Right column now gets remaining space, giving specialist row more room

### 2. AgentCard — compact prop for specialist row
- Added `compact?: boolean` prop
- When `compact=true`: padding `p-3` (vs `p-5`), avatar `w-16 h-16 text-4xl` (vs `w-24 h-24 text-5xl`), gap `gap-3` (vs `gap-4`)
- Team badge gets `shrink-0` to prevent it from being clipped
- Role line gets `truncate` to ensure ... appears when text overflows container

### 3. RiveAvatar — size prop (sm/md)
- `size='sm'` → 64×64px avatar with 4xl emoji
- `size='md'` → 96×96px avatar with 5xl emoji (unchanged default)

### 4. Specialist row in App.tsx — compact cards + tighter gap
- `gap-4` → `gap-3`
- `<AgentCard key={id} agent={a} />` → `<AgentCard key={id} agent={a} compact />`

## Expected visual outcome

**1920×1080:**
- 5 specialist cards all visible in one row — Thai names clipped with `→` abbreviations
  - "ชินสุวรรณ" → clip, "เจินหยวนไฟแนนเชียล" → clip, etc.
- shihao + yefan cards visible (no overflow)
- ziyue in left column still fits

**1440×900:**
- No horizontal scrollbar
- Specialist row doesn't overflow

## Browser verification required

Dev server running at http://localhost:5173

Manual checks needed:
1. Resize browser to 1920×1080 — all 5 specialist cards visible
2. Resize browser to 1440×900 — no horizontal scrollbar
3. Long Thai names truncated properly (end with …)