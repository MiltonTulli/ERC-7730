import { Erc7730Error } from '../errors';

/** `PathResolveError.code`. */
export type PathResolveErrorCode = 'invalid' | 'not_found' | 'missing_data';

/** `resolvePath` could not read `path`. `code` says whether the path or the data was wrong. */
export class PathResolveError extends Erc7730Error {
  readonly path: string;
  override readonly code: PathResolveErrorCode;

  constructor(message: string, path: string, code: PathResolveErrorCode) {
    super(code, `${path}: ${message}`);
    this.path = path;
    this.code = code;
  }
}
