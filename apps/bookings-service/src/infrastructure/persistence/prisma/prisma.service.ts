import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/client';
@Injectable() export class PrismaService extends PrismaClient implements OnModuleInit,OnModuleDestroy {
  public async onModuleInit():Promise<void>{await this.$connect();}
  public async onModuleDestroy():Promise<void>{await this.$disconnect();}
  public async isReady():Promise<boolean>{try{const rows=await this.$queryRaw<Array<{ready:boolean}>>`SELECT to_regclass('public.bookings') IS NOT NULL AND to_regclass('public.outbox_events') IS NOT NULL AS ready`;return rows[0]?.ready===true;}catch{return false;}}
}
