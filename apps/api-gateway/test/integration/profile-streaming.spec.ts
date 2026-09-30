import { Readable, Transform, Writable, pipeline } from 'node:stream';

import { HttpException } from '@nestjs/common';

/**
 * GW-044 — Streaming de la foto de perfil (FR-015–FR-019, FR-024).
 *
 * Test-first: el interceptor de streaming se implementa en GW-047, por lo que este spec DEBE
 * quedar en rojo. La pieza se carga por import dinámico con especificador variable, de modo que
 * TypeScript/ESLint permanecen verdes y el fallo ocurre en tiempo de ejecución con "Cannot find
 * module …/profile-streaming.interceptor" — es decir, por interceptor ausente, no por harness.
 *
 * El límite es EXACTAMENTE 5.000.000 bytes decimales (no 5 MiB): 5.000.000 pasa, 5.000.001 → 413,
 * y el rechazo ocurre DURANTE el streaming (no tras cargar todo en memoria). La foto pasa sin
 * transformación (no base64), con backpressure y cancelación correctas, y sin filtrarse en logs.
 *
 * El reenvío real de la foto a Users se apoya en el cliente base de GW-018 (vía GW-046); aquí se
 * ejercita la primitiva de límite/streaming que GW-047 aporta al interceptor.
 */

const MODULE = '../../src/modules/users/profile-streaming.interceptor';
const PAYLOAD_TOO_LARGE = 413;

type PhotoByteLimitFactory = (maxBytes?: number) => Transform;

interface StreamingModule {
  photoByteLimit: PhotoByteLimitFactory;
  PHOTO_MAX_BYTES: number;
}

async function loadStreaming(): Promise<StreamingModule> {
  const specifier: string = MODULE;
  const module = (await import(specifier)) as {
    photoByteLimit?: PhotoByteLimitFactory;
    PHOTO_MAX_BYTES?: number;
  };
  if (module.photoByteLimit === undefined || module.PHOTO_MAX_BYTES === undefined) {
    throw new Error('GW-047 pendiente: profile-streaming.interceptor no exporta photoByteLimit/PHOTO_MAX_BYTES');
  }
  return { photoByteLimit: module.photoByteLimit, PHOTO_MAX_BYTES: module.PHOTO_MAX_BYTES };
}

function sourceOfSize(total: number, chunkSize = 65_536): Readable {
  let sent = 0;
  return new Readable({
    read(): void {
      if (sent >= total) {
        this.push(null);
        return;
      }
      const size = Math.min(chunkSize, total - sent);
      sent += size;
      this.push(Buffer.alloc(size, 0x41));
    },
  });
}

function sourceOfBuffer(buffer: Buffer, chunkSize = 65_536): Readable {
  let offset = 0;
  return new Readable({
    read(): void {
      if (offset >= buffer.length) {
        this.push(null);
        return;
      }
      const end = Math.min(offset + chunkSize, buffer.length);
      this.push(buffer.subarray(offset, end));
      offset = end;
    },
  });
}

interface PipeResult {
  readonly received: number;
  readonly chunks: number;
  readonly data: Buffer;
  readonly error: unknown;
}

function runPipe(source: Readable, limiter: Transform): Promise<PipeResult> {
  return new Promise((resolve) => {
    let received = 0;
    let chunks = 0;
    const collected: Buffer[] = [];
    const sink = new Writable({
      write(chunk: unknown, _encoding, callback): void {
        const buffer = chunk as Buffer;
        received += buffer.length;
        chunks += 1;
        collected.push(Buffer.from(buffer));
        callback();
      },
    });
    pipeline(source, limiter, sink, (error) =>
      resolve({ received, chunks, data: Buffer.concat(collected), error: error ?? undefined }),
    );
  });
}

describe('Streaming de la foto de perfil (GW-044)', () => {
  it('usa el límite decimal exacto de 5.000.000 bytes (no 5 MiB)', async () => {
    const { PHOTO_MAX_BYTES } = await loadStreaming();
    expect(PHOTO_MAX_BYTES).toBe(5_000_000);
    expect(PHOTO_MAX_BYTES).not.toBe(5 * 1024 * 1024);
  });

  it('deja pasar una foto de exactamente 5.000.000 bytes', async () => {
    const { photoByteLimit, PHOTO_MAX_BYTES } = await loadStreaming();

    const result = await runPipe(sourceOfSize(PHOTO_MAX_BYTES), photoByteLimit());

    expect(result.error).toBeUndefined();
    expect(result.received).toBe(PHOTO_MAX_BYTES);
  });

  it('rechaza con 413 una foto de 5.000.001 bytes durante el streaming, sin bufferizarla entera', async () => {
    const { photoByteLimit, PHOTO_MAX_BYTES } = await loadStreaming();

    const result = await runPipe(sourceOfSize(PHOTO_MAX_BYTES + 1), photoByteLimit());

    expect(result.error).toBeInstanceOf(HttpException);
    expect((result.error as HttpException).getStatus()).toBe(PAYLOAD_TOO_LARGE);
    // Se cortó durante el streaming: nunca se emitieron más bytes que el límite.
    expect(result.received).toBeLessThanOrEqual(PHOTO_MAX_BYTES);
  });

  it('transmite los bytes sin transformarlos (no base64, no buffering total)', async () => {
    const { photoByteLimit } = await loadStreaming();
    const input = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03, 0x04, 0xff, 0xd9]);

    const result = await runPipe(sourceOfBuffer(input), photoByteLimit());

    expect(result.error).toBeUndefined();
    expect(result.data.equals(input)).toBe(true);
  });

  it('emite los datos de forma incremental (streaming, no un único bloque bufferizado)', async () => {
    const { photoByteLimit } = await loadStreaming();

    const result = await runPipe(sourceOfSize(10 * 1024, 1024), photoByteLimit());

    expect(result.error).toBeUndefined();
    expect(result.chunks).toBeGreaterThanOrEqual(2);
  });

  it('respeta el backpressure: write() devuelve false cuando el destino no drena', async () => {
    const { photoByteLimit } = await loadStreaming();
    const limiter = photoByteLimit();
    const chunk = Buffer.alloc(65_536, 0x41);

    let backpressured = false;
    for (let attempt = 0; attempt < 16 && !backpressured; attempt += 1) {
      if (!limiter.write(chunk)) backpressured = true;
    }

    expect(backpressured).toBe(true);
    limiter.destroy();
  });

  it('ante una cancelación del cliente corta el stream y libera el origen', async () => {
    const { photoByteLimit, PHOTO_MAX_BYTES } = await loadStreaming();
    const limiter = photoByteLimit();
    const source = sourceOfSize(PHOTO_MAX_BYTES);
    const sink = new Writable({
      write(_chunk: unknown, _encoding, callback): void {
        callback();
      },
    });

    const settled = new Promise<void>((resolve) => {
      pipeline(source, limiter, sink, () => resolve());
    });
    setImmediate(() => limiter.destroy());
    await settled;

    expect(source.destroyed).toBe(true);
  });

  it('no filtra los bytes de la foto ni datos sensibles en logs', async () => {
    const { photoByteLimit } = await loadStreaming();
    const marker = 'SECRET-PHOTO-CONTENT';
    const input = Buffer.from(marker.repeat(200));

    const captured: string[] = [];
    const writer = ((chunk: Uint8Array | string): boolean => {
      captured.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stdout.write;
    const originalOut = process.stdout.write.bind(process.stdout);
    const originalErr = process.stderr.write.bind(process.stderr);
    process.stdout.write = writer;
    process.stderr.write = writer;
    try {
      await runPipe(sourceOfBuffer(input), photoByteLimit());
    } finally {
      process.stdout.write = originalOut;
      process.stderr.write = originalErr;
    }

    expect(captured.join('')).not.toContain(marker);
  });
});
