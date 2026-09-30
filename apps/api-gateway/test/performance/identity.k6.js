/* eslint-disable */
// GW-061 — Perfil de rendimiento k6 del Gateway (Plan §8, RQ-01/RQ-02).
//
// Reproduce EXACTAMENTE el perfil del Plan §8: HTTPS a través del Gateway (/api/v1), 100 usuarios
// `ACTIVE`, 30 s de calentamiento y DOS escenarios simultáneos de 25 solicitudes/s durante 2 minutos
// —consulta de perfil y validación de acceso—, exigiendo p95 < 500 ms y errores < 1% por operación.
//
// La corrida REAL necesita Auth (G3) y Users (G2) operativos tras el Gateway. Configúrese vía env:
//   GATEWAY_PERF_BASE_URL       base pública del Gateway (por defecto https://localhost:8080/api/v1)
//   GATEWAY_PERF_BEARER         bearer de un usuario ACTIVE ya emitido (opción directa), o bien
//   GATEWAY_PERF_USER_EMAIL / GATEWAY_PERF_USER_PASSWORD  credenciales para hacer login en setup().
// No se inventan resultados: sin servicios reales el script no produce p95 (queda pendiente GW-058/059).

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.GATEWAY_PERF_BASE_URL || 'https://localhost:8080/api/v1';
const STATIC_BEARER = __ENV.GATEWAY_PERF_BEARER || '';
const USER_EMAIL = __ENV.GATEWAY_PERF_USER_EMAIL || '';
const USER_PASSWORD = __ENV.GATEWAY_PERF_USER_PASSWORD || '';

// Errores inesperados (respuesta no exitosa en los flujos de identidad); umbral < 1%.
export const identityErrors = new Rate('identity_errors');

export const options = {
  // TLS de borde autofirmado en Compose/local: se acepta explícitamente para el escenario de carga.
  insecureSkipTLSVerify: true,
  scenarios: {
    // Calentamiento: 30 s estableciendo hasta 100 usuarios ACTIVE.
    warmup: {
      executor: 'ramping-vus',
      exec: 'warmup',
      startVUs: 0,
      stages: [{ duration: '30s', target: 100 }],
      gracefulStop: '5s',
    },
    // Escenario 1: consulta de perfil, 25 req/s durante 2 min tras el calentamiento.
    profile_query: {
      executor: 'constant-arrival-rate',
      exec: 'profileQuery',
      startTime: '30s',
      rate: 25,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 50,
      maxVUs: 50,
    },
    // Escenario 2: validación de acceso, 25 req/s durante 2 min tras el calentamiento (simultáneo).
    access_validation: {
      executor: 'constant-arrival-rate',
      exec: 'accessValidation',
      startTime: '30s',
      rate: 25,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 50,
      maxVUs: 50,
    },
  },
  thresholds: {
    // p95 < 500 ms POR operación (cada escenario), no solo global.
    'http_req_duration{scenario:profile_query}': ['p(95)<500'],
    'http_req_duration{scenario:access_validation}': ['p(95)<500'],
    // Errores inesperados < 1%.
    identity_errors: ['rate<0.01'],
    http_req_failed: ['rate<0.01'],
  },
};

function authHeaders(bearer) {
  return { headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' } };
}

// Resuelve un bearer de usuario ACTIVE y su userId (por login o por bearer directo) una sola vez.
export function setup() {
  let bearer = STATIC_BEARER;
  if (!bearer && USER_EMAIL && USER_PASSWORD) {
    const login = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    bearer = login.status === 200 ? login.json('accessToken') : '';
  }
  let userId = '';
  if (bearer) {
    const validated = http.get(`${BASE_URL}/auth/validate`, authHeaders(bearer));
    userId = validated.status === 200 ? validated.json('userId') : '';
  }
  return { bearer, userId };
}

export function warmup(data) {
  const res = http.get(`${BASE_URL}/auth/validate`, authHeaders(data.bearer));
  check(res, { 'warmup: validate 200': (r) => r.status === 200 });
  sleep(0.3);
}

export function profileQuery(data) {
  const res = http.get(`${BASE_URL}/users/${data.userId}/profile`, authHeaders(data.bearer));
  const ok = check(res, { 'profile: 200': (r) => r.status === 200 });
  identityErrors.add(!ok);
}

export function accessValidation(data) {
  const res = http.get(`${BASE_URL}/auth/validate`, authHeaders(data.bearer));
  const ok = check(res, { 'validate: 200': (r) => r.status === 200 });
  identityErrors.add(!ok);
}
