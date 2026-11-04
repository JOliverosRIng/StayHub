export interface ProjectionChannel { publish(exchange: string, routingKey: string, payload: Buffer, options: { persistent: true; contentType: 'application/json' }): boolean; }
export function publishProjectionFixture(channel: ProjectionChannel, event: unknown, exchange = 'stayhub.search.v1'): boolean {
  const type = typeof event === 'object' && event !== null && 'eventType' in event ? String((event as { eventType: unknown }).eventType) : 'invalid';
  return channel.publish(exchange, type, Buffer.from(JSON.stringify(event)), { persistent: true, contentType: 'application/json' });
}
