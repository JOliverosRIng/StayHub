import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
export const roleSchema: SchemaObject = { type: 'string', enum: ['GUEST', 'OWNER', 'ADMIN'] };
export const problemSchema: SchemaObject = { type: 'object', required: ['type', 'title', 'status', 'detail', 'instance', 'code', 'traceId', 'errors'], properties: {
  type: { type: 'string' }, title: { type: 'string' }, status: { type: 'integer' }, detail: { type: 'string' }, instance: { type: 'string' }, code: { type: 'string' }, traceId: { type: 'string' },
  errors: { type: 'array', items: { type: 'object', required: ['field', 'code'], properties: { field: { type: 'string' }, code: { type: 'string' } } } },
} };
export function Problems(...statuses: number[]): ReturnType<typeof applyDecorators> { return applyDecorators(...statuses.map((status) => ApiResponse({ status, description: 'Safe Problem Details response.', content: { 'application/problem+json': { schema: problemSchema } } }))); }
export const userSummarySchema: SchemaObject = { type: 'object', required: ['id', 'name', 'email', 'role', 'status'], properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, email: { type: 'string', format: 'email' }, role: roleSchema, status: { type: 'string', enum: ['PENDING', 'ACTIVE', 'CANCELLED'] } } };
