// Timeout de arranque del harness Auth<->Users (task-05): compilación opcional,
// migraciones y readiness de dos servicios. No relaja los timeouts HTTP de las
// peticiones productivas, que viven en el propio harness.
jest.setTimeout(900_000);
