# Heaveneye — E2E QA Checklist (Yan Xin / QA Engineer)

> **Owner:** yanxin (QA Engineer). **เมื่อไหร่:** หลัง dev (shihao/yefan) complete ทุก task — ก่อน audit.
> **กฎ:** QA = GATE. PASS → ปล่อยเข้า audit. FAIL → kick กลับ dev พร้อม repro. **QA ไม่แก้โค้ด dev เอง.**
> **ห้าม:** เพิ่ม npm dep, แตะ ISO_GRID / Phase B1 (delivery/depth/zones), commit, ทิ้ง artifact ค้าง.

---

## 0. รับงาน
- อ่าน QA task body: dev `task_id` + `commit` ref + acceptance criteria + spec (`plan.phase-*.md`)
- `cd /Users/ben/Agentic-OS/Projects/heaveneye` (หรือ workspace ของ task)
- `git log --oneline -3` ยืนยัน commit ของ dev อยู่จริง + branch ถูก (`feat/v2-iso-office`)

## 1. Static gate (บังคับทุก task)
```bash
./node_modules/.bin/tsc --noEmit          # ต้อง exit 0
./node_modules/.bin/vite build            # ต้อง pass
```
- [ ] tsc exit 0 (ไม่มี type error)
- [ ] build pass
- [ ] bundle ≤ **392 kB** (Phase C ceiling) — จด kB จาก build output
- [ ] ไม่มี npm dep ใหม่ (`git diff package.json` ว่าง)

## 2. Runtime / API gate (ถ้า task แตะ backend/server)
เปิด server ถ้ายังไม่รัน: `bun run dev` (backend :7878 + web :5173). reuse ตัวที่รันอยู่ได้
```bash
curl -s -o /dev/null -w "%{http_code}" localhost:7878/api/health    # 200
curl -s localhost:7878/api/<endpoint-ที่-task-แตะ> | head            # payload shape
```
- [ ] `/api/health` → 200
- [ ] endpoint ที่ task แก้ → 200 + field ครบตาม spec (เช่น C3: event `{kind:'handoff', from, to}`)
- [ ] ไม่มี error ใน server log ตอน hit

## 3. Visual / functional gate (ถ้า task แตะ UI — ใช้ browser_vision ที่ localhost:5173)
- [ ] acceptance criteria ของ task ครบ **ทุกข้อ** (เทียบ spec ทีละข้อ)
- [ ] animation/feature ที่เพิ่ม แสดงจริง (เช่น idle bob ±1.5px, desk glow ตอน working, handoff walk ตรงเป้า)
- [ ] capture **screenshot** เป็นหลักฐาน (แนบ path ใน report)

## 4. Regression gate (ของเดิมห้ามพัง — บังคับทุก task ที่แตะ OfficeMap/iso/styles)
- [ ] 7 agents ขึ้นครบบนจอ (ziyue, anmaioyi, wenshu, yanxin, jianfeng, shihao, yefan)
- [ ] iso layout: ไม่มีตัวตกขอบ (wenshu ซ้ายสุด / yefan ขวาสุด), ไม่มี label/desk ซ้อน
- [ ] delivery walk + waddle ทำงาน, depth z-sort ถูก (ตัวหน้าทับตัวหลัง)
- [ ] room zones (DEVELOPER BAY / REVIEW BAY) ยังอยู่
- [ ] dark mode + mobile responsive ปกติ (`preview_resize` / browser_vision)

## 5. Accessibility gate
- [ ] `prefers-reduced-motion`: เปิด flag แล้ว animation ใหม่ปิด/ลดจริง (เช็คใน styles.css guard + DOM)

---

## Verdict report (post เป็น kanban comment + result)
```
QA VERDICT: PASS | FAIL   (task <id> / commit <sha>)
- Static:     tsc exit 0 / build pass / bundle XXX.XX kB (≤392 ✓)
- API:        /api/<...> 200, payload {<fields>} ✓        [N/A ถ้าไม่แตะ backend]
- Visual:     [acc1 ✓][acc2 ✓]... + screenshot: <path>     [N/A ถ้าไม่แตะ UI]
- Regression: 7 agents ✓ / no-clip ✓ / delivery+depth ✓ / zones ✓ / dark+mobile ✓
- a11y:       reduced-motion ✓
FAIL items (ถ้ามี):
  - <อาการ> | repro: <ขั้นตอน> | สงสัย: <file:line> | screenshot: <path>
```
- **PASS** → comment verdict + แจ้ง anmaioyi (outbox/discord) ปล่อยเข้า audit
- **FAIL** → comment repro + แจ้ง anmaioyi re-dispatch dev. **ห้าม** `unblock`→`complete` งานที่ fail

## Notes
- ยังไม่มี test framework (Playwright/vitest) ในโปรเจกต์ — e2e เป็น manual no-dep ตาม checklist นี้. ถ้าอนาคต พี่เบญอยากได้ automated suite = Phase แยก (ต้องอนุมัติเพิ่ม dep)
- gate ไหน N/A (เช่น task แตะ backend ล้วน ไม่มี UI) → mark N/A พร้อมเหตุผล ไม่ใช่ข้าม
