import { ResolveLoginIdentity } from '../../src/application/login/resolve-login-identity.use-case';
describe('USR-039 minimal active lookup', () => {
  it('normalizes email and projects only canonical identity fields', async () => {
    const find = jest.fn().mockResolvedValue({ userId: 'id', role: 'ADMIN', status: 'ACTIVE', name: 'must not leak' });
    const useCase = new ResolveLoginIdentity({ findActiveLoginIdentityByNormalizedEmail: find });
    expect(await useCase.execute('  SAMPLE@example.test ')).toEqual({ userId: 'id', role: 'ADMIN', status: 'ACTIVE' });
    expect(find).toHaveBeenCalledWith('sample@example.test');
  });
  it('reports the same absence for unavailable identities', async () => {
    const useCase = new ResolveLoginIdentity({ findActiveLoginIdentityByNormalizedEmail: jest.fn().mockResolvedValue(null) });
    await expect(useCase.execute('missing@example.test')).rejects.toThrow('NOT_FOUND');
  });
});
