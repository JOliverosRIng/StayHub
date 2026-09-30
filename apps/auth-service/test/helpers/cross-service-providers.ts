const REQUIRED_VARIABLES = [
  'CROSS_SERVICE_USERS_SERVICE_URL',
  'CROSS_SERVICE_GATEWAY_URL',
] as const;

export function requireCrossServiceProviders(): void {
  const missing =
    process.env.CROSS_SERVICE_PROVIDERS !== 'true' ||
    REQUIRED_VARIABLES.some((name) => process.env[name] === undefined || process.env[name] === '');
  if (missing) {
    throw new Error(
      [
        'Cross-service suites need the real G1/G2 providers and will not run against local stubs.',
        `Set CROSS_SERVICE_PROVIDERS=true and define: ${REQUIRED_VARIABLES.join(', ')}.`,
        'Run local contract/integration suites with test:contract / test:integration instead.',
      ].join(' '),
    );
  }
}
