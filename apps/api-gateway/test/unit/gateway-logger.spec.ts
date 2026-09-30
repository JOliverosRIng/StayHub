import { GatewayLogger } from '@gateway/infrastructure/observability/gateway-logger';

const JWT = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJhYmMifQ.c2lnbmF0dXJl';
const EMAIL = 'ana@stayhub.example';

const captureWrites = (run: () => void): string[] => {
  const written: string[] = [];
  const stdout = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    written.push(String(chunk));
    return true;
  });
  const stderr = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    written.push(String(chunk));
    return true;
  });
  try {
    run();
  } finally {
    stdout.mockRestore();
    stderr.mockRestore();
  }
  return written;
};

const logged = (run: () => void): Record<string, unknown> => {
  const lines = captureWrites(run);
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
};

describe('GatewayLogger (GW-012)', () => {
  let logger: GatewayLogger;

  beforeEach(() => {
    logger = new GatewayLogger();
  });

  it('emite una sola linea JSON con timestamp, level y servicio', () => {
    const record = logged(() => logger.log('peticion_registrada'));

    expect(record['level']).toBe('info');
    expect(record['service']).toBe('api-gateway');
    expect(record['message']).toBe('peticion_registrada');
    expect(typeof record['timestamp']).toBe('string');
  });

  it('redacta la contrasena en el contexto', () => {
    const record = logged(() => logger.log('alta', { password: 'hunter2' }));

    expect(record['context']).toEqual({ password: '[REDACTED]' });
    expect(JSON.stringify(record)).not.toContain('hunter2');
  });

  it('redacta el refresh token en el contexto', () => {
    const record = logged(() => logger.log('refresh', { refreshToken: 'r-9f8a7b6c' }));

    expect(record['context']).toEqual({ refreshToken: '[REDACTED]' });
  });

  it('redacta el service JWT', () => {
    const record = logged(() => logger.log('service_auth', { serviceToken: JWT }));

    expect(record['context']).toEqual({ serviceToken: '[REDACTED]' });
  });

  it('redacta la cabecera authorization y las cookies', () => {
    const record = logged(() =>
      logger.log('entrada', { authorization: `Bearer ${JWT}`, cookie: 'refresh=abc' }),
    );

    expect(record['context']).toEqual({ authorization: '[REDACTED]', cookie: '[REDACTED]' });
  });

  it('redacta el correo', () => {
    const record = logged(() => logger.log('alta', { email: EMAIL }));

    expect(record['context']).toEqual({ email: '[REDACTED]' });
    expect(JSON.stringify(record)).not.toContain(EMAIL);
  });

  it('redacta la foto codificada en base64', () => {
    const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD';

    const record = logged(() => logger.log('perfil', { photo }));

    expect(record['context']).toEqual({ photo: '[REDACTED]' });
    expect(JSON.stringify(record)).not.toContain('base64');
  });

  it('redacta un JWT que aparezca dentro del mensaje', () => {
    const record = logged(() => logger.log(`bearer rechazado ${JWT}`));

    expect(String(record['message'])).not.toContain(JWT);
    expect(String(record['message'])).toContain('[REDACTED]');
  });

  it('redacta un correo que aparezca dentro del mensaje', () => {
    const record = logged(() => logger.log(`alta de ${EMAIL} rechazada`));

    expect(String(record['message'])).not.toContain(EMAIL);
  });

  it('conserva traceId, status y code porque son claves permitidas', () => {
    const record = logged(() =>
      logger.log('peticion', { traceId: 't-12345678', status: 503, code: 'DEPENDENCY_UNAVAILABLE' }),
    );

    expect(record['context']).toEqual({
      traceId: 't-12345678',
      status: 503,
      code: 'DEPENDENCY_UNAVAILABLE',
    });
  });

  it('descarta claves de contexto que no estan en la allowlist', () => {
    const record = logged(() => logger.log('peticion', { codigoPostal: '28001', status: 200 }));

    expect(record['context']).toEqual({ status: 200 });
  });

  it('sustituye un array por su cardinalidad, sin volcar su contenido', () => {
    const record = logged(() => logger.log(['a', 'b', 'c']));

    expect(record['message']).toEqual({ count: 3 });
    expect(JSON.stringify(record)).not.toContain('"a"');
  });

  it('descarta un array que llegue en el contexto bajo una clave no permitida', () => {
    const record = logged(() => logger.log('peticion', { items: ['a', 'b', 'c'] }));

    expect(record['context']).toEqual({});
    expect(JSON.stringify(record)).not.toContain('"a"');
  });

  it('no filtra el mensaje de un Error, solo su nombre', () => {
    const record = logged(() => logger.error(new Error('fallo con hunter2')));

    expect(record['message']).toEqual({ name: 'Error', kind: 'error' });
    expect(JSON.stringify(record)).not.toContain('hunter2');
  });

  it('normaliza un nombre de Error hostil', () => {
    const hostile = new Error('x');
    hostile.name = 'Error <script>alert(1)</script>';

    const record = logged(() => logger.error(hostile));

    expect(record['message']).toEqual({ name: 'Error', kind: 'error' });
  });

  it('escribe los errores en stderr y el resto en stdout', () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    logger.error('fallo');
    logger.warn('aviso');
    logger.log('info');
    logger.debug('depuracion');
    logger.verbose('detalle');

    expect(stderr).toHaveBeenCalledTimes(1);
    expect(stdout).toHaveBeenCalledTimes(4);
    stdout.mockRestore();
    stderr.mockRestore();
  });

  it('no escribe nada extra cuando el contexto es undefined', () => {
    const record = logged(() => logger.log('sin_contexto'));

    expect('context' in record).toBe(false);
  });

  it('colapsa varios argumentos de contexto en uno solo', () => {
    const record = logged(() => logger.error('fallo', { status: 500 }, { traceId: 't-87654321' }));

    expect(record['context']).toEqual({ status: 500, traceId: 't-87654321' });
  });
});
