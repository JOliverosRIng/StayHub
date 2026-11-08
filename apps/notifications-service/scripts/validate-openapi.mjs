import SwaggerParser from '@apidevtools/swagger-parser';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';

const contractPath = new URL('../../../specs/003-notificaciones/contracts/openapi-notifications-service.yaml', import.meta.url);
const text = await readFile(contractPath, 'utf8');
const document = YAML.parse(text);
await SwaggerParser.validate(document);

const expected = new Map([
  ['/notifications/send', ['post', 'sendNotification']],
  ['/notifications/events/booking-confirmed', ['post', 'bookingConfirmedEvent']],
  ['/notifications/user/{id}', ['get', 'listUserNotifications']],
]);
const actualPaths = Object.keys(document.paths ?? {}).sort();
if (JSON.stringify(actualPaths) !== JSON.stringify([...expected.keys()].sort())) throw new Error('OpenAPI paths differ from the approved route set');
for (const [path, [method, operationId]] of expected) {
  const operation = document.paths[path][method];
  if (!operation || operation.operationId !== operationId) throw new Error(`Missing ${method.toUpperCase()} ${path} operation`);
}
for (const scheme of ['accessJwt', 'serviceJwt']) {
  if (document.components?.securitySchemes?.[scheme]?.scheme !== 'bearer') throw new Error(`Missing bearer security scheme ${scheme}`);
}
process.stdout.write('OpenAPI contract valid: 3 operations, schemas and security schemes.\n');
