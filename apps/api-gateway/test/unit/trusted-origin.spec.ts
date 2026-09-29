import { isIpInCidr, parseIp, normalizeIp } from '@gateway/infrastructure/security/ip';
import { TrustedOriginService } from '@gateway/infrastructure/security/trusted-origin.service';

describe('Primitivas de IP (GW-013)', () => {
  it('parsea IPv4 e IPv6 a su forma canónica', () => {
    expect(parseIp('192.168.10.4')).toBe('192.168.10.4');
    expect(parseIp('2001:db8::1')).toBe('2001:db8::1');
    expect(parseIp('no-es-una-ip')).toBeNull();
    expect(parseIp('999.1.1.1')).toBeNull();
    expect(parseIp('')).toBeNull();
  });

  it('normaliza IPv4 mapeada en IPv6 que reporta Node', () => {
    expect(normalizeIp('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(normalizeIp('  198.51.100.7  ')).toBe('198.51.100.7');
    expect(normalizeIp('no-es-una-ip')).toBeNull();
  });

  it('devuelve IPv6 en forma canonica comprimida (RFC 5952)', () => {
    expect(parseIp('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8::1');
    expect(parseIp('::1')).toBe('::1');
    expect(parseIp('::')).toBe('::');
    expect(parseIp('2001:db8:0:0:1:0:0:1')).toBe('2001:db8::1:0:0:1');
    expect(parseIp('fe80::1%eth0')).toBeNull();
    expect(parseIp('1:0:0:1:0:0:0:1')).toBe('1:0:0:1::1');
    expect(parseIp('1:0:0:1:0:0:1:1')).toBe('1::1:0:0:1:1');
  });

  it('aplica CIDR IPv4 incluido el prefijo /32 y el /0', () => {
    expect(isIpInCidr('203.0.113.9', '203.0.113.0/24')).toBe(true);
    expect(isIpInCidr('203.0.114.9', '203.0.113.0/24')).toBe(false);
    expect(isIpInCidr('203.0.113.9', '203.0.113.9/32')).toBe(true);
    expect(isIpInCidr('203.0.113.10', '203.0.113.9/32')).toBe(false);
    expect(isIpInCidr('203.0.113.9', '0.0.0.0/0')).toBe(true);
    expect(isIpInCidr('::1', '0.0.0.0/0')).toBe(false);
  });

  it('rechaza limites de red que no son prefijos legos', () => {
    expect(isIpInCidr('10.0.0.0', '10.0.0.0')).toBe(false);
    expect(isIpInCidr('10.0.0.1', '10.0.0.0/64')).toBe(false);
    expect(isIpInCidr('10.0.0.1', '10.0.0.0/33')).toBe(false);
    expect(isIpInCidr('10.0.0.1', 'no-cidr')).toBe(false);
  });

  it('aplica CIDR IPv6 sin mezclar familias', () => {
    expect(isIpInCidr('2001:db8::5', '2001:db8::/32')).toBe(true);
    expect(isIpInCidr('2001:db9::5', '2001:db8::/32')).toBe(false);
    expect(isIpInCidr('2001:db8::5', '203.0.113.0/24')).toBe(false);
    expect(isIpInCidr('2001:db8::1', '::/0')).toBe(true);
  });
});

describe('Origen confiable (GW-013, plan.md 3)', () => {
  const trusted = ['10.0.0.0/8', '172.16.0.0/12', '2001:db8::/32'];
  const service = new TrustedOriginService(trusted);

  it('toma el origen del socket cuando el cliente no reenvia ninguna cabecera', () => {
    expect(service.resolve('198.51.100.7', undefined)).toBe('198.51.100.7');
    expect(service.resolve('::ffff:198.51.100.7', undefined)).toBe('198.51.100.7');
  });

  it('ignora la cabecera reenviada cuando el peer inmediato no es un proxy permitido', () => {
    expect(service.resolve('198.51.100.7', '10.0.0.1')).toBe('198.51.100.7');
    expect(service.resolve('203.0.113.5', '1.2.3.4, 5.6.7.8')).toBe('203.0.113.5');
  });

  it('acepta la direccion reenviada cuando el peer inmediato es un proxy permitido', () => {
    expect(service.resolve('10.1.2.3', '198.51.100.7')).toBe('198.51.100.7');
    expect(service.resolve('172.16.5.5', '198.51.100.7')).toBe('198.51.100.7');
    expect(service.resolve('2001:db8::1', '198.51.100.7')).toBe('198.51.100.7');
  });

  it('devuelve el primer segmento no confiable recorriendo la cadena desde la derecha', () => {
    expect(service.resolve('10.0.0.1', '198.51.100.7, 10.2.3.4')).toBe('198.51.100.7');
    expect(service.resolve('10.0.0.1', '198.51.100.7, 172.20.0.1, 10.0.0.9')).toBe('198.51.100.7');
  });

  it('cae en el peer inmediato cuando toda la cadena es de proxies confiables', () => {
    expect(service.resolve('10.0.0.1', '10.0.0.5, 10.0.0.6')).toBe('10.0.0.5');
  });

  it('falla cerrado ante una cadena con direcciones invalidas', () => {
    expect(service.resolve('10.0.0.1', 'no-es-una-ip')).toBe('10.0.0.1');
    expect(service.resolve('10.0.0.1', '198.51.100.7, basura')).toBe('10.0.0.1');
  });

  it('falla cerrado cuando el socket no expone direccion utilizable', () => {
    expect(service.resolve(undefined, '198.51.100.7')).toBe('127.0.0.1');
  });
});
