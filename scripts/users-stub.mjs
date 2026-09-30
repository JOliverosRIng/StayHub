import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

// Stub en memoria del contrato candidato de Users
// (agents/contrato-users-candidato.md) para desarrollo y pruebas manuales.
export function startUsersStub(port, options = {}) {
  const log = options.log ?? (() => {});
  const users = new Map();
  const byEmail = new Map();
  const summary = (user) => ({
    id: user.userId,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
  });

  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    let body;
    try {
      body = raw === '' ? undefined : JSON.parse(raw);
    } catch {
      body = raw;
    }
    const segments = (request.url ?? '/').split('?')[0].split('/').filter(Boolean);
    const method = (request.method ?? 'GET').toUpperCase();
    const send = (status, payload) => {
      if (payload === undefined) {
        response.statusCode = status;
        response.end();
        return;
      }
      response.writeHead(status, { 'content-type': 'application/problem+json' });
      response.end(JSON.stringify(payload));
    };
    log(`${method} /${segments.join('/')} ${raw}`.trim());

    if (method === 'POST' && segments.join('/') === 'internal/v1/registrations') {
      const { registrationId, userId, name, email, role } = body ?? {};
      if (!registrationId || !userId || !name || !email || !role) return send(400, { code: 'INVALID_BODY' });
      if (users.has(registrationId)) return send(200, summary(users.get(registrationId)));
      if (byEmail.has(email.toLowerCase())) return send(409, { code: 'EMAIL_CONFLICT' });
      const user = { registrationId, userId, name, email, role, status: 'PENDING' };
      users.set(registrationId, user);
      byEmail.set(email.toLowerCase(), registrationId);
      return send(201, summary(user));
    }
    if (method === 'GET' && segments.length === 4 && segments.slice(0, 3).join('/') === 'internal/v1/registrations') {
      const user = users.get(segments[3]);
      return user ? send(200, summary(user)) : send(404, { code: 'REGISTRATION_NOT_FOUND' });
    }
    if (method === 'POST' && segments.length === 5 && segments[4] === 'activate') {
      const user = users.get(segments[3]);
      if (!user) return send(404, { code: 'REGISTRATION_NOT_FOUND' });
      if (user.status === 'CANCELLED') return send(409, { code: 'REGISTRATION_CANCELLED' });
      user.status = 'ACTIVE';
      return send(200, summary(user));
    }
    if (method === 'POST' && segments.length === 5 && segments[4] === 'cancel') {
      const user = users.get(segments[3]);
      if (!user) return send(404, { code: 'REGISTRATION_NOT_FOUND' });
      if (user.status === 'ACTIVE') return send(409, { code: 'REGISTRATION_ACTIVE' });
      user.status = 'CANCELLED';
      return send(204, undefined);
    }
    if (method === 'POST' && segments.join('/') === 'internal/v1/login-identities/resolve') {
      const email = body?.email?.toLowerCase();
      const registrationId = email === undefined ? undefined : byEmail.get(email);
      const user = registrationId === undefined ? undefined : users.get(registrationId);
      if (!user || user.status !== 'ACTIVE') return send(404, { code: 'IDENTITY_NOT_FOUND' });
      return send(200, { userId: user.userId, role: user.role, status: 'ACTIVE' });
    }
    return send(404, { code: 'ROUTE_NOT_FOUND' });
  });

  return new Promise((resolve) => server.listen(port, '0.0.0.0', () => resolve(server)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.env.USERS_STUB_PORT ?? 4000);
  void startUsersStub(port, { log: (line) => console.log(`[users-stub] ${line}`) }).then(() => {
    console.log(`[users-stub] escuchando en 0.0.0.0:${port}`);
  });
}
