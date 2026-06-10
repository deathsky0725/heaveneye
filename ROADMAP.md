# 👁️ Heaveneye — Roadmap v3 (next phases)

> **จุดยืน:** view-only monitoring dashboard สำหรับ Hermes team. ไม่เป็น chat/orchestration platform (pivot 2026-05-23).
> **ฐาน ณ 2026-06-10:** Phase B1 (isometric office) + Phase C (liveness/task-driven) + Phase 3–6 (analytics/alerts/monitoring/security) เสร็จ + merge เข้า main แล้ว.
> **ร่างโดย:** ji-ziyue · grounded จาก pain points จริงที่เจอ (M3 quota บอด, worker crash/loop 2.5h, vision gap) + ต่อยอด liveness.
> เรียงตาม priority ที่เสนอ — พี่เบญปรับลำดับได้.

---

## Phase D — Office Liveness 2.0  ·  ต่อยอด C (S–M)
office สะท้อน **ทั้ง workflow** รวม QA gate ใหม่ ไม่ใช่แค่ dev→anmaioyi
- **QA gate visual**: yanxin QA desk + "testing" animation ตอนรัน + สัญญาณ PASS(เขียว)/FAIL(แดง) บน handoff
- **thinking pose** แยกจาก working ชัด (ตอนนี้ thinking≈working) + "reviewing huddle" ตอน anmaioyi audit
- **idle→away**: dim/หลับ เมื่อ idle > N นาที, ตื่นเมื่อมี activity (สื่อสถานะจริง)
- **milestone celebration**: phase/task ใหญ่เสร็จ → confetti burst
- *เหตุผล:* C3 ทำ office react กับ task flow แล้ว — เติมให้สะท้อน dev→**QA**→audit ครบวง

## Phase E — Team Health & Observability  ·  grounded จาก session นี้ (M)
ทำให้ "สุขภาพทีม" มองเห็นได้ — session นี้บินบอดเรื่อง quota/crash/vision
- **Provider/quota panel**: นับถอยหลัง token-cap ต่อ provider สด (เจอ MiniMax 5h cap แบบไม่รู้ตัว), อัตรา 429/503, สถานะ vision pipeline
- **Stuck-worker detector**: alert เมื่อ worker เกิน iteration/time budget (shihao loop 2.5h กว่าจะรู้) หรือ self-complete โดยไม่มี handoff
- **Worker reliability board**: crash/timeout/loop count ต่อ agent + provider health
- *เหตุผล:* session นี้พลาดเพราะมองไม่เห็น quota หมด + worker ติดลูป — ทำให้ observable

## Phase F — Native Desktop App  ·  ship Tauri (M)
TAURI.md มีแล้วแต่ยังไม่ ship เป็น daily driver
- tray menu (status ย่อ + quick action), global hotkey เรียก, native notification ตอน block/alert
- auto-launch on login, menu-bar mini-glance
- *เหตุผล:* ทำให้ heaveneye เป็น desktop presence จริง ไม่ต้องเปิด browser

## Phase G — Insights & Auto-Reporting  ·  เปลี่ยน data เป็น insight (M–L)
data มีครบ (StatChart, heatmap, cost) — turn เป็น proactive
- **weekly digest** อัตโนมัติ (Discord/email): throughput, cost, productivity ต่อ agent, incidents
- **burn-rate forecast** + cost-optimization hint (provider/model ไหนถูกกว่าต่อ task type)
- **anomaly detection**: idle ผิดปกติ / cost spike / crash cluster
- *เหตุผล:* HM2-REPORT มีฐานแล้ว — ยกระดับเป็น insight เชิงรุก

---

## หมายเหตุ (จาก audit วันนี้)
- ทุก phase: workflow ใหม่ dev→**QA(yanxin+vision)**→ji-ziyue final audit (`Context/qa-workflow.md`)
- กฎเดิมคง: ไม่รื้อ B1/C, bundle budget, reduced-motion, no-dep เว้นอนุมัติ
- **ลำดับเสนอ: D → E → F → G** (D ต่อยอดตรง, E แก้ pain ด่วน, F/G ขยายผล) — รอพี่เบญ confirm/จัดใหม่
