import { Transform, type Readable, type TransformCallback } from 'node:stream';

import {
  Inject,
  Injectable,
  PayloadTooLargeException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';

import { GATEWAY_CONFIG, type GatewayConfig } from '@gateway/infrastructure/config/gateway-config';

/**
 * GW-047 — Streaming de la foto con límite de tamaño exacto (FR-015–FR-016, FR-024).
 *
 * El límite es EXACTAMENTE 5.000.000 bytes decimales (no 5 MiB). {@link photoByteLimit} es un
 * `Transform` que deja pasar los bytes SIN transformarlos (no base64) y sin bufferizar la foto
 * completa: cuenta a medida que fluyen y, al superar el byte 5.000.000, corta con `413`
 * (PayloadTooLargeException) emitiendo como mucho el límite. Respeta backpressure (es un Transform
 * estándar) y cancelación (destruirlo propaga la destrucción al origen y libera recursos). No
 * registra los bytes de la foto ni datos sensibles.
 *
 * El interceptor envuelve el cuerpo entrante de la subida con ese límite por streaming y lo expone
 * para que la ruta (GW-048) lo reenvíe a Users con el cliente de GW-046. No duplica transporte: el
 * envío real lo hace el cliente Users; aquí solo se acota el flujo.
 */

export const PHOTO_MAX_BYTES = 5_000_000;

/**
 * Transform que corta el flujo con `413` al superar `maxBytes`, pasando los bytes sin modificar.
 * Emite a lo sumo `maxBytes` antes de cortar, de modo que el límite se aplica durante el streaming
 * y no tras cargar todo en memoria.
 */
export function photoByteLimit(maxBytes: number = PHOTO_MAX_BYTES): Transform {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
      const remaining = maxBytes - total;
      if (chunk.length <= remaining) {
        total += chunk.length;
        callback(null, chunk);
        return;
      }
      // El chunk cruza el límite: emitir solo hasta el límite y cortar con 413.
      if (remaining > 0) {
        total += remaining;
        this.push(chunk.subarray(0, remaining));
      }
      callback(new PayloadTooLargeException({ code: 'PHOTO_TOO_LARGE' }));
    },
  });
}

/** Propiedad donde el interceptor expone el flujo de foto ya acotado para la ruta (GW-048). */
const PHOTO_STREAM = Symbol('gateway:photo-stream');

interface StreamingRequest extends Request {
  [PHOTO_STREAM]?: Readable;
}

/** Devuelve el flujo de foto acotado que preparó el interceptor, o `undefined` si no hubo cuerpo. */
export function photoStreamFrom(request: Request): Readable | undefined {
  return (request as StreamingRequest)[PHOTO_STREAM];
}

@Injectable()
export class ProfileStreamingInterceptor implements NestInterceptor {
  public constructor(@Inject(GATEWAY_CONFIG) private readonly config: GatewayConfig) {}

  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    (request as StreamingRequest)[PHOTO_STREAM] = request.pipe(photoByteLimit(this.config.maxPhotoBytes));
    return next.handle();
  }
}
