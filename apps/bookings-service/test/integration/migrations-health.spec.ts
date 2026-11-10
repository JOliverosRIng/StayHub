import { readFileSync } from 'node:fs'; import { resolve } from 'node:path';
const sql=readFileSync(resolve(__dirname,'../../prisma/migrations/001_bookings_core/migration.sql'),'utf8');
describe('initial migration',()=>{it.each(['btree_gist','bookings_no_overlap','daterange("checkIn","checkOut",\'[)\')','PENDING_PAYMENT','idempotency_records','processed_events'])('contains %s',(value)=>expect(sql).toContain(value));});
