import { Injectable } from '@nestjs/common';
import { Prisma, type BookingStatus } from '../generated/client';
import type { BookingPage, OwnerBookingHistoryFilter, OwnerBookingHistoryPort } from '@bookings/application/ports/owner-booking-history.port';
import { PrismaService } from './prisma.service';
import { mapBooking } from './booking.repository';

@Injectable()
export class PrismaOwnerBookingHistoryQuery implements OwnerBookingHistoryPort {
  public constructor(private readonly prisma: PrismaService) {}

  public async findPage(filter: OwnerBookingHistoryFilter): Promise<BookingPage> {
    const where: Prisma.BookingWhereInput = {
      ownerId: filter.ownerId,
      ...(filter.guestId ? { guestId: filter.guestId } : {}),
      ...(filter.status ? { status: filter.status as BookingStatus } : {}),
      ...(filter.from ? { checkOut: { gt: new Date(`${filter.from}T00:00:00.000Z`) } } : {}),
      ...(filter.to ? { checkIn: { lt: new Date(`${filter.to}T00:00:00.000Z`) } } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (filter.page - 1) * filter.pageSize, take: filter.pageSize }),
    ]);
    return { items: rows.map(mapBooking), page: filter.page, pageSize: filter.pageSize, total, hasNext: filter.page * filter.pageSize < total };
  }
}
