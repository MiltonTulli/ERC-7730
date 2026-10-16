---
"@erc7730/cli": minor
"@erc7730/sdk": patch
---

`erc7730 lint` reports an invalid format as one line that names the value and the allowed formats. A clean file prints the schema, how many formats were checked, and how many includes resolved. `erc7730 preview --policy` selects official-only (the default), official-or-local, or none.

`validateDescriptor` keeps the closest oneOf or anyOf branch and collapses sibling const values into one message. A bad format parameter is that one line. The published main entry budget moves from 33 KB to 34 KB.
