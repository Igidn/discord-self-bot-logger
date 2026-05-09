import fs from 'fs';
import path from 'path';

export const PROJECT_ROOT = process.cwd();

/**
 * Resolve a path relative to the project storage directory.
 */
export function resolveStoragePath(...segments: string[]): string {
  return path.resolve(PROJECT_ROOT, 'storage', ...segments);
}

/**
 * Resolve a path relative to the project root.
 */
export function resolvePath(...segments: string[]): string {
  return path.resolve(PROJECT_ROOT, ...segments);
}

/**
 * Ensure a directory exists, creating it recursively if necessary.
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
