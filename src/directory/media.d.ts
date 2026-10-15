import type { DirectoryMediaOptions } from './request-contracts.js';
export function completeDirectoryMediaUpload(env: Partial<Env>, options: DirectoryMediaOptions): Promise<unknown>;
export function createDirectoryMediaUploadSession(env: Partial<Env>, options: DirectoryMediaOptions): Promise<unknown>;
export function getCurrentDirectoryMediaForOwner(env: Partial<Env>, options: DirectoryMediaOptions): Promise<unknown>;
export function removeDirectoryMedia(env: Partial<Env>, options: DirectoryMediaOptions): Promise<unknown>;
export function streamDirectoryMediaVariant(env: Partial<Env>, options: DirectoryMediaOptions): Promise<Response>;
export function submitDirectoryMediaForReview(env: Partial<Env>, options: DirectoryMediaOptions): Promise<unknown>;
export function updateDirectoryMediaVisibility(env: Partial<Env>, options: DirectoryMediaOptions): Promise<unknown>;
