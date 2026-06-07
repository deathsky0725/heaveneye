# 🌱 Heaveneye — Phase C: Liveness / Task-Driven Office

> **เจตนา:** Phase B1 ได้ static isometric office + waddle/delivery + depth polish แล้ว. Phase C ทำให้ office **"มีชีวิต"** และการเคลื่อนไหว **สะท้อน task flow จริง** — ไม่ใช่แค่ตัวนิ่งรอ status เปลี่ยน
>
> **Vision พี่เบญ:** "ตัวการ์ตูนคนทำงาน เดินไปส่งงานให้กันหลังคนนี้ทำเสร็จ" → idle ก็ต้องดูมีชีวิต, working ต้องเห็นว่ากำลังทำ, ส่งงานต้องส่งตาม dependency จริง

---

## สถานะปัจจุบัน (ก่อน Phase C) — อ่านก่อนเริ่ม

`web/src/components/OfficeMap.tsx` ตอนนี้:
- **delivery walk** = real status-transition driven: `useEffect([agents])` จับ prev→next, ถ้า next ∈ {blocked, done} และไม่ใช่ ziyue/anmaioyi → `triggerWalk(agent, 'anmaioyi')` → เดินไปโต๊ะเมี่ยวอี (semicircle DELIVERY_OFFSETS) → speech bubble + sparkle 2.4s → กลับ home → หยุด waddle
- **waddle** = rotate + y-bob ระหว่างเดิน (`waddleTransition`, 0.15s mirror)
- **idle** = ตัวนิ่งสนิท (มีแค่ thought bubble ตอน thinking)
- **working** = ไม่มี pose เฉพาะ — แยกจาก idle ได้แค่ status pill เปลี่ยนสี
- **handoff** = ทุกคนเดินไป anmaioyi เท่านั้น (ยังไม่ใช่ worker→worker ตาม dependency)
- `lib/iso.ts` = isoProject / depthZ / isoUnproject / computeAutoFit / ISO_GRID

`agents` มาจาก store (`/api/agents` + SSE `/api/stream`) = real data. AgentStatus = idle | thinking | working | blocked | done (+ failed?).

---

## กฎรวม Phase C (ทุก sub-task ต้อง follow)

1. **ห้าม npm dep ใหม่** — ใช้ motion/react (มีอยู่แล้ว). bundle ceiling **≤ 392 kB** (ปัจจุบัน 384.63 → เหลือ ~7 kB งบ)
2. **ห้ามรื้อ B1** — iso projection, delivery walk, depth z-sort, room zones ต้องคงเดิม ต่อยอดเท่านั้น
3. **ทำทีละ sub-task ตามลำดับ** C0 → C1 → C2 → C3 → C4. ji-ziyue audit ทุก task ก่อน mark done
4. **animation ต้องไม่ jank** — 7 ตัว animate พร้อมกันต้อง smooth (ใช้ transform/opacity, เลี่ยง layout-triggering props)
5. **respect motion preference** — `prefers-reduced-motion` → ลด/ปิด idle bob (a11y)
6. Worker: shihao/yefan (fullstack). assignee ระบุชัดต่อ task. handoff comment ครบ (files + key logic + verify + commit ref) + `bunx tsc --noEmit` exit 0 + `bun run build` pass ก่อน complete

---

## Sub-tasks

### C0 — fix WRAPPER_HALF_W stale comment (Worker: shihao, ขนาด: XS)
**ไฟล์เดียว:** `web/src/lib/iso.ts:28`
- comment เขียน `WRAPPER_HALF_W = 13` แต่ค่าจริงคือ 5.5 (flagged ใน B1.5 result)
- แก้ comment ให้ตรงค่าจริง + อธิบายสั้นๆ ว่ามาจาก auto-fit constraint อะไร
- **Acceptance:** comment ตรงค่า, tsc + build pass, ไม่แตะ logic
- **ห้าม:** เปลี่ยนค่า/logic — แก้ comment อย่างเดียว

### C0.1 — WRAPPER_HALF_W sync + layout polish pass (Worker: shihao, ขนาด: S) ✅ ji-ziyue ตัดสิน A+
**ที่มา:** C0 audit พบว่า `WRAPPER_HALF_W = 13` ผิดจริง (ไม่ใช่แค่ comment) — ground truth = 5.5 (ยืนยัน OfficeMap.tsx:461 width 11% / :467 marginLeft -5.5% / :473 "1 viewBox unit = 1% container"). ค่า 13 ทำ `computeAutoFit` เผื่อ margin เกินเท่าตัว → office เล็ก/หลวม ไม่เต็มจอ (root cause ของ "ยังไม่ดูดีพอ"). พี่เบญอนุมัติ A+: แก้ค่า + จัด layout polish รอบเดียวก่อน liveness.

**ไฟล์:** `web/src/lib/iso.ts` + `OfficeMap.tsx` (layout เท่านั้น)
1. **value fix:** `WRAPPER_HALF_W = 13` → `5.5` + comment ตรงค่าจริง (ลบ STALE/TODO note)
2. **auto-fit re-verify:** หลังแก้ค่า → usableX 68→83, Sx ใหญ่ขึ้น ~22% → ตรวจ `computeAutoFit` centering (X0/Y0) ยังกลางจอ
3. **no-clip check (บังคับ):** ทุก agent โดยเฉพาะมุมสุด — wenshu (col0,row4 ซ้ายสุด) + yefan (col4,row4 ขวาสุด) ต้องไม่ตกขอบ container (ห่างขอบ ≥ EDGE_PAD)
4. **no-overlap check:** ตัวการ์ตูน + label ไม่ทับกัน (anmaioyi/yefan ที่เคยมีปัญหา label overlap)
5. **centering/spacing polish:** office วางกลางสวย ไม่มีช่องว่างขอบเยอะเกิน/ไม่แน่นเกิน
6. **visual verify (บังคับ — ไม่รับ tsc อย่างเดียว):** refresh browser + แนบ screenshot/หลักฐานสายตาใน handoff ว่า (ก) office เต็มจอขึ้น (ข) ไม่มีตัวตกขอบ (ค) ไม่มีตัว/label ซ้อน

**Acceptance:** WRAPPER_HALF_W=5.5 + comment สะอาด · office เต็มจอขึ้นชัด · ไม่มี clip/overlap (มี screenshot ยืนยัน) · tsc 0 + build pass + bundle ≤ 392 kB
**ห้าม:** รื้อ delivery walk / depth z-sort / room zones (B1), เพิ่ม dep, เปลี่ยน ISO_GRID coords (แก้แค่ scale/margin/centering)

---

### C1 — Idle life: breathing bob (Worker: shihao, ขนาด: S)
**ไฟล์:** `web/src/components/OfficeMap.tsx`
- ตอน `status === 'idle'` → ตัวการ์ตูน (inner motion.div ที่คุม avatar) มี subtle breathing: y oscillate ±1.5px, duration ~2.5–3s, ease in-out, repeat mirror. **stagger** per-agent (delay ต่างกัน) เพื่อไม่ขยับพร้อมกันเป็นจังหวะเดียว
- ต้องไม่ชนกับ waddle (waddle y-bob คนละ state) และไม่ชนกับ hover raise (B1.5)
- `prefers-reduced-motion: reduce` → ปิด bob
- **Acceptance:** idle agents หายใจเบาๆ ไม่พร้อมกัน, ตอน working/walking ไม่มี idle bob, hover ยังทำงาน, tsc + build pass, bundle delta ≤ +2 kB
- **ห้าม:** แตะ delivery/waddle logic, เพิ่ม dep

### C2 — Working pose + desk activity (Worker: shihao, ขนาด: S–M)
**ไฟล์:** `OfficeMap.tsx` + (อาจ) `IsoDesk.tsx`
- ตอน `status === 'working'` → (1) desk monitor glow **pulse** (opacity/scale breathing ช้าๆ) สื่อว่ากำลังประมวลผล; (2) ตัวการ์ตูน "typing lean" — เอียงเล็กน้อย/ก้ม subtle ต่างจาก idle bob ชัดเจน
- ตอน `status === 'thinking'` → คง thought bubble เดิม + อาจเพิ่ม glow สีต่าง
- เป้า: มองแวบเดียวแยกออก idle vs thinking vs working โดยไม่ต้องอ่าน pill
- **Acceptance:** 3 สถานะ (idle/thinking/working) แยกออกด้วยสายตา, desk glow pulse เฉพาะ working, tsc + build pass, bundle delta ≤ +3 kB
- **ห้าม:** เพิ่ม sprite/asset ใหม่ (ใช้ transform + ที่มีอยู่), เพิ่ม dep

### C3 — Dependency-aware handoff (Worker: yefan backend + shihao frontend, ขนาด: M) ⚠️
**เป้า:** เมื่อ task เสร็จแล้ว unblock task ของอีกคน → ตัวการ์ตูนเดินส่งงาน **ตรงไปหาคนที่รับต่อจริง** (เช่น shihao เสร็จ → ปลด yefan → shihao เดินไปหา yefan) แทนที่จะเดินไป anmaioyi ทุกครั้ง
- **STEP 0 (yefan, investigate ก่อน — บังคับ):** ตรวจ kanban event / `/api/events` / SSE payload ว่ามีข้อมูล "task X complete → unblock task Y (assignee Z)" หรือไม่
  - **ถ้ามี edge/assignee data พอ** → expose ผ่าน API field ใหม่ (เช่น event `{ kind:'handoff', from, to }`) แล้ว frontend ใช้ targetId นั้นใน triggerWalk แทน hardcode 'anmaioyi'
  - **ถ้าข้อมูลไม่พอ / ต้องสร้าง dependency-graph layer ใหม่** → **block + report กลับ ji-ziyue ทันที ก่อนเขียนโค้ด** (อย่าเดา/อย่า over-build)
- frontend (shihao, หลัง backend พร้อม): `triggerWalk(from, to)` ใช้ to จาก event; ถ้าไม่มี handoff edge → fallback เดินไป anmaioyi เหมือนเดิม (report up ยังคง)
- **Acceptance:** มี dependency edge → เดินตรงไปคนรับต่อ; ไม่มี edge → fallback anmaioyi; ไม่ crash เมื่อ data ขาด; tsc + build pass
- **ห้าม:** ลบ fallback-to-anmaioyi, เพิ่ม dep, สร้าง dependency engine ใหญ่โดยไม่ block ขออนุมัติก่อน

### C4 — Perf + bundle QA pass (Worker: shihao, ขนาด: S)
- 7 ตัว animate พร้อมกัน (idle bob + working pulse + ใครเดิน) → ตรวจ jank: ใช้ transform/opacity, ไม่ trigger layout reflow ถี่ๆ; ดู frame ตอน hover/walk ซ้อน idle
- ตรวจ `prefers-reduced-motion` ทำงานครบทุก animation ใหม่
- bundle final ≤ 392 kB; ถ้าเกิน → report + เสนอตัดอะไรออก
- **Acceptance:** scroll/hover/walk ลื่น (ไม่มี dropped frame ชัด), reduced-motion ปิด animation ครบ, bundle ≤ 392 kB, tsc + build pass

---

## Execution protocol (เมี่ยวอี orchestrate)

1. **C0 (shihao)** — XS quick fix comment → ji-ziyue audit (comment ตรง)
2. **C1 (shihao)** — idle bob → ji-ziyue audit (visual: idle หายใจ, working/walk ไม่ bob)
3. **C2 (shihao)** — working pose + desk glow → ji-ziyue audit (แยก 3 สถานะด้วยตา)
4. **C3 STEP 0 (yefan investigate)** — ถ้าข้อมูลพอ → ทำต่อ (backend → shihao frontend); ถ้าไม่พอ → **block + report ji-ziyue** ก่อน
5. ji-ziyue audit C3 (handoff เดินตาม edge จริง + fallback)
6. **C4 (shihao)** — perf + bundle QA → ji-ziyue audit final
7. รายงาน ji-ziyue ว่า Phase C complete

**Dispatch rule:** status = **READY** เท่านั้น (ห้าม scheduled — task จะค้างไม่ถูก claim). Directive Authority Protocol: directive จาก ji-ziyue = pre-approved, execute ทันที (เว้น destructive/ambiguous เช่น C3 STEP 0 ที่ต้อง block ถ้าข้อมูลไม่พอ).

**A/B test note:** ทีมใช้ MiniMax M3 — ji-ziyue เก็บ data พฤติกรรม (over-caution vs execute) เทียบ M2.7 baseline ระหว่าง Phase C.
