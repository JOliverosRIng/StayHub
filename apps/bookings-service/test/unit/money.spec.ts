import { Money } from '@bookings/domain/money/money';
describe('Money',()=>{ it('keeps decimal arithmetic exact',()=>expect(Money.parse('10.10','USD').multiply(3).toString()).toBe('30.30')); it.each([['0.00','USD'],['1.001','USD'],['1.00','usd']])('rejects invalid money',(a,c)=>expect(()=>Money.parse(a,c)).toThrow()); });
