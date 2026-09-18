export type PathResolveErrorCode = 'invalid' | 'not_found' | 'missing_data';

export class PathResolveError extends Error {
  readonly path: string;
  readonly code: PathResolveErrorCode;

  constructor(message: string, path: string, code: PathResolveErrorCode) {
    super(`${path}: ${message}`);
    this.name = 'PathResolveError';
    this.path = path;
    this.code = code;
  }
}
