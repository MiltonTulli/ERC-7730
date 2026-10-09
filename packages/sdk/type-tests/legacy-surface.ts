import type * as root from '@erc7730/sdk';
import type * as legacy from '@erc7730/sdk/legacy';

type Assert<T extends true> = T;
type Has<T, K extends string> = K extends keyof T ? true : false;

type RegistryOffRoot = Assert<Has<typeof root, 'Registry'> extends false ? true : false>;
type FormatOffRoot = Assert<Has<typeof root, 'formatTypedData'> extends false ? true : false>;
type LoaderOffRoot = Assert<
  Has<typeof root, 'createMemoryIncludeLoader'> extends false ? true : false
>;
type DefaultRegistryOffRoot = Assert<
  Has<typeof root, 'getDefaultClearSignRegistry'> extends false ? true : false
>;

type RegistryOnLegacy = Assert<Has<typeof legacy, 'Registry'> extends true ? true : false>;
type FormatOnLegacy = Assert<Has<typeof legacy, 'formatTypedData'> extends true ? true : false>;
type LoaderOnLegacy = Assert<
  Has<typeof legacy, 'createMemoryIncludeLoader'> extends true ? true : false
>;
type DefaultRegistryOnLegacy = Assert<
  Has<typeof legacy, 'getDefaultClearSignRegistry'> extends true ? true : false
>;

const registryOffRoot: RegistryOffRoot = true;
const formatOffRoot: FormatOffRoot = true;
const loaderOffRoot: LoaderOffRoot = true;
const defaultRegistryOffRoot: DefaultRegistryOffRoot = true;
const registryOnLegacy: RegistryOnLegacy = true;
const formatOnLegacy: FormatOnLegacy = true;
const loaderOnLegacy: LoaderOnLegacy = true;
const defaultRegistryOnLegacy: DefaultRegistryOnLegacy = true;

void registryOffRoot;
void formatOffRoot;
void loaderOffRoot;
void defaultRegistryOffRoot;
void registryOnLegacy;
void formatOnLegacy;
void loaderOnLegacy;
void defaultRegistryOnLegacy;
