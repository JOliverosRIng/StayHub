// Transaction callbacks receive application-owned repositories, never Prisma types.
export interface UnitOfWork<TRepositories> {
  transaction<T>(work: (repositories: TRepositories) => Promise<T>): Promise<T>;
}
