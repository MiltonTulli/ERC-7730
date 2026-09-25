---
"@erc7730/cli": minor
---

`@erc7730/cli` is a command-line package. The published manifest keeps the `erc7730` binary and no longer exposes `main`, `types`, or `exports`. `viem` is a direct dependency so the installed binary can load the SDK, which imports viem at runtime and only lists it as an optional peer. `erc7730 generate --abi -` reads the ABI JSON from stdin. Help and other commands do not wait for stdin.
