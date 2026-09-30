// An operation must either commit completely or reject without persisting any of its writes.
// Transaction context remains adapter-owned; domain/application never receive Prisma types.
export interface UnitOfWork<TRepositories> { transaction<T>(work: (repositories: TRepositories) => Promise<T>): Promise<T> }
