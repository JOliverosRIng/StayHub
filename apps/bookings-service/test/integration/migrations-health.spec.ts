import { readFileSync } from 'node:fs'; import { resolve } from 'node:path';
const sql=readFileSync(resolve(__dirname,'../../prisma/migrations/001_bookings_core/migration.sql'),'utf8');
const reviewSql=readFileSync(resolve(__dirname,'../../prisma/migrations/003_payment_review_and_notification_work/migration.sql'),'utf8');
describe('initial migration',()=>{it.each(['btree_gist','bookings_no_overlap','daterange("checkIn","checkOut",\'[)\')','PENDING_PAYMENT','idempotency_records','processed_events'])('contains %s',(value)=>expect(sql).toContain(value));});
describe('payment review and notification work migration',()=>{it.each(['REVIEW_REQUIRED','REFUND_REVIEW_REQUIRED','REFUND_FAILED','CREATE TABLE "notification_work"','notification_work_bookingId_operation_key','notification_work_status_nextAttemptAt_idx'])('contains %s',(value)=>expect(reviewSql).toContain(value));});
