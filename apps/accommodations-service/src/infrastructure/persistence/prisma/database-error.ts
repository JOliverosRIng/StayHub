import { Prisma } from '../generated/prisma';
export function isDatabaseUnavailable(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError && ['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2028', 'P2034'].includes(error.code));
}
