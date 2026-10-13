import { describe, expect, it } from 'vitest';
import {
  decodeTransaction,
  decodeTypedData,
  renderScreensText,
  resolveDescriptor,
  toScreens,
} from '../../dist/index.js';
import type { IncludeLoader, InputDescriptor } from '../../src/types/descriptor';
import manifest from '../golden/manifest.json';
import { renderGoldenScreen } from '../golden/renderCase';

interface GoldenCase {
  id: string;
  kind: 'calldata' | 'eip712';
  source: string;
  includes?: Array<{ source: string }>;
}

const cases = manifest.cases as GoldenCase[];

const jsonModules = import.meta.glob(
  ['../../src/__tests__/fixtures/**/*.json', '../golden/includes/**/*.json'],
  { eager: true }
);

const screenModules = import.meta.glob('../golden/screens/*.txt', {
  as: 'raw',
  eager: true,
}) as Record<string, string>;

function moduleJson(source: string): unknown {
  const tail = source.replace(/^test\//, '');
  const entry = Object.entries(jsonModules).find(
    ([key]) => key.endsWith(source) || key.endsWith(tail)
  );
  if (!entry) {
    throw new Error(`Missing golden fixture ${source}`);
  }
  const loaded = entry[1] as { default?: unknown };
  return loaded.default ?? loaded;
}

function screenText(id: string): string {
  const entry = Object.entries(screenModules).find(([key]) => key.endsWith(`/${id}.txt`));
  if (!entry) {
    throw new Error(`Missing screen text for ${id}`);
  }
  return entry[1];
}

function includeRefs(input: InputDescriptor): string[] {
  const includes = input.includes;
  if (typeof includes === 'string' && includes.length > 0) {
    return [includes];
  }
  if (Array.isArray(includes) && includes.every((item) => typeof item === 'string')) {
    return includes;
  }
  return [];
}

function loaderFor(item: GoldenCase, input: InputDescriptor): IncludeLoader {
  const refs = includeRefs(input);
  const files = item.includes ?? [];
  if (refs.length !== files.length) {
    throw new Error(`${item.id} has ${refs.length} includes and ${files.length} staged files`);
  }
  const byRef = new Map(refs.map((ref, index) => [ref, moduleJson(files[index]?.source ?? '')]));
  return {
    async load(ref) {
      const json = byRef.get(ref);
      if (json === undefined) {
        throw new Error(`${item.id} is missing include ${ref}`);
      }
      return json;
    },
  };
}

describe('browser goldens', () => {
  it('runs in a browser', () => {
    expect(typeof document).toBe('object');
    expect(navigator.userAgent).toMatch(/Chrome|Chromium/);
  });

  it.each(cases)('$id matches the committed screen text', async (item) => {
    const input = moduleJson(item.source) as InputDescriptor;
    const actual = await renderGoldenScreen(item, input, loaderFor(item, input), {
      resolveDescriptor,
      decodeTransaction,
      decodeTypedData,
      renderScreensText,
      toScreens,
    });
    expect(actual).toBe(screenText(item.id));
  });
});
