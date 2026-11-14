#!/usr/bin/env node
// Prueba de humo del entorno local completo a través del API Gateway (sin navegador).
// Requiere: npm run dev:swagger, npm run dev:backend y npm run dev:gateway en ejecución.
//
// Recorre: registro/login OWNER y GUEST → crear propiedad → foto → publicar → detalle anónimo →
// búsqueda y sugerencias → reseñas de la propiedad → reserva del huésped → historial del dueño.
// Deja datos sintéticos (correos *@stayhub.test) en las bases de desarrollo.
//
// Uso: npm run smoke:local [-- --base http://127.0.0.1:8080/api/v1]
import { randomUUID } from 'node:crypto';

const baseIndex = process.argv.indexOf('--base');
const BASE = baseIndex > 0 ? process.argv[baseIndex + 1] : 'http://127.0.0.1:8080/api/v1';
// PNG 1x1 válido (los servicios validan la foto por magic bytes).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const results = [];
let failed = false;

async function api(method, path, { token, json, form, headers = {}, expect } = {}) {
  const init = { method, headers: { accept: 'application/json', ...headers } };
  if (token) init.headers.authorization = `Bearer ${token}`;
  if (json !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(json); }
  if (form !== undefined) init.body = form;
  const response = await fetch(`${BASE}${path}`, init);
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  const expected = Array.isArray(expect) ? expect : [expect];
  if (expect !== undefined && !expected.includes(response.status)) {
    const code = body && typeof body === 'object' ? body.code : '';
    throw new Error(`${method} ${path} → ${response.status} ${code ?? ''} (esperado ${expected.join('/')})`);
  }
  return { status: response.status, body };
}

async function step(name, action) {
  try {
    const detail = await action();
    results.push({ name, ok: true, detail });
    console.log(`  OK   ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (error) {
    failed = true;
    results.push({ name, ok: false });
    console.log(`  FAIL ${name} — ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function account(role) {
  const email = `smoke-${role.toLowerCase()}-${Date.now()}@stayhub.test`;
  const password = `Smoke-${randomUUID()}`;
  await api('POST', '/auth/register', {
    json: { name: `Smoke ${role}`, email, password, role },
    headers: { 'Idempotency-Key': randomUUID() },
    expect: [200, 201, 202],
  });
  // El registro es una saga Auth→Users; se reintenta el login unos segundos si aún no está activo.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const login = await api('POST', '/auth/login', { json: { email, password } });
    if (login.status === 200) return { token: login.body.accessToken, userId: login.body.user.userId };
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`login ${role} no fue posible`);
}

async function main() {
  console.log(`Smoke local contra ${BASE}\n`);
  let owner; let guest; let property; let bookingId;

  await step('health del Gateway', async () => {
    const response = await fetch(new URL('/health/ready', BASE));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return 'ready';
  });
  await step('registro + login OWNER (Auth/Users)', async () => { owner = await account('OWNER'); return owner.userId; });
  await step('perfil propio (Users)', async () => {
    const { body } = await api('GET', `/users/${owner.userId}/profile`, { token: owner.token, expect: 200 });
    return body.role;
  });
  await step('crear propiedad (Accommodations)', async () => {
    const { body } = await api('POST', '/properties', {
      token: owner.token, expect: 201,
      json: {
        type: 'HOUSE', name: `Casa Smoke ${Date.now()}`, description: 'Propiedad de prueba local',
        location: { addressLine: 'Calle 1', city: 'Bogota', region: 'Cundinamarca', country: 'CO' },
        rooms: [{ name: 'Habitacion 1', capacity: 2, basePrice: { amount: '120000.00', currency: 'COP' } }],
      },
    });
    property = body;
    return `${body.id} ${body.status}`;
  });
  await step('borrador oculto para anónimos', async () => {
    await api('GET', `/properties/${property.id}`, { expect: 404 });
    const { body } = await api('GET', `/properties/${property.id}`, { token: owner.token, expect: 200 });
    return `dueño ve ${body.status}`;
  });
  await step('subir foto (multipart)', async () => {
    const form = new FormData();
    form.append('file', new Blob([PNG], { type: 'image/png' }), 'smoke.png');
    const { body } = await api('POST', `/properties/${property.id}/photos`, { token: owner.token, form, expect: 201 });
    return `${body.mediaType} ${body.byteSize} bytes`;
  });
  await step('publicar propiedad', async () => {
    const current = (await api('GET', `/properties/${property.id}`, { token: owner.token, expect: 200 })).body;
    const { body } = await api('PUT', `/properties/${property.id}`, {
      token: owner.token, expect: 200,
      json: {
        type: current.type, name: current.name, description: current.description ?? undefined, location: current.location,
        featureCodes: current.features.map((feature) => feature.code), status: 'PUBLISHED', version: current.version,
        rooms: current.rooms.map((room) => ({ id: room.id, name: room.name, capacity: room.capacity, ...(room.basePrice ? { basePrice: room.basePrice } : {}) })),
      },
    });
    property = body;
    return `${body.status} v${body.version}`;
  });
  await step('detalle anónimo publicado', async () => {
    const { body } = await api('GET', `/properties/${property.id}`, { expect: 200 });
    return body.ownerId === undefined ? 'sin ownerId (correcto)' : 'expone ownerId';
  });
  await step('búsqueda pública (Search)', async () => {
    const { body } = await api('GET', '/search?q=Casa&amenities=wifi', { expect: 200 });
    return `${body.items?.length ?? 0} resultados (la proyección depende de eventos de Accommodations)`;
  });
  await step('sugerencias (Search)', async () => {
    const { body } = await api('GET', '/search/suggest?q=Ca&limit=5', { expect: 200 });
    return `${body.items?.length ?? 0} sugerencias`;
  });
  await step('reseñas públicas (Reviews)', async () => {
    const { body } = await api('GET', `/properties/${property.id}/reviews?page=1&pageSize=20`, { expect: 200 });
    return `${body.total} reseñas`;
  });
  await step('registro + login GUEST', async () => { guest = await account('GUEST'); return guest.userId; });
  await step('crear reserva (Bookings → Accommodations → Payments)', async () => {
    const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const { body } = await api('POST', '/bookings', {
      token: guest.token, expect: 201, headers: { 'Idempotency-Key': `smoke-${randomUUID()}` },
      json: { propertyId: property.id, roomId: property.rooms[0].id, checkIn: day(30), checkOut: day(32), guests: 1 },
    });
    bookingId = body.id;
    return `${body.id} ${body.status}`;
  });
  await step('estado de la reserva', async () => {
    let status = '';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      status = (await api('GET', `/bookings/${bookingId}`, { token: guest.token, expect: 200 })).body.status;
      if (status !== 'PENDING_PAYMENT') break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return status;
  });
  await step('historial del dueño (Bookings)', async () => {
    const { body } = await api('GET', '/bookings/history', { token: owner.token, expect: 200 });
    return `${body.items?.length ?? body.total ?? 0} reservas`;
  });
}

main()
  .catch(() => undefined)
  .finally(() => {
    const ok = results.filter((result) => result.ok).length;
    console.log(`\n${ok}/${results.length} pasos OK${failed ? ' — revisa el primer FAIL y el log del servicio indicado' : ''}`);
    process.exitCode = failed ? 1 : 0;
  });
