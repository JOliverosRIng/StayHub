import { X509Certificate } from 'node:crypto';

import { httpsOptionsFrom } from '../../src/main';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

describe('httpsOptionsFrom (GW-010)', () => {
  it('reads the configured certificate and key and forwards the minimum TLS version', () => {
    const { config, tls, certificatePath, keyPath } = createTestGatewayConfig({
      GATEWAY_TLS_MIN_VERSION: 'TLSv1.3',
    });

    const options = httpsOptionsFrom(config);

    expect(Buffer.isBuffer(options.cert)).toBe(true);
    expect(Buffer.isBuffer(options.key)).toBe(true);
    expect(options.cert.toString()).toBe(tls.certPem);
    expect(options.key.toString()).toBe(tls.keyPem);
    expect(options.minVersion).toBe('TLSv1.3');
    expect(new X509Certificate(options.cert).subject.replace(/\n/g, ' ')).toBe('CN=localhost');
    expect(certificatePath).not.toBe(keyPath);
  });

  it('fails loudly when the certificate file is not readable', () => {
    const { config } = createTestGatewayConfig();
    const broken = { ...config, tls: { ...config.tls, certFile: 'C:/ausente/no-existe.crt' } };
    expect(() => httpsOptionsFrom(broken)).toThrow();
  });

  it('fails loudly when the private key file is not readable', () => {
    const { config } = createTestGatewayConfig();
    const broken = { ...config, tls: { ...config.tls, keyFile: 'C:/ausente/no-existe.key' } };
    expect(() => httpsOptionsFrom(broken)).toThrow();
  });
});
