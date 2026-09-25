#!/usr/bin/env bash
# Print the git commit that published an npm package already on the registry.
# Verifies the package tarball against its npm SLSA provenance attestation
# (Sigstore bundle, GitHub Actions OIDC, this repo's release.yml) and
# refuses to print a commit when that check fails.
#
# Usage: resolve-publication-commit.sh <tarball> <package> <version>
# stdout: 40-char commit SHA. Diagnostics go to stderr.
set -euo pipefail

TARBALL=${1:?tarball path}
PKG=${2:?package name}
VERSION=${3:?version}

REPO_HTTPS="https://github.com/MiltonTulli/ERC-7730"
REPO_SLUG="MiltonTulli/ERC-7730"
WORKFLOW_PATH=".github/workflows/release.yml"
COSIGN_VERSION="v3.1.3"
# Checksums from https://github.com/sigstore/cosign/releases/download/v3.1.3/cosign_checksums.txt
COSIGN_SHA_AMD64="4629c757b7618056f8ddd7e2625ae9fdd94c0372a65049520bc7d9df9efc7f71"
COSIGN_SHA_ARM64="c5d324e091826b0d7a78eb16fef316450b4eb9aaec045611c08ba06f5e73220a"

if [[ ! -f "$TARBALL" ]]; then
  echo "Tarball not found: $TARBALL" >&2
  exit 1
fi

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

ATT_JSON=$(npm view "${PKG}@${VERSION}" dist.attestations.url --json || true)
ATT_URL=$(node -e '
const raw = process.argv[1] ?? "";
if (!raw.trim()) process.exit(2);
const value = JSON.parse(raw);
if (typeof value !== "string" || value.length === 0) process.exit(2);
process.stdout.write(value);
' "$ATT_JSON") || {
  echo "No npm provenance attestation for ${PKG}@${VERSION}. Refusing to guess a publication commit." >&2
  exit 1
}

curl -fsSL "$ATT_URL" -o "$WORKDIR/attestations.json"

ATTEST="$WORKDIR/attestations.json" BUNDLE="$WORKDIR/slsa-bundle.json" node <<'JS'
const { readFileSync, writeFileSync } = require('node:fs')
const atts = JSON.parse(readFileSync(process.env.ATTEST, 'utf8')).attestations
if (!Array.isArray(atts)) {
  console.error('Unexpected npm attestations document')
  process.exit(1)
}
const slsa = atts.find((entry) => entry.predicateType === 'https://slsa.dev/provenance/v1')
if (!slsa?.bundle) {
  console.error('npm publish attestation has no SLSA provenance bundle')
  process.exit(1)
}
writeFileSync(process.env.BUNDLE, JSON.stringify(slsa.bundle))
JS

if [[ -n "${COSIGN_BIN:-}" ]]; then
  COSIGN="$COSIGN_BIN"
else
  case "$(uname -m)" in
    x86_64 | amd64)
      ASSET="cosign-linux-amd64"
      SUM="$COSIGN_SHA_AMD64"
      ;;
    aarch64 | arm64)
      ASSET="cosign-linux-arm64"
      SUM="$COSIGN_SHA_ARM64"
      ;;
    *)
      echo "Unsupported architecture for cosign: $(uname -m)" >&2
      exit 1
      ;;
  esac
  curl -fsSL -o "$WORKDIR/cosign" "https://github.com/sigstore/cosign/releases/download/${COSIGN_VERSION}/${ASSET}"
  echo "${SUM}  ${WORKDIR}/cosign" | sha256sum -c -
  chmod +x "$WORKDIR/cosign"
  COSIGN="$WORKDIR/cosign"
fi

"$COSIGN" verify-blob-attestation \
  --bundle "$WORKDIR/slsa-bundle.json" \
  --type slsaprovenance1 \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  --certificate-identity-regexp "^https://github.com/MiltonTulli/ERC-7730/\\.github/workflows/release\\.yml@refs/heads/main$" \
  --certificate-github-workflow-repository "$REPO_SLUG" \
  "$TARBALL" >&2

COMMIT=$(BUNDLE="$WORKDIR/slsa-bundle.json" REPO_HTTPS="$REPO_HTTPS" WORKFLOW_PATH="$WORKFLOW_PATH" node <<'JS'
const { readFileSync } = require('node:fs')
const bundle = JSON.parse(readFileSync(process.env.BUNDLE, 'utf8'))
const encoded = bundle.dsseEnvelope && bundle.dsseEnvelope.payload
if (!encoded) {
  console.error('Verified bundle is missing a DSSE payload')
  process.exit(1)
}
const statement = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
const workflow = statement.predicate?.buildDefinition?.externalParameters?.workflow
const repository = workflow?.repository
if (repository !== process.env.REPO_HTTPS && repository !== `${process.env.REPO_HTTPS}.git`) {
  console.error(`Provenance workflow repository is ${repository ?? 'missing'}`)
  process.exit(1)
}
if (workflow?.path !== process.env.WORKFLOW_PATH) {
  console.error(`Provenance workflow path is ${workflow?.path ?? 'missing'}`)
  process.exit(1)
}
if (workflow?.ref !== 'refs/heads/main') {
  console.error(`Provenance workflow ref is ${workflow?.ref ?? 'missing'}`)
  process.exit(1)
}
const deps = statement.predicate?.buildDefinition?.resolvedDependencies ?? []
const prefix = `git+${process.env.REPO_HTTPS}`
const matches = deps.filter((dep) => typeof dep.uri === 'string' && dep.uri.startsWith(prefix))
const commits = [...new Set(matches.map((dep) => dep.digest?.gitCommit).filter(Boolean))]
if (commits.length !== 1 || !/^[0-9a-f]{40}$/.test(commits[0])) {
  console.error('Provenance did not contain a single git commit for this repository')
  process.exit(1)
}
process.stdout.write(commits[0])
JS
)

if ! git cat-file -e "${COMMIT}^{commit}" 2>/dev/null; then
  echo "Provenance commit ${COMMIT} is not in this repository" >&2
  exit 1
fi

printf '%s\n' "$COMMIT"
