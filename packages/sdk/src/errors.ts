/** Base error. Match `code`, not `message`. Subclasses narrow `code`. */
export class Erc7730Error extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
  }
}

/** `InvalidInputError.code` for a transaction, batch, UserOp, or typed-data payload. */
export type InvalidInputCode =
  | 'INVALID_ADDRESS'
  | 'INVALID_HEX'
  | 'INVALID_CHAIN_ID'
  | 'INVALID_CALLDATA'
  | 'INVALID_TYPED_DATA';

/** The call payload is not usable. `code` is an {@link InvalidInputCode}. */
export class InvalidInputError extends Erc7730Error {
  override readonly code: InvalidInputCode;

  constructor(code: InvalidInputCode, message: string, options?: { cause?: unknown }) {
    super(code, message, options);
    this.code = code;
  }
}
