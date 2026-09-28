# Roadmap — @erc7730/sdk

Objetivo: que el SDK sea el **runtime TypeScript trust-aware** de ERC-7730 para wallets y dApps, y el **CLI de autores** del ecosistema JS — alineado al schema v2 y al registry oficial [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry).

No somos una fuente alternativa de descriptores. Consumimos la oficial, validamos, resolvemos, renderizamos y aplicamos una política de confianza que decide la wallet.

Tracker: [#2](https://github.com/MiltonTulli/ERC-7730/issues/2). Preferir **pocos PRs grandes**.

---

## Principios

1. **Spec first.** v2 es el target. v1 se acepta en lectura y se normaliza a un modelo interno resuelto.
2. **Una sola fuente de verdad.** El registry canónico es `ethereum/clear-signing-erc7730-registry`. Este repo no compite con él.
3. **Trust es pluggable.** El SDK no decide a quién creer. Expone hash + attestations + source; la app inyecta `TrustPolicy`.
4. **Sourcify / ABI generated = untrusted fallback.** Nunca `confidence: "high"`.
5. **Core sin red.** Decode + schema + formatters funcionan offline. RPC / Sourcify / ENS son adapters.
6. **API estable y chica.** Pocas funciones públicas. El resto es interno.
7. **No somos la reference implementation.** Esa silla la tiene Sourcify TS + el working group. Nosotros: pin SHA + policies + CLI JS + interop con `python-erc7730`.

---

## Estado (septiembre 2026)

Publicado: `@erc7730/sdk@0.4.0`, `@erc7730/cli@0.2.0`.

| Capacidad | Estado |
|---|---|
| Schema v1 + v2 | Hecho |
| `validateDescriptor` / `resolveDescriptor` / `$ref` + includes | Hecho |
| Registry oficial pineado por commit SHA | Hecho |
| Paths `#` `$` `@` | Hecho |
| `decodeTransaction` / `decodeTypedData` | Hecho |
| Proxy / factory / addressMatcher | Hecho |
| `TrustPolicy` (`officialOnly` / `officialOrLocal` / compose) | Hecho |
| Security warnings | Hecho |
| Golden vs `python-erc7730` | Hecho |
| `@erc7730/cli` generate / lint / preview / diff | Hecho |
| Heurística ABI → descriptor | Hecho |
| Adapters `@erc7730/sdk/viem` + export `lite` | Hecho |
| `interpolatedIntent` | Hecho (#53) |
| EIP-5792 batch | Hecho (#53) |
| `ExternalDataProvider` | Hecho (#53) |
| `trustedTokens` templates ERC-20/721 | Hecho (#53) |
| ERC-8176 `attestedPolicy` | Hecho (#53) |
| Multicall3 / Safe inner calls | Hecho (#54) |
| `decodeUserOp` | Hecho (#54) |
| Compat `format()` + matriz interop | Hecho (#54) |

---

## Releases

### v0.2.0 — Spec & registry — shipped

Parser v2, registry oficial + pin, normalize v1, tests contra schema oficial.

### v0.3.0 — Runtime de firma — shipped

Display fiel al spec, `decodeTransaction` + `decodeTypedData`, context matchers, `TrustPolicy` + `descriptorHash`, warnings, API funcional (`ClearSigner.decode` deprecated).

### v0.4.0 — Autores & adapters — shipped

CLI `generate` / `lint` / `preview` / `diff`, heurística de formats, `@erc7730/sdk/viem`.

### v0.5.0 — Wallet drop-in parity — [#53](https://github.com/MiltonTulli/ERC-7730/issues/53)

**Un PR.** Una wallet que hoy usa `@ethereum-sourcify/clear-signing` puede cambiar el import sin perder pantallas ni attestations.

- `interpolatedIntent` (fallback a intent + fields)
- `decodeBatch` / EIP-5792 (`" and "` entre intents)
- `ExternalDataProvider`; core / `lite` sin red
- `trustedTokens` → templates ERC-20/721, nunca high bajo `officialOnlyPolicy`
- `attestedPolicy` ERC-8176 (verificar, no emitir; revocación inyectada)
- Prefetch de índices oficiales (el caller guarda el objeto)
- `GUIDE.md` wallet: pin, policy, provider, qué no es el fallback Sourcify

Fuera de 0.5: Multicall3, UserOp, i18n, playground, dashboard.

### v0.6.0 — Coverage + policies + authoring — [#54](https://github.com/MiltonTulli/ERC-7730/issues/54)

**Un PR.** Donde la propuesta es estrictamente mejor que un formatter de referencia.

- Multicall3 (`children[]`); Safe `execTransaction` si entra barato
- `decodeUserOp` (Simple Account `execute` / `executeBatch`)
- EIP-712 bound sólo por `domain` / `domainSeparator`
- Policy pack + reason codes estables + risk extra (allowlist de spender)
- CLI: lint alineado a `python-erc7730`, preview con trust, scaffold de PR al registry oficial, Action “ABI vs descriptor stale”
- Compat `format` / `formatTypedData` → `decode*` + policy
- Matriz pública de fixtures vs python-erc7730 y Sourcify TS
- `locale` sólo para dates/amounts

Fuera de 0.6: registry propio, dashboard de cobertura, claim de reference implementation.

### Later

- [#43](https://github.com/MiltonTulli/ERC-7730/issues/43) docs site (Pages hoy es sólo la demo)

---

## API sketch (target 0.5+)

Lo de 0.2–0.4 ya está en `packages/sdk/src/index.ts`. Abajo sólo lo nuevo.

```ts
export interface DecodedOperation {
  confidence: Confidence;
  source: DecodeSource; // incluye "attested" | "trusted-token"
  intent: string;
  interpolatedIntent?: string;
  fields: DecodedField[];
  children?: DecodedOperation[];
  warnings: SecurityWarning[];
  trust: TrustReport;
  // ...metadata / raw existentes
}

export interface ExternalDataProvider {
  resolveToken?(chainId: number, address: Address): Promise<TokenInfo | null>;
  resolveEnsName?(address: Address): Promise<string | null>;
  resolveNftCollectionName?(chainId: number, address: Address): Promise<string | null>;
  resolveBlockTimestamp?(chainId: number, blockHeight: bigint): Promise<number | null>;
  resolveChainInfo?(chainId: number): Promise<{ name: string; symbol: string } | null>;
  chainClient?: { call(chainId: number, req: { to: Address; data: Hex }): Promise<Hex> };
}

export function attestedPolicy(config: {
  attesters: Address[];
  eas?: { call: ExternalDataProvider["chainClient"] };
}): TrustPolicy;

export function decodeBatch(
  batch: { chainId: number; from?: Address; calls: TransactionInput[] },
  options?: DecodeOptions
): Promise<{ interpolatedIntent?: string; calls: DecodedOperation[] }>;

export function decodeUserOp(
  op: { chainId: number; sender: Address; callData: Hex; nonce?: bigint },
  options?: DecodeOptions
): Promise<DecodedOperation>;
```

Confidence (sin cambios):

| source | trust.accepted | confidence |
|---|---|---|
| official-registry / attested | true | high |
| local-override | true | medium o high (config) |
| trusted-token template | sólo si la policy lo acepta | nunca high en official-only |
| sourcify / generated / inferred / basic | false | low |

---

## Issues activos

| Issue | Release | PR |
|---|---|---|
| [#53](https://github.com/MiltonTulli/ERC-7730/issues/53) wallet drop-in | 0.5 | uno |
| [#54](https://github.com/MiltonTulli/ERC-7730/issues/54) coverage + authoring | 0.6 | uno |
| [#43](https://github.com/MiltonTulli/ERC-7730/issues/43) docs site | later | — |

Cerrados como absorbed: #18 → #53; #19 y #20 → #54.
