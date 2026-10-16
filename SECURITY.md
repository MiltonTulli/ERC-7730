# Security policy

## Supported versions

Security fixes ship on the latest stable minor line of each package's current stable major, in its latest patch. Older minors and majors have no promised backports. A new stable major ends maintenance of that package's previous major. See the [support policy](./docs/support-policy.md) for the full maintenance and runtime scope.

## Reporting a vulnerability

Use one of these private channels:

- [GitHub private vulnerability reporting](https://github.com/MiltonTulli/ERC-7730/security/advisories/new)
- Email: [milton.tulli@gmail.com](mailto:milton.tulli@gmail.com)

We acknowledge a report within 72 hours and assess it within 14 days.

Please include the package, the version, and a way to reproduce the issue.

## Scope

In scope: `@erc7730/sdk` and `@erc7730/cli`.

Out of scope: descriptors in [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry). Report those to that repository.
