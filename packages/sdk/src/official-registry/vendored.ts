import source from '../schema/official/source.json' with { type: 'json' };

/**
 * Commit of `ethereum/clear-signing-erc7730-registry` from which JSON Schema
 * was vendored. Default pin when `createOfficialRegistry()` omits `pin` and
 * `ref`.
 */
export const VENDORED_REGISTRY_COMMIT = source.commit;
