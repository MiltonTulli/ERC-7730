import { Erc7730Error } from '../errors';

export type PathResolveErrorCode = 'invalid' | 'not_found' | 'missing_data';

export class PathResolveError extends Erc7730Error {
  readonly path: string;
  override readonly code: PathResolveErrorCode;

  constructor(message: string, path: string, code: PathResolveErrorCode) {
    super(code, `${path}: ${message}`);
    this.path = path;
    this.code = code;
  }
}
