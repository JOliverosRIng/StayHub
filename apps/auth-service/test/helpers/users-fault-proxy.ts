import http from 'node:http';

// Proxy de fallos Auth -> Users para el harness Auth<->Users (task-07).
//
// Reenvía cada petición a Users real sin modificarla. Una regla puede:
// - `drop-response`: reenviar la petición, esperar la respuesta completa de Users
//   (la escritura ya está confirmada) y cortar la conexión con Auth sin entregarla.
// - `refuse`: cortar la conexión sin reenviar (Users inalcanzable para esa llamada).
// Nunca fabrica usuarios ni respuestas de negocio.

export type FaultMode = 'drop-response' | 'refuse';

export interface FaultRule {
  readonly method: string;
  readonly path: RegExp;
  readonly mode: FaultMode;
  // Número de peticiones coincidentes afectadas antes de desactivarse.
  readonly times: number;
}

export interface ProxyHit {
  readonly method: string;
  readonly path: string;
  readonly upstreamStatus: number | null;
  readonly fault: FaultMode | null;
}

export interface UsersFaultProxy {
  readonly url: string;
  inject(rule: FaultRule): void;
  clear(): void;
  hits(): readonly ProxyHit[];
  resetHits(): void;
  close(): Promise<void>;
}

interface ActiveRule {
  readonly rule: FaultRule;
  remaining: number;
}

export async function startUsersFaultProxy(port: number, upstreamPort: number): Promise<UsersFaultProxy> {
  let rules: ActiveRule[] = [];
  let hits: ProxyHit[] = [];

  const takeFault = (method: string, path: string): FaultMode | null => {
    const active = rules.find(
      (entry) => entry.remaining > 0 && entry.rule.method === method && entry.rule.path.test(path),
    );
    if (active === undefined) return null;
    active.remaining -= 1;
    return active.rule.mode;
  };

  const server = http.createServer((request, response) => {
    const method = request.method ?? 'GET';
    const path = request.url ?? '/';
    const fault = takeFault(method, path);
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      if (fault === 'refuse') {
        hits.push({ method, path, upstreamStatus: null, fault });
        request.socket.destroy();
        return;
      }
      const upstream = http.request(
        { host: '127.0.0.1', port: upstreamPort, method, path, headers: request.headers },
        (upstreamResponse) => {
          const body: Buffer[] = [];
          upstreamResponse.on('data', (chunk: Buffer) => body.push(chunk));
          upstreamResponse.on('end', () => {
            hits.push({ method, path, upstreamStatus: upstreamResponse.statusCode ?? null, fault });
            if (fault === 'drop-response') {
              request.socket.destroy();
              return;
            }
            response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
            response.end(Buffer.concat(body));
          });
        },
      );
      upstream.on('error', () => {
        // Users caído detrás del proxy: la conexión se corta igual que sin proxy.
        hits.push({ method, path, upstreamStatus: null, fault });
        request.socket.destroy();
      });
      upstream.end(Buffer.concat(chunks));
    });
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolvePromise());
  });

  return {
    url: `http://127.0.0.1:${port}`,
    inject: (rule: FaultRule): void => {
      rules.push({ rule, remaining: rule.times });
    },
    clear: (): void => {
      rules = [];
    },
    hits: (): readonly ProxyHit[] => hits,
    resetHits: (): void => {
      hits = [];
    },
    close: (): Promise<void> =>
      new Promise<void>((resolvePromise) => {
        server.closeAllConnections();
        server.close(() => resolvePromise());
      }),
  };
}
