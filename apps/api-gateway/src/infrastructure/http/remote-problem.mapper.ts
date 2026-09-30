import { HttpException } from '@nestjs/common';

import type { ServiceResult } from '@gateway/infrastructure/http/service-client.base';
import {
  buildProblem,
  readCode,
  readFieldErrors,
  type FieldError,
  type ProblemDetails,
} from '@gateway/interfaces/http/problem.mapper';

/**
 * GW-019 — Traduce la respuesta de error de un servicio interno (Auth/Users), tal como la
 * entrega el cliente REST base (GW-018), a un Problem Details del Gateway (GW-011).
 *
 * Reglas (Plan §6, FR-008/FR-012–FR-013/FR-019–FR-024, Constitución IV/V):
 * - Preserva los estados contractuales 400/401/403/404/409/413/415/429/503.
 * - Cualquier otro estado remoto (incluidos 5xx inesperados) se traduce a 503: un error remoto
 *   nunca se convierte en éxito ni expone un código no documentado.
 * - Reescribe `instance`/`traceId` con los del Gateway y reconstruye tipo/título/detalle
 *   localmente; nunca copia campos arbitrarios ni sensibles del cuerpo remoto.
 */

export const PRESERVED_REMOTE_STATUSES: readonly number[] = [
  400, 401, 403, 404, 409, 413, 415, 429, 503,
];

const PRESERVED = new Set<number>(PRESERVED_REMOTE_STATUSES);
const DEPENDENCY_STATUS = 503;
const DEPENDENCY_CODE = 'DEPENDENCY_UNAVAILABLE';

export interface RemoteOutcome {
  readonly status: number;
  readonly code: string;
  readonly errors?: readonly FieldError[];
}

/** Decide estado, código y field errors seguros a partir de la respuesta remota. */
export function resolveRemoteOutcome(result: ServiceResult): RemoteOutcome {
  const status = PRESERVED.has(result.status) ? result.status : DEPENDENCY_STATUS;

  if (status === DEPENDENCY_STATUS) {
    return { status: DEPENDENCY_STATUS, code: DEPENDENCY_CODE };
  }

  const body = parseProblemBody(result.body);
  const code = readCode(body?.['code'], status);
  const errors = readFieldErrors(body?.['errors'])?.map(sanitizeFieldError);

  return errors === undefined ? { status, code } : { status, code, errors };
}

/** Mapea un error remoto a un Problem Details completo del Gateway. */
export function mapRemoteProblem(
  result: ServiceResult,
  instance: string,
  traceId: string,
): ProblemDetails {
  const outcome = resolveRemoteOutcome(result);
  return buildProblem(outcome.status, outcome.code, instance, traceId, outcome.errors);
}

/**
 * Envuelve el error remoto en una `HttpException` para que el filtro global (GW-011) emita el
 * Problem Details con el `instance`/`traceId` de la petición en curso.
 */
export function toRemoteHttpException(result: ServiceResult): HttpException {
  const outcome = resolveRemoteOutcome(result);
  const response =
    outcome.errors === undefined
      ? { code: outcome.code }
      : { code: outcome.code, errors: outcome.errors };
  return new HttpException(response, outcome.status);
}

function sanitizeFieldError(error: FieldError): FieldError {
  return error.message === undefined
    ? { field: error.field, code: error.code }
    : { field: error.field, code: error.code, message: error.message };
}

function parseProblemBody(bytes: Uint8Array): Record<string, unknown> | undefined {
  if (bytes.length === 0) return undefined;

  let text: string;
  try {
    text = new TextDecoder().decode(bytes);
  } catch {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  return parsed as Record<string, unknown>;
}
