import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { parsePaymentEvent } from '@bookings/interfaces/events/booking-payment-event.dto';

const uuid=(suffix:number):string=>`00000000-0000-4000-8000-${suffix.toString().padStart(12,'0')}`;
const base={eventId:uuid(1),schemaVersion:1,occurredAt:'2030-01-01T00:00:00Z',bookingId:uuid(2)};
const schema=JSON.parse(readFileSync(resolve(__dirname,'../../../../specs/003-reservas-pagos-resenas/booking_service/contracts/booking-payment-events-v1.schema.json'),'utf8')) as object;
const ajv=new Ajv2020({strict:false});addFormats(ajv);const validate=ajv.compile(schema);

describe('booking/payment event contract',()=>{
  it.each([
    {...base,eventType:'booking.v1.created',guestId:uuid(3),ownerId:uuid(4),propertyId:uuid(5),roomId:uuid(6),checkIn:'2030-02-01',checkOut:'2030-02-02',total:{amount:'10.00',currency:'USD'},status:'PENDING_PAYMENT'},
    {...base,eventType:'booking.v1.confirmed'},
    {...base,eventType:'payment.v1.confirmed',paymentOrderId:uuid(7)},
    {...base,eventType:'payment.v1.failed',paymentOrderId:uuid(7),reasonCode:'DECLINED'},
    {...base,eventType:'payment.v1.refund-completed',paymentOrderId:uuid(7),refundId:uuid(8)},
  ])('validates $eventType',(event)=>expect(validate(event)).toBe(true));
  it('parses strict payment events and hashes them',()=>expect(parsePaymentEvent({...base,eventType:'payment.v1.confirmed',paymentOrderId:uuid(7)}).hash).toHaveLength(64));
  it('parses a refund completion event',()=>expect(parsePaymentEvent({...base,eventType:'payment.v1.refund-completed',paymentOrderId:uuid(7),refundId:uuid(8)}).event.eventType).toBe('payment.v1.refund-completed'));
  it('rejects a refund event without refundId',()=>expect(()=>parsePaymentEvent({...base,eventType:'payment.v1.refund-completed',paymentOrderId:uuid(7)})).toThrow('INVALID_EVENT'));
  it('rejects unknown payment fields',()=>expect(()=>parsePaymentEvent({...base,eventType:'payment.v1.confirmed',paymentOrderId:uuid(7),secret:'x'})).toThrow('INVALID_EVENT'));
});
