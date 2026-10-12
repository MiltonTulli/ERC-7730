# Coding standards

Judgement for review. Mechanical checks live in `scripts/check-*.mjs` and CI.

## Path suffixes

A required path, an intent placeholder, or any other suffix match hits on a segment boundary. `value` matches `#.value` and `order.value`. It does not match `maxValue` or `details.amountvalue`. The same boundary applies to `{to}` against `order.to` and `#.autoTo`.
