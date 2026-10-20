import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

export function npmView(spec, fields) {
  return execFileSync(
    'npm',
    [
      'view',
      spec,
      ...fields,
      '--json',
      '--prefer-online',
      '--fetch-retries=0',
      '--fetch-timeout=30000',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
}

export function versionExists(name, version) {
  let output;
  try {
    output = npmView(`${name}@${version}`, ['version']);
  } catch (error) {
    // npm also uses E404 for inaccessible packages. Only this exact response
    // establishes a missing version; auth, network and unknown failures abort.
    let failure;
    try {
      failure = JSON.parse(error.stdout).error;
    } catch {
      throw error;
    }
    if (failure?.code === 'E404' && failure.summary === `No match found for version ${version}`) {
      return false;
    }
    throw error;
  }
  assert.equal(
    JSON.parse(output),
    version,
    `Unexpected npm version response for ${name}@${version}`
  );
  return true;
}

// npm can accept a publish several minutes before reads see it. Poll only
// propagation states, never turn a failed registry query into permission to publish.
export async function waitForRegistry(check, description) {
  const attempts = 10;
  const delay = Number(process.env.RELEASE_REGISTRY_RETRY_DELAY_MS ?? 30000);
  assert.ok(Number.isFinite(delay) && delay >= 0 && delay <= 30000, 'Invalid registry retry delay');
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = check();
    if (result || attempt === attempts) return result;
    console.error(`Waiting for ${description} (${attempt}/${attempts}); retrying in ${delay}ms`);
    await setTimeout(delay);
  }
}

/** Retry only a delayed tarball 404; authentication and integrity errors fail immediately. */
export async function packPublishedTarball(name, version, destination) {
  const tarballUrl = `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${version}.tgz`;
  const packed = await waitForRegistry(() => {
    try {
      execFileSync(
        'npm',
        [
          'pack',
          `${name}@${version}`,
          '--pack-destination',
          destination,
          '--json',
          '--prefer-online',
          '--fetch-retries=0',
          '--fetch-timeout=30000',
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      );
      return true;
    } catch (error) {
      let failure;
      try {
        failure = JSON.parse(error.stdout).error;
      } catch {
        throw error;
      }
      if (failure?.code === 'E404' && failure.summary?.includes(`GET ${tarballUrl} - Not found`))
        return false;
      throw error;
    }
  }, `${name}@${version} tarball availability`);
  assert.ok(packed, `npm tarball did not propagate: ${name}@${version}`);
}
