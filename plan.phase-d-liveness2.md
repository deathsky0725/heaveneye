# 🌱 Heaveneye — Phase D: Office Liveness 2.0

> **เจตนา:** Phase C ทำ office react กับ task flow (idle bob / working glow / dependency-aware handoff). Phase D เติมให้สะท้อน **ทั้ง workflow รวม QA gate ใหม่** + สถานะ agent ที่ละเอียดขึ้น (thinking/away) + จังหวะเฉลิมฉลอง
> **ฐาน:** main = f93a985 (B1 + C merged). bundle 386.16 kB.
> **Roadmap:** `ROADMAP.md` Phase D.

## สถานะปัจจุบัน (อ่านก่อนเริ่ม)
- **AgentStatus** = idle | thinking | working | blocked | done (+failed?) จาก store (`/api/agents` + SSE)
- **C1** idle breathing bob (`status==='idle'` → y ±1.5px stagger) · `OfficeMap.tsx` useReducedMotion guard
- **C2** working pose: desk glow pulse + typing lean (`status==='working'`) · `IsoDesk.tsx` mode prop + styles.css
- **C3** handoff: SSE event `{kind:'handoff', from_agent, to_agent}` → `triggerWalk(from, to)` → เดินไป to_agent desk → return home (`walkTargetRef` + `handleArrival`) · `didMountHandoff` guard
- **QA workflow** (`Context/qa-workflow.md`): dev → yanxin QA (vision=MiniMax-M3) → ji-ziyue final audit. yanxin = QA Engineer

## กฎรวม Phase D (ทุก sub-task ต้อง follow)
- ห้าม npm dep ใหม่ · **bundle ≤ 395 kB** (เหลือ ~9 kB จาก 386.16) · ห้ามเกินโดยไม่ขออนุมัติ
- ห้ามรื้อ B1 (iso/delivery/depth/zones) + C1/C2/C3 (bob/glow/handoff/return-home)
- **prefers-reduced-motion** ทุก animation ใหม่ (ปิด/ลด motion)
- worker verify: `bunx tsc --noEmit` exit 0 + `bun run build` pass + bundle ≤ 395 + handoff comment ครบ (files+logic+verify+commit)
- **ทุก task ผ่าน QA gate** (yanxin + vision จริง) → **ji-ziyue visual final audit** ก่อนปิด (พี่เบญ care 'ดูดีพอ')
- spec เป๊ะ = ไม่แก้แบบลบ feature / ไม่ลูป (บทเรียน C3.fix)

## Sub-tasks (ลำดับ D1 → D4, audit คั่นแต่ละตัว)

### D1 — QA gate visual (Worker: yefan BE → shihao FE, ขนาด: M) ⚠️ INVESTIGATE-FIRST
สื่อ QA gate ในออฟฟิศ: yanxin "testing" + สัญญาณ PASS/FAIL
- **STEP 0 (yefan, บังคับ investigate ก่อนเขียน):** ดู SSE/kanban event ว่ามีข้อมูล "QA task running" + "QA verdict pass/fail" หรือไม่ (`server/state/engine.ts` + `watchers/kanban.ts`). ถ้า data พอ → STEP 1; **ถ้าไม่พอ → BLOCK + report ji-ziyue ทันที** (ห้ามเดา/over-build) — เหมือน C3 STEP 0
- **STEP 1 (yefan):** expose event ใหม่ เช่น `{kind:'qa_verdict', agent:'yanxin', task_id, verdict:'pass'|'fail'}` ผ่าน SSE (backward-compat: ไม่มี field → frontend ไม่ crash)
- **STEP 2 (shihao):** (1) yanxin desk "testing" indicator ตอน yanxin `status==='working'` (เช่น แว่นขยาย/scan pulse — แยกจาก dev glow) (2) verdict signal: PASS → เขียว ✓ pulse, FAIL → แดง ✗ pulse ที่ตัว/desk ที่เกี่ยว 1.5s แล้วจาง
- **Acceptance:** STEP 0 verdict ชัด (A/B) + หลักฐาน · QA running เห็น indicator · pass→เขียว / fail→แดง · reduced-motion ปิด pulse

### D2 — Thinking pose (Worker: shihao FE, ขนาด: S)
แยก `thinking` จาก `working` ด้วยตา (ตอนนี้ thinking ≈ idle/working ไม่ชัด)
- `status==='thinking'` → pose เฉพาะ: เอียงหัวเล็กน้อย + thought dots "•••" loop เหนือหัว (subtle, ไม่ใหญ่) — ต่างจาก C2 typing lean (working) ชัด
- ไม่แตะ idle bob (C1) / working lean (C2) — เพิ่ม state ใหม่เท่านั้น
- **Acceptance:** thinking เห็น dots + tilt · idle/working ยังเหมือนเดิม · reduced-motion ปิด dots animation · tsc/build/bundle

### D3 — Idle → Away (Worker: yefan BE? + shihao FE, ขนาด: S–M)
agent ที่ idle นานสื่อ "away" (สมจริง)
- ต้องการ `lastActivityAt` ต่อ agent — **STEP 0 (เช็คก่อน):** มีใน store/`/api/agents` แล้วหรือยัง (`engine.ts`) ถ้าไม่มี → yefan เพิ่ม (timestamp ของ status-change ล่าสุด); ถ้ามี → shihao ใช้เลย
- `status==='idle'` + `now - lastActivityAt > AWAY_THRESHOLD` (เช่น 5 นาที) → dim ตัว (opacity ~0.55) + zzz เล็กๆ; กลับปกติเมื่อ status เปลี่ยน/activity
- **Acceptance:** idle > threshold → dim+zzz · activity → ตื่นทันที · ไม่กระทบ bob · reduced-motion ปิด zzz (คง dim) · tsc/build/bundle

### D4 — Milestone celebration (Worker: shihao FE, ขนาด: S)
จังหวะเฉลิมฉลองงานใหญ่เสร็จ
- trigger: เมื่อมี signal "milestone" (เลือกวิธีง่ายสุดที่ไม่ over-build — เช่น task ที่ title/label มี marker, หรือ event kind:'milestone'; ถ้าต้อง backend → **เช็คก่อน + block ถ้าไม่มี data**) → confetti burst กลางจอ 1.5–2s
- ใช้ของที่มี (framer-motion / CSS) — **ห้ามเพิ่ม dep confetti lib**
- **Acceptance:** milestone → confetti (no-dep) · ไม่รบกวน layout/perf · reduced-motion ปิด/ลด · tsc/build/bundle

## Execution protocol
- Dispatch ทีละ task (status=ready) ตามลำดับ D1→D4 · audit คั่น
- D1/D3 มี **investigate-first gate** (เหมือน C3): backend data ไม่พอ → block+report ji-ziyue ก่อนเขียน
- flow: dev → **yanxin QA (vision)** → ji-ziyue visual final audit → commit
- D4 = ปิด Phase → ji-ziyue FINAL AUDIT (rerun build + ดู aesthetic) ก่อน merge เข้า main
