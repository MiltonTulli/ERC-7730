# Roadmap — @erc7730/sdk

Objetivo: que el SDK sea el **runtime TypeScript** de ERC-7730 para wallets y dApps, y el **CLI de autores** del ecosistema JS — alineado al schema v2 y al registry oficial `ethereum/clear-signing-erc7730-registry`.

No somos una fuente alternativa de descriptores. Consumimos la oficial, validamos, resolvemos, renderizamos y aplicamos una política de confianza que decide la wallet.

---

## Principios

1. **Spec first.** v2 es el target. v1 se acepta en lectura y se normaliza a un modelo interno resuelto.
2. **Una sola fuente de verdad.** El registry canónico es `ethereum/clear-signing-erc7730-registry`. El paquete local no compite con él.
3. **Trust es pluggable.** El SDK no decide a quién creer. Expone hash + attestations + source; la app inyecta `TrustPolicy`.
4. **Sourcify / ABI generated = untrusted fallback.** Nunca `confidence: "high"`.
5. **Core sin red.** Decode + schema + formatters funcionan offline. RPC/Sourcify/ENS son adapters.
6. **API estable y chica.** Pocas funciones públicas. El resto es interno.

---

## Estado actual (baseline)

| Capacidad | Hoy | Target |
|---|---|---|
| Schema | v1 | v2 (+ read v1) |
| Calldata decode | Sí (`ClearSigner.decode`) | Sí, paths `#` `$` `@` |
| EIP-712 | No | `decodeTypedData` |
| Registry | Community embebido | Índices oficiales + pin |
| Includes / `$ref` | Parcial o nulo | Resolución completa |
| Proxy / factory match | No | `addressMatcher` + `factory` |
| Trust / attestations | No | `TrustPolicy` |
| CLI lint/generate | `generateDescriptor` básico | `@erc7730/cli` |
| Adapters viem/wagmi | No | Paquete o exports dedicados |
| UserOp / multicall | No | P2 |

Paquete publicado: `@erc7730/sdk@0.1.3`.

---

## Releases

### v0.2.0 — Spec & registry (P0)

- Parser / tipos ERC-7730 v2
- Cliente del registry oficial + cache + pin de commit
- Normalización v1 → modelo interno
- Tests contra `erc7730-v2.schema.json` y fixtures del registry

### v0.3.0 — Runtime de firma (P0/P1)

- Motor de display fiel al spec
- `decodeTransaction` + `decodeTypedData`
- Matchers de context (deployments, factory, addressMatcher)
- `TrustPolicy` + `descriptorHash`
- Warnings ampliados
- Breaking: `ClearSigner` se depreca a favor de funciones sueltas + `createClearSigner`

### v0.4.0 — Autores & adapters (P1/P2)

- CLI `generate` / `lint` / `preview` / `diff`
- `generateDescriptor` con heurística de formats
- Adapters viem / wagmi
- Test fixtures estilo `erc7730-tests-v2`

### v0.5.0 — Cobertura avanzada (P2/P3)

- Multicall / inner calls
- ERC-4337 UserOperations
- i18n hooks
- Attestations ERC-8176 (cliente de verificación, no emisión)

---

## API sketch

Archivos mentales: `packages/sdk/src/index.ts`.

### Tipos de entrada

```ts
export type Hex = `0x${string}`;
export type Address = `0x${string}`;

export type Caip10 = `eip155:${number}:${Address}`;

export interface TransactionInput {
  chainId: number;
  to: Address;
  data: Hex;
  value?: bigint | Hex;
  from?: Address;
  /** envelope extra para paths `@.` */
  nonce?: bigint;
  gas?: bigint;
}

export interface TypedDataInput {
  chainId?: number;
  domain: {
    name?: string;
    version?: string;
    chainId?: number | bigint;
    verifyingContract?: Address;
    salt?: Hex;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

export interface UserOpInput {
  chainId: number;
  sender: Address;
  callData: Hex;
  nonce?: bigint;
  // resto opcional; el decoder solo necesita callData + sender + chain
}
```

### Resultado

```ts
export type Confidence = "high" | "medium" | "low";

export type DecodeSource =
  | "official-registry"
  | "attested"
  | "local-override"
  | "sourcify"
  | "generated"
  | "inferred"
  | "basic";

export type FieldFormat =
  | "raw"
  | "amount"
  | "tokenAmount"
  | "nftName"
  | "date"
  | "duration"
  | "addressOrName"
  | "enum"
  | "unit";

export interface DecodedField {
  path: string;
  label: string;
  format: FieldFormat;
  value: string;          // listo para UI
  rawValue: unknown;
  required: boolean;
  params?: Record<string, unknown>;
}

export interface SecurityWarning {
  type:
    | "infinite_approval"
    | "dangerous_permissions"
    | "untrusted_descriptor"
    | "untrusted_spender"
    | "ownership_change"
    | "proxy_upgrade"
    | "expired_deadline"
    | "selector_mismatch"
    | "missing_metadata";
  severity: "high" | "medium" | "low";
  message: string;
  path?: string;
}

export interface TrustReport {
  accepted: boolean;
  policy: string;                 // id de la policy usada
  descriptorHash?: Hex;           // keccak256 del JSON canónico
  attesters?: Address[];
  reasons: string[];
}

export interface DecodedOperation {
  confidence: Confidence;
  source: DecodeSource;
  intent: string;
  functionName?: string;
  signature?: string;             // transfer(address,uint256) | primaryType
  selector?: Hex;
  fields: DecodedField[];
  excluded: string[];
  warnings: SecurityWarning[];
  trust: TrustReport;
  metadata: {
    owner?: string;
    contractName?: string;
    protocolUrl?: string;
    chainId: number;
    contractAddress?: Address;
    descriptorId?: string;
    registryPath?: string;
  };
  raw: {
    selector?: Hex;
    args?: readonly unknown[];
    message?: Record<string, unknown>;
  };
}
```

### Decode

```ts
export interface DecodeOptions {
  provider?: Provider | null;
  registry?: Registry;
  trust?: TrustPolicy;
  /** default true; si no hay match oficial, intentar Sourcify */
  useSourcifyFallback?: boolean;
  /** locale BCP-47 para dates / amounts; default "en" */
  locale?: string;
}

export function createClearSigner(options?: DecodeOptions): ClearSigner;

export interface ClearSigner {
  decodeTransaction(tx: TransactionInput): Promise<DecodedOperation>;
  decodeTypedData(data: TypedDataInput): Promise<DecodedOperation>;
  decodeUserOp?(op: UserOpInput): Promise<DecodedOperation>; // v0.5
  extend(descriptors: ResolvedDescriptor[]): void;
}

/** API funcional preferida post-0.3 */
export function decodeTransaction(
  tx: TransactionInput,
  options?: DecodeOptions
): Promise<DecodedOperation>;

export function decodeTypedData(
  data: TypedDataInput,
  options?: DecodeOptions
): Promise<DecodedOperation>;
```

### Registry

```ts
export interface RegistryLookupKey {
  chainId: number;
  address: Address;
  /** calldata: 4byte o signature; eip712: primaryType + encodeType hash */
  selector?: Hex;
  signature?: string;
  encodeTypeHash?: Hex;
}

export interface Registry {
  findCalldata(key: RegistryLookupKey): Promise<ResolvedDescriptor | null>;
  findEip712(key: RegistryLookupKey): Promise<ResolvedDescriptor | null>;
  extend(descriptors: InputDescriptor[]): void;
}

export function createOfficialRegistry(config: {
  /** git commit SHA o tag del registry ethereum/ */
  pin: string;
  /** base URL raw.githubusercontent.com o mirror */
  baseUrl?: string;
  cache?: DescriptorCache;
}): Registry;
```

### Resolución de descriptores

```ts
export interface InputDescriptor {
  $schema?: string;
  context: unknown;
  metadata: unknown;
  display: unknown;
  includes?: string[];
}

export interface ResolvedDescriptor {
  version: "1" | "2";
  hash: Hex;
  input: InputDescriptor;
  /** includes mergeados, $ref resueltos */
  merged: InputDescriptor;
  deployments: Array<{ chainId: number; address: Address }>;
}

export function validateDescriptor(
  input: unknown
): { ok: true; descriptor: InputDescriptor } | { ok: false; errors: LintIssue[] };

export function resolveDescriptor(
  input: InputDescriptor,
  loader: IncludeLoader
): Promise<ResolvedDescriptor>;

export function descriptorHash(input: InputDescriptor): Hex;
```

### TrustPolicy

```ts
export interface TrustContext {
  descriptor: ResolvedDescriptor;
  chainId: number;
  address?: Address;
  source: DecodeSource;
}

export interface TrustPolicy {
  readonly id: string;
  evaluate(ctx: TrustContext): Promise<TrustReport>;
}

/** Acepta solo registry oficial pineado. Sourcify → accepted:false + warning. */
export function officialOnlyPolicy(): TrustPolicy;

/** Acepta registry oficial + overrides locales del integrator. */
export function officialOrLocalPolicy(): TrustPolicy;

/** Verifica attestations ERC-8176 / EAS contra allowlist de attesters. */
export function attestedPolicy(config: {
  attesters: Address[];
  eas?: EasClient;
}): TrustPolicy;

export function composePolicies(
  policies: TrustPolicy[],
  mode: "all" | "any"
): TrustPolicy;
```

Reglas de confidence (default, documentadas):

| source | trust.accepted | confidence |
|---|---|---|
| official-registry / attested | true | high |
| local-override | true | medium o high (config) |
| sourcify / generated | false | low |
| inferred / basic | false | low |

### Formatters

```ts
export interface FormatContext {
  tx?: TransactionInput;
  typedData?: TypedDataInput;
  descriptor: ResolvedDescriptor;
  decodedArgs: unknown;
  provider?: Provider | null;
  locale?: string;
}

export function formatField(
  field: DisplayField,
  ctx: FormatContext
): Promise<DecodedField>;
```

Paths:

- `#.amount` — campo del calldata / mensaje
- `$.metadata.enums.rateMode` — descriptor mergeado
- `@.to` `@.value` `@.chainId` — envelope

### generate / lint

```ts
export interface GenerateInput {
  chainId: number;
  address: Address;
  abi: Abi;
  owner: string;
  url?: string;
  contractName?: string;
}

export function generateDescriptor(input: GenerateInput): InputDescriptor;

export interface LintIssue {
  level: "error" | "warning" | "note";
  path: string;
  message: string;
  rule: string;
}

export function lintDescriptor(input: InputDescriptor): LintIssue[];
```

### Adapters (v0.4)

```ts
// @erc7730/sdk/viem
import type { TransactionSerialized, TypedDataDefinition } from "viem";

export function decodeViemTransaction(
  tx: { to: Address; data: Hex; value?: bigint; chainId: number },
  options?: DecodeOptions
): Promise<DecodedOperation>;

export function decodeViemTypedData(
  typedData: TypedDataDefinition,
  options?: DecodeOptions
): Promise<DecodedOperation>;
```

---

## Issues para abrir

Copiar cada bloque a GitHub. Labels sugeridas: `p0` `p1` `p2` `breaking` `spec` `registry` `trust` `cli` `good-first-issue`.

### Issue 1 — Tipos y validación ERC-7730 v2

```
Title: feat: ERC-7730 v2 types + JSON Schema validation
Labels: p0, spec

## Por qué
El registry oficial y el schema activo son v2. El SDK habla v1.

## Scope
- Generar o mantener tipos TS desde `erc7730-v2.schema.json`
- `validateDescriptor()` con errores de path
- Aceptar v1 en lectura y marcar `version`
- Fixture: 10 descriptores reales del registry oficial (Uniswap, Lido, USDT, Permit)

## Acceptance
- [ ] `validateDescriptor` pasa contra schema v2 oficial
- [ ] Un descriptor v1 válido se carga y expone `version: "1"`
- [ ] Un descriptor inválido devuelve issues, no throw opaco
```

### Issue 2 — Resolver includes, `$ref` y merge

```
Title: feat: resolve includes and $ref into ResolvedDescriptor
Labels: p0, spec

## Scope
- Loader de includes (filesystem en CLI, fetch en runtime)
- Merge de `common-*.json`
- Resolución de `$ref` a `$.metadata.enums` / `$.display.definitions`
- Hash canónico post-normalize (key order estable, sin whitespace)

## Acceptance
- [ ] Descriptor con include del registry oficial resuelve igual que python-erc7730
- [ ] `descriptorHash` es determinista en Node y browser
```

### Issue 3 — Cliente del registry oficial

```
Title: feat: official registry client (index.calldata + index.eip712)
Labels: p0, registry

## Scope
- Parsear `index.calldata.json` y `index.eip712.json`
- Lookup por CAIP-10 `eip155:{chainId}:{address}`
- Pin por commit SHA
- Cache (memory + optional IndexedDB / fs)
- Deprecar el registry community embebido como fuente primaria
- Documentar migración: `extend()` sigue para overrides locales

## Acceptance
- [ ] `findCalldata({ chainId: 1, address: USDC })` encuentra el descriptor oficial
- [ ] El bundle del SDK no embebe cientos de JSON salvo un índice liviano opcional
- [ ] README deja de invitar PRs al registry interno como camino principal
```

### Issue 4 — Motor de paths `#` `$` `@`

```
Title: feat: path engine for #, $, @ roots
Labels: p0, spec

## Scope
- `#.` sobre args decodificados / EIP-712 message
- `$.` sobre descriptor mergeado
- `@.` sobre envelope (to, value, chainId, from)
- Arrays, tuples, nested structs
- tokenPath / collectionPath relativos

## Acceptance
- [ ] Tests table-driven copiados de ejemplos del EIP
- [ ] `@.value` formatea amount nativo en submit() de Lido
```

### Issue 5 — decodeTransaction fiel al display spec

```
Title: feat: decodeTransaction renders intent + formatted fields
Labels: p0

## Scope
- Match selector / signature / 4byte
- Aplicar formats: raw, amount, tokenAmount, date, duration, addressOrName, enum, nftName
- required / excluded
- intent string (y interpolación si v2 la define)
- source + confidence según tabla del ROADMAP

## Acceptance
- [ ] USDC transfer → intent + recipient + amount con 6 decimals
- [ ] approve max uint256 → warning infinite_approval
- [ ] contrato sin descriptor + Sourcify off → source basic, confidence low
```

### Issue 6 — decodeTypedData (EIP-712)

```
Title: feat: decodeTypedData using official eip712 index
Labels: p0

## Scope
- Match domain.verifyingContract + chainId
- Desambiguar primaryType con hash de encodeType (como el índice oficial)
- Permit (ERC-2612) como fixture estrella
- Deadlines → format date + warning expired_deadline

## Acceptance
- [ ] Permit USDC se renderiza: owner, spender, value, deadline
- [ ] Dos descriptores del mismo primaryType se distinguen por encodeType hash
```

### Issue 7 — Context matchers: factory y addressMatcher

```
Title: feat: match proxy/factory deployments
Labels: p1, spec

## Scope
- context.contract.deployments
- addressMatcher
- factory + event / init code según spec v2
- Si no hay match de context, no usar el descriptor aunque el selector coincida

## Acceptance
- [ ] Test con contrato proxy documentado en el registry
- [ ] Selector válido en address no listada → no high confidence
```

### Issue 8 — TrustPolicy + descriptorHash

```
Title: feat: pluggable TrustPolicy
Labels: p1, trust

## Scope
- Interface TrustPolicy
- officialOnlyPolicy / officialOrLocalPolicy
- Compose all/any
- Sourcify nunca accepted=true en officialOnly
- Warning untrusted_descriptor

## Acceptance
- [ ] Apps pueden inyectar policy custom en tests
- [ ] Resultado siempre incluye trust.reasons
- [ ] README explica que clear signing ≠ pretty-print de ABI
```

### Issue 9 — Cliente de attestations ERC-8176 (mínimo)

```
Title: feat: verify ERC-8176 descriptor attestations
Labels: p2, trust

## Scope
- Verificar attestation offchain EIP-712 o onchain EAS
- Schema UID documentado en ERC-8176
- attestedPolicy({ attesters })
- No emitir attestations en v0.4

## Acceptance
- [ ] Fixture con attestation válida / revocada
- [ ] Attester fuera de allowlist → rejected
```

### Issue 10 — Warnings de seguridad

```
Title: feat: expand security warnings
Labels: p1, good-first-issue

## Checks
- infinite_approval (ya existe)
- untrusted_spender (spender no está en registry / no attested)
- ownership_change (transferOwnership, setOwner, changeAdmin)
- proxy_upgrade (upgradeTo, upgradeToAndCall)
- expired_deadline
- selector_mismatch (ABI Sourcify no matchea bytecode 4byte conocido vs address)
- missing_metadata

## Acceptance
- [ ] Cada check tiene test unitario con calldata real
```

### Issue 11 — Breaking: nueva API pública

```
Title: chore: replace ClearSigner-only API with functional decode*
Labels: p1, breaking

## Scope
- Exportar decodeTransaction / decodeTypedData / createClearSigner
- Mantener ClearSigner.decode como alias deprecated 1 minor
- Actualizar demo web y README
- Semver: 0.3.0

## Acceptance
- [ ] Changelog con snippet de migración
- [ ] Tipos públicos documentados en README API
```

### Issue 12 — CLI @erc7730/cli

```
Title: feat: CLI generate / lint / preview / diff
Labels: p1, cli

## Commands
- erc7730 generate --chain-id --address --abi --owner
- erc7730 lint ./calldata-Foo.json
- erc7730 preview --data 0x... --to 0x... --chain-id 1
- erc7730 diff --against official --pin <sha>

## Acceptance
- [ ] lint exit code 1 si hay errors
- [ ] generate produce JSON que pasa schema v2
- [ ] preview imprime intent + fields en stdout
```

### Issue 13 — generateDescriptor inteligente

```
Title: feat: smarter ABI → descriptor heuristics
Labels: p1, cli

## Heurística
- amount/value/assets/wad → tokenAmount (tokenPath @.to si ERC20)
- deadline/expiry/expiration → date encoding timestamp
- to/recipient/receiver/spender/operator → addressOrName
- enums Solidity → metadata.enums
- intent default: "Call {functionName}" + nota TODO
- No marcar confidence high nunca

## Acceptance
- [ ] Snapshot tests con ABI ERC-20 y un router simple
```

### Issue 14 — Adapters viem / wagmi

```
Title: feat: viem adapters for tx and typed data
Labels: p2

## Scope
- export condicional / subpath `@erc7730/sdk/viem`
- peerDep viem
- ejemplo wagmi hook `useClearDecode(tx)` en docs, no en core

## Acceptance
- [ ] Ejemplo copy-paste en README
- [ ] tree-shake: importar sdk no arrastra viem
```

### Issue 15 — Multicall / inner calls

```
Title: feat: decode multicall inner operations
Labels: p2

## Scope
- Multicall3 aggregate / aggregate3
- Safe execTransaction (opcional, fase 2 del issue)
- Devolver DecodedOperation[] o children[]

## Acceptance
- [ ] Fixture Multicall3 con 2 transferencias ERC-20
```

### Issue 16 — ERC-4337 UserOperations

```
Title: feat: decodeUserOp
Labels: p3

## Scope
- Decode callData de sender
- Nested execute(dest, value, data)
- Reusar decodeTransaction en inner

## Acceptance
- [ ] UserOp Simple Account execute → un DecodedOperation hijo
```

### Issue 17 — Docs, demo y posicionamiento

```
Title: docs: align README with official registry and trust model
Labels: p0, good-first-issue

## Scope
- Links: EIP-7730, clearsigning.org, ethereum/clear-signing-erc7730-registry, python-erc7730
- Tabla de diferencias vs Ledger Python
- Quitar invitación a PRs de descriptores como camino principal
- Demo: mostrar source + trust.accepted + warnings
- Badge de schema v2

## Acceptance
- [ ] Un integrator entiende en 1 pantalla qué es trusted vs generated
```

### Issue 18 — Compatibilidad python-erc7730 (golden tests)

```
Title: test: golden compare against python-erc7730 resolve/lint
Labels: p1, spec

## Scope
- Tomar N descriptores oficiales
- Comparar resolved shape y lint errors
- CI opcional con container Python

## Acceptance
- [ ] Documento de divergencias conocidas (cero o justificadas)
```

---

## Orden de implementación (12 semanas)

```
W1-2   Issues 1, 2, 17
W3-4   Issues 3, 4, 5
W5-6   Issues 6, 7, 11
W7-8   Issues 8, 10, 18
W9-10  Issues 12, 13
W11-12 Issues 14 + polish 0.4.0
       9, 15, 16 quedan backlog 0.5.0
```

---

## Fuera de scope (hasta 0.5)

- Simulación de estado (balances, minOut) dentro del core
- Emitir attestations o PRs automáticos al registry ethereum
- Firmware / conversion a formato vendor Ledger
- i18n completo de todos los intents (solo hook de locale en formatters)
- Soporte no-EVM

---

## Criterio de “listo para producción wallet”

Una wallet puede shippear integración cuando:

1. `decodeTransaction` y `decodeTypedData` existen.
2. Lookup usa índices oficiales pineados.
3. `TrustPolicy` puede rechazar Sourcify.
4. Paths `#` `$` `@` y formats v2 cubren los descriptores de top-10 del registry (tokens + permits + 1 DEX).
5. El resultado siempre distingue **metadata confiable** vs **ABI inferido**.

Eso es el corte de `v0.3.0`.
