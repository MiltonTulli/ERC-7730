import { Erc7730Error } from '../errors';

export type OfficialRegistryErrorCode =
  | 'REGISTRY_FETCH_FAILED'
  | 'REGISTRY_NOT_FOUND'
  | 'INVALID_PIN'
  | 'INVALID_REF'
  | 'INDEX_MALFORMED';

export class OfficialRegistryError extends Erc7730Error {
  override readonly code: OfficialRegistryErrorCode;

  constructor(code: OfficialRegistryErrorCode, message: string, options?: { cause?: unknown }) {
    super(code, message, options);
    this.code = code;
  }
}

export function registryHttpError(
  path: string,
  status: number,
  pin: string
): OfficialRegistryError {
  return new OfficialRegistryError(
    status === 404 ? 'REGISTRY_NOT_FOUND' : 'REGISTRY_FETCH_FAILED',
    `Failed to fetch ${path} (${status}) from pin ${pin}`
  );
}
