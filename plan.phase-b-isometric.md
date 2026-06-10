# 👁️ Heaveneye — Phase B: Isometric Office

> **Initiative:** ยกระดับ OfficeMap จาก flat 2D → isometric 2.5D office (มุมเฉียง SimCity vibe)
> Author: Ji Ziyue · For: An Maioyi + team · Date: 2026-06-02
> **Approach locked:** fake-iso 2.5D (diamond projection) — ไม่ใช่ CSS 3D rotate, ไม่ใช่ PixiJS

---

## 0. อ่านก่อนเริ่ม (สำหรับ An Maioyi + ทีม)

1. `result.md` — รู้ว่า ship อะไรแล้ว (OfficeMap ปัจจุบัน flat 2D)
2. ไฟล์นี้ — Phase B roadmap + task breakdown
3. **กฎเหล็ก (เรียนจากที่ผ่านมา):**
   - 1 task = 1 PR เล็กๆ · acceptance วัดได้ · ji-ziyue audit ทุก task ก่อน mark done
   - `bunx tsc --noEmit` exit 0 + `bun run build` pass **ก่อน** complete ทุก task
   - **ห้ามเพิ่ม npm dep ใหม่** (ใช้ motion/react + CSS ที่มี) — bundle ตอนนี้ 382kB อย่าให้บวม
   - **ต้องมี handoff comment** ตอน complete (ตาม kanban-handoff-protocol)
   - ห้ามแตะ chat/spawn/WS (ถูก pivot ออกแล้ว)

---

## 1. ทำไม fake-iso 2.5D (ไม่ใช่ 3D transform / PixiJS)

| วิธี | ทำไมไม่เลือก |
|------|--------------|
| CSS 3D `rotateX/Z` | character ต้อง counter-rotate ให้ตั้งตรง + z-order ยุ่ง → ทีมพลาดง่าย |
| PixiJS เต็มเกม | +250kB dep, paradigm ใหม่, เสี่ยง (เหมือน v2 chat) |
| **fake-iso 2.5D ✅** | projection ด้วย math ล้วน, character billboard ตั้งตรงเอง, z-sort ตรงไปตรงมา, +0kB |

**หลักการ:** วาง element ด้วย isometric projection formula — floor เป็น diamond tiles, ตัวละครเป็น flat billboard วางบน tile (ไม่ rotate). เกม 2.5D ส่วนใหญ่ทำแบบนี้

---

## 2. Core math — isometric projection (ใช้ทุก task)

```ts
// grid coord (col, row) → screen percent (x, y) within the office container
// tile size in % units; tune TILE_W/TILE_H for look
const TILE_W = 13;   // half-width of a diamond tile (%)
const TILE_H = 6.5;  // half-height (%)
const ORIGIN_X = 50; // center the grid horizontally (%)
const ORIGIN_Y = 14; // top padding (%)

function isoProject(col: number, row: number): { x: number; y: number } {
  return {
    x: ORIGIN_X + (col - row) * TILE_W,
    y: ORIGIN_Y + (col + row) * TILE_H,
  };
}

// Depth sort: things "lower/closer" (higher col+row) render on top
function depthZ(col: number, row: number): number {
  return Math.round((col + row) * 10);
}
```

### Grid layout — agent positions (col, row)
```ts
const ISO_GRID: Record<AgentId, { col: number; row: number }> = {
  ziyue:    { col: 2,   row: 0 },   // top — Core Room
  anmaioyi: { col: 2,   row: 2 },   // middle — Review Bay
  wenshu:   { col: 0,   row: 4 },   // bottom row — Developer Bay
  yanxin:   { col: 1,   row: 4 },
  jianfeng: { col: 2,   row: 4 },
  shihao:   { col: 3,   row: 4 },
  yefan:    { col: 4,   row: 4 },
};
```
> ปรับ TILE_W/H + col/row ได้ตามที่ดูดี — ji-ziyue จะ review จากภาพจริง

---

## 3. Task breakdown (sequential — shihao ทำ, ji-ziyue audit ทีละตัว)

### B1.1 — Iso projection util + diamond floor (shihao)
**ไฟล์:** `web/src/components/OfficeMap.tsx` (+ อาจแยก `web/src/lib/iso.ts`)
- เพิ่ม `iso.ts` — export `isoProject`, `depthZ`, `ISO_GRID`, `TILE_W/H`
- Render floor: diamond tiles grid (เช่น 5×5) — แต่ละ tile = `<div>` rotate 45° + scaleY 0.5 (หรือ clip-path polygon diamond), สีสลับจางๆ ให้เห็น checkerboard เบาๆ
- ลบ blueprint grid เดิม (flat) ออก
- **Acceptance:** เห็นพื้น diamond iso วางเฉียง · tile ไม่ทับซ้อนมั่ว · tsc + build pass

### B1.2 — Desks + agents เป็น billboard บน iso grid (shihao)
- เปลี่ยน positioning จาก `DESK_COORDS` (%) → `isoProject(ISO_GRID[id])`
- Desk = iso box เล็ก (diamond top + 2 side faces ด้วย CSS) วางที่ tile ของแต่ละ agent
- Avatar = billboard (flat, ตั้งตรง — **ไม่ rotate**) วาง "ยืน" บน tile (yกระเถิบขึ้นจาก tile center นิดหน่อย)
- **z-index = `depthZ(col,row)`** → ตัวหน้า/ล่างบังตัวหลัง ถูกต้อง
- **Acceptance:** 7 ตัวยืนบนพื้น iso ลำดับ depth ถูก (ตัวล่างทับตัวบน) · ไม่มี label ซ้อน (เก็บ pattern ก้อนเดียวจาก v2.4) · tsc + build pass

### B1.3 — Sprite-ready character (emoji fallback) (shihao)
**สำคัญ — ทำให้พี่เบญ drop รูปแล้วใช้ได้ทันที ไม่ต้องแก้ code อีก**
- เพิ่ม map: `const CHARACTER_SPRITE: Record<AgentId, string> = { ziyue: '/characters/ziyue.png', ... }`
- Billboard render logic:
  ```tsx
  // ถ้าไฟล์ sprite โหลดได้ → <img>, ถ้า error/ไม่มี → fallback RiveAvatar (emoji เดิม)
  const [spriteOk, setSpriteOk] = useState(true);
  {spriteOk
    ? <img src={CHARACTER_SPRITE[id]} onError={() => setSpriteOk(false)} className="w-16 h-16 object-contain" />
    : <RiveAvatar id={id} status={status} color={color} size="sm" />}
  ```
- ไฟล์ sprite จะอยู่ `web/public/characters/<id>.png` (ji-ziyue วางให้ — ตอนนี้ยังไม่มี, fallback emoji ทำงานไปก่อน)
- **Acceptance:** ยังไม่มีไฟล์ = เห็น emoji (ไม่พัง) · มีไฟล์ = เห็น sprite · tsc + build pass

### 🐛 B1.3b — Fix iso layout balance + sprite anchor (shihao) — **ทำก่อน B1.4**

**พบตอน B1.3 sprite ขึ้นจอ (พี่เบญ capture 2026-06-03) — layout เพี้ยนหนัก. ji-ziyue ยืนยันด้วย math:**

| agent | (col,row) | x% | ปัญหา |
|-------|-----------|-----|-------|
| wenshu | (0,4) | **-2** | 🔴 หลุดขอบซ้าย มองไม่เห็นเต็มตัว |
| ziyue | (2,0) | 76 | 🔴 ไปขวาบน แทน top-center |
| anmaioyi | (2,2) | 50 | กลาง (ok) |
| yanxin/jianfeng/shihao/yefan | (1-4,4) | 11/24/37/50 | เรียงทแยงลง ไม่ใช่แถวล่างสมดุล |

x range = -2..76, เฉลี่ย 35 (ควร ~50) → **เบี้ยวซ้าย + ขวา 24% ว่าง**

**Root cause:** `isoProject(col,row)` projection ของ ISO_GRID ปัจจุบันไม่ balanced — ค่า col/row ที่เลือกทำให้ projected points กระจายเบี้ยวซ้าย + บางตัวหลุดขอบ

**งาน (`web/src/lib/iso.ts` + `OfficeMap.tsx`):**
1. **Auto-fit projection** — แทนการ hardcode ORIGIN_X/Y: คำนวณ bounding box ของ projected coords ทุก agent → normalize ให้ fit + center ในกรอบ (มี padding ~10% ขอบ). ไม่มีใครหลุดขอบ, ใช้พื้นที่เต็ม, สมดุลซ้าย-ขวา
   - หรือถ้าจะ keep simple: ปรับ ISO_GRID coords + ORIGIN ใหม่ให้ x range อยู่ ~10..90 สมดุลรอบ 50
2. **Sprite anchor** — ตัวละคร billboard ต้อง "ยืนบน" desk tile (เท้าแตะ top diamond ของ desk) ไม่ลอยเหนือ desk
3. **Label ไม่ซ้อน** — name+role+status ของแต่ละตัวต้องไม่ทับ desk/label ของตัวอื่น (โดยเฉพาะ anmaioyi/yefan ที่อยู่แนวตั้งใกล้กัน)

**Acceptance (ji-ziyue audit):**
- ตัวละครทั้ง 7 อยู่ในกรอบครบ (ไม่มีใครหลุดขอบ — ตรวจ wenshu โดยเฉพาะ)
- layout สมดุล ใช้พื้นที่เต็ม (ไม่เบี้ยวซ้าย, ไม่มีโซนว่าง 24%)
- sprite ยืนบน desk ตรง (เท้าแตะ tile)
- label ไม่ซ้อนกัน
- `bunx tsc --noEmit` exit 0 · `bun run build` pass
- handoff comment ครบ

### B1.4 — Port waddle + delivery animation ไป iso coords (shihao)
- ของเดิมมี waddle walk + speech bubble + sparkle (v2.0/Tier 0) — port มาทำงานบน iso position
- ตอน specialist done/blocked → เดิน (tween iso position) ไปหา anmaioyi tile + speech bubble + sparkle
- ระวัง: z-index ต้อง update ระหว่างเดิน (depthZ เปลี่ยนตาม position)
- **Acceptance:** trigger task done → ตัวละครเดินบนพื้น iso ไปหาเมี่ยวอี + ฟอง speech + กลับที่เดิม · tsc + build pass

### B1.5 — Depth polish (shihao)
- เพิ่ม ellipse shadow ใต้ตัวละคร (ground contact)
- Room zone tint บน iso plane (Core/Review/Developer) — 3 โซนสีจาง
- Hover: ตัวละครเด้งขึ้นเล็กน้อย + ring
- **Acceptance:** เงาใต้ตัว · 3 โซนเห็นชัด · hover ทำงาน · tsc + build pass

---

## 4. Out of scope (Phase B1 — อย่าทำ)
- ❌ 8-direction walk sprite (billboard ทิศเดียวพอ)
- ❌ PixiJS / canvas / WebGL
- ❌ pathfinding A* (เดินเส้นตรง tween พอ)
- ❌ npm dep ใหม่
- ❌ asset generation (พี่เบญทำเองด้วย Nano Banana → ji-ziyue วางไฟล์)

## 5. Definition of Done (Phase B1)
- [ ] พื้น iso diamond + desks + 7 ตัวละคร billboard ลำดับ depth ถูก
- [ ] sprite-ready (drop PNG → ใช้ได้, ไม่มีไฟล์ → emoji fallback)
- [ ] waddle delivery animation ทำงานบน iso
- [ ] เงา + room zones + hover polish
- [ ] `bunx tsc --noEmit` exit 0 · `bun run build` pass · bundle ไม่บวมเกิน +10kB
- [ ] ji-ziyue audit ผ่านทุก sub-task

---

_Phase B1 spec by Ji Ziyue 2026-06-02. Asset (Nano Banana) แยกราง — พี่เบญ gen, ji-ziyue normalize + วาง `web/public/characters/`. Phase B2 (PixiJS เต็มเกม) = initiative แยก ไม่ delegate._
