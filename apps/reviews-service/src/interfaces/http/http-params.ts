import { BadRequestException } from '@nestjs/common';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export function assertUuid(value: string | undefined, field: string): string {
  if (!value || !UUID.test(value)) throw new BadRequestException({ code: 'VALIDATION_ERROR', errors: [{ field, code: 'INVALID_UUID' }] });
  return value;
}
export function parsePagination(pageRaw?: string, pageSizeRaw?: string): Readonly<{ page: number; pageSize: number }> {
  const page = pageRaw === undefined ? 1 : Number(pageRaw); const pageSize = pageSizeRaw === undefined ? 20 : Number(pageSizeRaw);
  if (!Number.isSafeInteger(page) || page < 1) throw new BadRequestException({ code: 'VALIDATION_ERROR', errors: [{ field: 'page', code: 'INVALID_PAGE' }] });
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new BadRequestException({ code: 'VALIDATION_ERROR', errors: [{ field: 'pageSize', code: 'INVALID_PAGE_SIZE' }] });
  return { page, pageSize };
}
