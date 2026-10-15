import type { DirectoryMemberOptions, DirectoryMemberContext } from './request-contracts.js';
export function resolveMemberDirectoryContext(
  env: Partial<Env>,
  options: { request: Request; parishId: string }
): Promise<DirectoryMemberContext>;
export function getMemberDirectoryHome(env: Partial<Env>, options: DirectoryMemberOptions): Promise<unknown>;
export function getMemberDirectoryHousehold(env: Partial<Env>, options: DirectoryMemberOptions): Promise<unknown>;
export function getMemberDirectoryPerson(env: Partial<Env>, options: DirectoryMemberOptions): Promise<unknown>;
export function listMemberDirectoryHouseholds(env: Partial<Env>, options: DirectoryMemberOptions): Promise<unknown>;
export function listMemberDirectoryPeople(env: Partial<Env>, options: DirectoryMemberOptions): Promise<unknown>;
export function searchMemberDirectory(env: Partial<Env>, options: DirectoryMemberOptions): Promise<unknown>;
export function streamMemberDirectoryMediaVariant(
  env: Partial<Env>,
  options: DirectoryMemberOptions
): Promise<Response>;
