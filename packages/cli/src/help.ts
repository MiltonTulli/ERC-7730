export const ROOT_HELP = `Usage: erc7730 <command> [options]

Commands:
  generate   Bootstrap a v2 descriptor from an ABI
  lint       Validate descriptor files (exit 1 on errors)
  preview    Decode a transaction and print intent + fields
  diff       Compare a local descriptor to the official registry
  registry   Refresh a pinned official registry cache

Environment:
  ERC7730_REGISTRY_PATH   Local clone of ethereum/clear-signing-erc7730-registry
  ERC7730_REGISTRY_PIN    Default 40-character commit SHA pin
  ERC7730_CACHE_DIR       Cache root (default ~/.erc7730)

Does not open PRs against the official registry.
`;

export const GENERATE_HELP = `Usage: erc7730 generate --chain-id <id> --address <addr> --abi <file> --owner <name> [--url <url>] [--out <file>]

Bootstrap a draft ERC-7730 v2 descriptor from a contract ABI.
Output is a starting point for an official-registry PR — never confidence: "high".

  --chain-id   EIP-155 chain id
  --address    Contract address
  --abi        Path to a JSON ABI (array or { abi: [...] }). Use - for stdin
  --owner      Protocol / owner display name
  --url        Optional protocol URL
  --out        Also write the JSON to this path
`;

export const LINT_HELP = `Usage: erc7730 lint <file-or-dir...> [--json]

Validate ERC-7730 descriptor files against the official JSON Schema, then run
local semantic checks. Does not call Etherscan / Sourcify.

Exit 1 if any error-level issue is reported.
`;

export const PREVIEW_HELP = `Usage: erc7730 preview --data <hex> --to <addr> --chain-id <id> [--from <addr>] [--value <n>] [--pin <sha>] [--registry-path <dir>] [--json]

Decode a transaction with the official registry (or ERC7730_REGISTRY_PATH) and
print intent + fields to stdout.
`;

export const DIFF_HELP = `Usage: erc7730 diff <file> --against official [--pin <sha>] [--registry-path <dir>]

Compare a local descriptor to the official registry file for the same
deployment. Exit 1 when the comparable slice differs.
`;

export const REGISTRY_HELP = `Usage: erc7730 registry update [--pin <sha>] [--cache-dir <dir>]

Download index.calldata.json, index.eip712.json, and referenced descriptor
files (including relative includes) into the local cache.

  Default cache: ~/.erc7730/registry/<pin>
  Override with --cache-dir, ERC7730_CACHE_DIR, or ERC7730_REGISTRY_PATH
`;
