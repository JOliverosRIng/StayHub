#!/usr/bin/env node
// Development-only seed. State is retained locally to avoid duplicate writes after retries.
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = 'http://localhost:5173/api/v1';
const statePath = resolve('.artifacts/demo-properties-state.json');
const photos = ['070021','070027','070033','070037','070041','070048','070418','070435','070447','070500'];
// Approximate city markers for fictional demo properties.
const places = [
  ['Leticia', 'Amazonas', 'CO', -4.215, -69.941],
  ['Medellín', 'Antioquia', 'CO', 6.251, -75.564],
  ['Arauca', 'Arauca', 'CO', 7.084, -70.759],
  ['Barranquilla', 'Atlántico', 'CO', 10.987, -74.789],
  ['Cartagena', 'Bolívar', 'CO', 10.423, -75.550],
  ['Tunja', 'Boyacá', 'CO', 5.533, -73.362],
  ['Manizales', 'Caldas', 'CO', 5.068, -75.518],
  ['Florencia', 'Caquetá', 'CO', 1.615, -75.606],
  ['Yopal', 'Casanare', 'CO', 5.337, -72.395],
  ['Popayán', 'Cauca', 'CO', 2.441, -76.606],
  ['Valledupar', 'Cesar', 'CO', 10.476, -73.251],
  ['Quibdó', 'Chocó', 'CO', 5.692, -76.659],
  ['Montería', 'Córdoba', 'CO', 8.748, -75.881],
  ['Bogotá', 'Cundinamarca', 'CO', 4.609, -74.082],
  ['Inírida', 'Guainía', 'CO', 3.865, -67.923],
  ['San José del Guaviare', 'Guaviare', 'CO', 2.573, -72.645],
  ['Neiva', 'Huila', 'CO', 2.927, -75.281],
  ['Riohacha', 'La Guajira', 'CO', 11.548, -72.908],
  ['Santa Marta', 'Magdalena', 'CO', 11.240, -74.211],
  ['Villavicencio', 'Meta', 'CO', 4.142, -73.627],
  ['Pasto', 'Nariño', 'CO', 1.214, -77.281],
  ['Cúcuta', 'Norte de Santander', 'CO', 7.894, -72.508],
  ['Mocoa', 'Putumayo', 'CO', 1.149, -76.648],
  ['Armenia', 'Quindío', 'CO', 4.534, -75.682],
  ['Pereira', 'Risaralda', 'CO', 4.814, -75.694],
  ['San Andrés', 'San Andrés y Providencia', 'CO', 12.584, -81.700],
  ['Bucaramanga', 'Santander', 'CO', 7.119, -73.123],
  ['Sincelejo', 'Sucre', 'CO', 9.304, -75.399],
  ['Ibagué', 'Tolima', 'CO', 4.438, -75.232],
  ['Cali', 'Valle del Cauca', 'CO', 3.451, -76.532],
  ['Mitú', 'Vaupés', 'CO', 1.198, -70.174],
  ['Puerto Carreño', 'Vichada', 'CO', 6.189, -67.486],
  ['Washington D. C.', 'Distrito de Columbia', 'US', 38.907, -77.037],
  ['Madrid', 'Madrid', 'ES', 40.417, -3.704],
  ['Roma', 'Lazio', 'IT', 41.903, 12.496],
  ['Berlín', 'Berlín', 'DE', 52.520, 13.405],
  ['Londres', 'Inglaterra', 'GB', 51.507, -0.128],
];
await mkdir(resolve('.artifacts'), { recursive: true });
let state;
try { state = JSON.parse(await readFile(statePath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; state = { email: `demo-owner-${randomUUID()}@stayhub.test`, password: `Demo-${randomUUID()}`, registerKey: randomUUID(), registered: false, properties: {} }; }
async function save() { const tmp = `${statePath}.tmp`; await writeFile(tmp, JSON.stringify(state, null, 2), { mode: 0o600 }); await rename(tmp, statePath); }
await save();
async function api(method, path, { token, json, form, headers = {} } = {}) {
  const init = { method, headers: { accept: 'application/json', ...headers } };
  if (token) init.headers.authorization = `Bearer ${token}`;
  if (json) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(json); }
  if (form) init.body = form;
  const response = await fetch(`${base}${path}`, init);
  const text = await response.text(); let body; try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status} ${body?.code || ''}`);
  return body;
}
if (!state.registered) {
  await api('POST', '/auth/register', { headers: { 'Idempotency-Key': state.registerKey }, json: { name: 'Anfitrión demostración', email: state.email, password: state.password, role: 'OWNER' } });
  state.registered = true; await save();
}
let token;
for (let i = 0; i < 20; i++) { try { token = (await api('POST', '/auth/login', { json: { email: state.email, password: state.password } })).accessToken; break; } catch { await new Promise(r => setTimeout(r, 500)); } }
if (!token) throw new Error('No se pudo iniciar sesión con el anfitrión de demostración.');
for (const [i, [city, region, country, latitude, longitude]] of places.entries()) {
  const key = `${country}-${city}`;
  const item = state.properties[key] ??= {};
  if (item.creating && !item.id) throw new Error(`Creación anterior incierta para ${key}; reconciliar antes de reintentar para evitar duplicados.`);
  if (!item.id) {
    item.creating = true; await save();
    const property = await api('POST', '/properties', { token, json: {
      type: 'APARTMENT', name: `StayHub demostración ${city}`,
      description: `Alojamiento ficticio de demostración en ${city}. Las fotografías son ilustrativas y no identifican un inmueble real.`,
      location: { addressLine: 'Dirección ficticia de demostración', city, region, country, latitude, longitude },
      featureCodes: i % 3 === 0 ? ['WIFI','PARKING','POOL'] : ['WIFI','PARKING'],
      rooms: [{ name: 'Habitación principal', capacity: 2 + (i % 3), basePrice: { amount: country === 'CO' ? `${120000 + i * 3000}.00` : '120.00', currency: country === 'CO' ? 'COP' : country === 'US' ? 'USD' : country === 'GB' ? 'GBP' : 'EUR' } }],
    } });
    item.id = property.id; delete item.creating; await save();
  }
  let current = await api('GET', `/properties/${item.id}`, { token });
  if (!current.photos.length) {
    if (item.uploading) throw new Error(`Carga de foto incierta para ${key}; revisar antes de reintentar.`);
    item.uploading = true; await save();
    const bytes = await readFile(resolve(`assets/demo-photos/${photos[i % photos.length]}.png`));
    const form = new FormData(); form.append('file', new Blob([bytes], { type: 'image/png' }), 'demo.png');
    await api('POST', `/properties/${item.id}/photos`, { token, form });
    delete item.uploading; await save();
    current = await api('GET', `/properties/${item.id}`, { token });
  } else if (item.uploading) { delete item.uploading; await save(); }
  if (current.status !== 'PUBLISHED') {
    await api('POST', `/properties/${item.id}/verification`, { token, json: { version: current.version } });
    console.log(`${key}: pendiente de revisión autorizada.`);
  }
  console.log(`${i + 1}/${places.length} ${city}: ${item.id}`);
}
console.log('Propiedades de demostración procesadas:', places.length);
