# Releases — @erc7730/sdk and @erc7730/cli

The [support policy](./docs/support-policy.md) defines semver, deprecation windows, and maintained release lines. This page defines how releases are published.

Only `@erc7730/sdk` and `@erc7730/cli` publish. SDK and CLI have independent versions, changesets, npm publications and `sdk-vX.Y.Z` / `cli-vX.Y.Z` Git tags. `@erc7730/web`, `@erc7730/registry` and `@erc7730/docs` are private and ignored by Changesets.

`.github/workflows/release.yml` is the only npm publication path. It runs on pushes to `main` and `next`, or a dispatch on those branches. Keep this filename for npm Trusted Publishing. No tag push publishes a package. Both channels share a concurrency group so they cannot race npm tags.

| Branch | Version | npm tag | GitHub Release |
| --- | --- | --- | --- |
| `next` | Next intended version with `-next.N`, e.g. `1.0.0-next.0` | `next` only | Prerelease, never GitHub Latest |
| `main` | Stable semver, e.g. `1.0.0` | `latest` explicitly | Stable |

A new stable version on `next`, a prerelease on `main`, a mismatched Changesets pre-state, or publication from any other branch fails closed. Already published stable package versions on `next` are skipped, so an SDK candidate does not republish an unchanged CLI.

## Changesets and wallet-facing changelogs

Add a changeset in a feature PR for published SDK or CLI changes; see [CONTRIBUTING.md](./CONTRIBUTING.md) for the exact paths. Docs and workflows alone need no changeset.

```bash
pnpm changeset
```

Choose only affected packages and the intended stable bump. Use the upcoming version, not a disposable canary number: the pending SDK major changeset produces `1.0.0-next.N`, not `0.12.1-next.N`. On 0.x, `minor` remains the usual feature bump; after 1.0 use normal semver. See [Migrating to 1.0](./docs/migrating-to-1.0.md).

Changeset summaries become the changelog. Include **What this means for your wallet**, explain observable behavior, and for breaking changes name the removed behavior, replacement, and migration steps. Link the migration guide where relevant. Avoid claiming implementation work outside the diff. Review the generated changelog in every Version PR; do not edit package changelogs by hand.

`pnpm version-packages` wraps Changesets: it preserves the published manifest and changelog of packages without applicable changesets, then updates the lockfile. In prerelease exit mode, archived `.changeset/pre/*.md` files also count. This prevents Changesets' automatic dependent bumps from forcing a CLI release for an SDK-only change. An explicit CLI changeset still versions CLI and packs its dependency against the current workspace SDK. Review that dependency when shipping CLI; use `pnpm pack` for CLI so `workspace:*` is resolved.

## Stable releases from main

1. Merge feature PRs with changesets into `main`.
2. The Release workflow opens or updates **chore: version packages**, the Version PR for `main`.
3. Review versions, lockfile, changelogs, wallet impact and breaking/migration notes. Stable minor/major releases also need the candidate evidence described below.
4. Merge the Version PR when the cadence gate allows publication. Approve the GitHub Environment `npm` if its reviewer policy requires it.
5. Confirm the workflow's verified publication evidence, npm `latest`, package Git tag and GitHub Release.

The Version PR job has no deployment Environment. The publish job runs only after pending changesets have been consumed. It rebuilds, typechecks, tests, validates snippets/API/bundles and runs local consumer/tarball checks before publication. Versions already on npm and with a GitHub Release are skipped independently per package. A docs-only merge does not create another package release.

## Start and advance next

After this workflow change has landed on `main`, create `next` from the reviewed commit and push it. Keep CI and branch protection enabled for `next`, and allow `next` in the `npm` Environment's deployment branch policy before the first publish.

```bash
git switch -c next origin/main
git push -u origin next
```

Develop upcoming changes in PRs targeting `next`. With pending changesets, the workflow opens the Version PR against `next`. On the first run, `pnpm version-packages` runs `pnpm changeset pre enter next` before versioning. The Version PR commits `.changeset/pre.json`, prerelease versions, changelogs and the lockfile together. Maintainers can also enter pre mode explicitly in a reviewed PR:

```bash
pnpm changeset pre enter next
pnpm version-packages
```

Merge that Version PR to publish the candidate using OIDC and `npm publish --tag next --provenance`. With the current SDK major changeset, the first candidate is `@erc7730/sdk@1.0.0-next.0`, tagged `sdk-v1.0.0-next.0`. CLI only participates when it has its own applicable changeset. A CLI that depends on the candidate SDK is also a prerelease.

Changesets 3 moves consumed prerelease changesets into `.changeset/pre/`. Those archived files are not pending work: a subsequent `next` push with no new changesets publishes instead of reopening the Version PR. New changesets produce the next candidate number through another Version PR. Never delete or hand-edit pre-state to reset a counter, and never reuse a published version.

Integrators opt in explicitly:

```bash
npm install @erc7730/sdk@next
# Pin the exact candidate for reproducible testing:
npm install @erc7730/sdk@1.0.0-next.0
```

Regular installs continue to use `latest`. Prereleases have no weekly cadence limit.

## Promote a tested candidate

Promotion publishes a freshly built stable tarball from `main`; it never moves an npm dist-tag to bless an existing prerelease tarball.

1. Pick an exact published candidate version and its full publication SHA. Review the successful release-evidence artifact, smoke results and provenance. Keep the candidate's `sdk-v…` / `cli-v…` tag reachable in the repository.
2. Create a promotion branch from that reviewed `next` commit. Merge any intervening `main` fixes into it and review conflicts. Keep the candidate commit in the ancestry; do not squash it away.
3. Exit pre mode and generate the stable Version PR changes:

   ```bash
   pnpm changeset pre exit
   pnpm version-packages
   ```

4. Add `.github/release-promotion.json`, keyed by each package receiving a stable minor/major. Replace the sample SHA with the actual 40-character candidate commit:

   ```json
   {
     "@erc7730/sdk": {
       "candidate": "1.0.0-next.0",
       "commit": "0123456789abcdef0123456789abcdef01234567",
       "notes": "What this means for your wallet: describe the reviewed changes since this candidate, or say none. Breaking changes and migration: link the guide and explain any additional steps."
     }
   }
   ```

5. Open this as the stable **chore: version packages** PR against `main`. Review all additional commits and the complete diff from the candidate SHA to the proposed stable head. Include candidate version/SHA, extra changes, wallet impact, breaking/migration notes and CI results in the PR body. Merge with history preserved so the candidate remains an ancestor of `main`.
6. The publication guard verifies the candidate's npm provenance with cosign, its exact package-specific Git tag, GitHub prerelease status, intended stable version, and ancestry. It reinstalls the exact published candidate for a fresh consumer smoke check. It records **every additional commit** between candidate and publication SHA in the evidence artifact, alongside the maintainer's review notes. The stable build/typecheck/test/tarball checks then run again before publishing.
7. After successful stable publication, sync `main` back into `next` before starting another cycle. The next Version PR enters pre mode again when needed.

Keep historical promotion entries until the corresponding release is complete; replace them when promoting another version of that package. Missing or mismatched evidence blocks a new stable minor/major. Never merge a `next` pre-state or prerelease package version directly into `main`.

## Weekly cadence and emergency patches

The publish guard queries npm publication times separately for SDK and CLI. A stable minor/major can ship only after **seven full days** since that package's last stable minor/major. It detects a change of major/minor series even when the proposed patch component is nonzero. Prereleases and intervening patch releases do not reset the clock. Registry query failures block publication rather than bypassing the gate.

Do not merge a stable feature Version PR before its window opens. If merged too early, the publish job fails before either package is published; after the seven days, dispatch `release.yml` on `main`. There is no automatic weekly scheduler. For example, a stable minor shipped October 12 at 15:00 UTC permits the next stable minor/major October 19 at 15:00 UTC.

Security and corrective **patches in the current stable major/minor series** bypass the waiting period automatically and do not require a prerelease candidate. There is no token or workflow-input override for shipping a feature major/minor early. For an emergency while `next` is ahead:

1. Branch from `main`, implement the smallest corrective/security fix and add a patch changeset for affected packages only.
2. Merge the fix, review and merge the ordinary `main` Version PR, and run the same OIDC/provenance/checks pipeline immediately.
3. Merge the patch back into `next` and include it in the next candidate. Resolve version/pre-state conflicts in a reviewed PR.

## Publication evidence and recovery

Every publish job uploads `release-evidence-<workflow SHA>` even on failure. `before.json` snapshots package versions, npm dist-tags and publication times before publishing. `verified.json` is written after npm verification succeeds and includes after tags, smoke/provenance results, publication commits and the additional promotion commits. Finally, `released.json` also records Git tags checked against the verified publication commits and the GitHub prerelease flags. The workflow summary identifies this evidence by artifact name. A failed job or missing `released.json` is not a completed verified release.

For newly published versions, verification requires the requested npm tag, signed SLSA provenance matching the workflow SHA, and an isolated install from npm. SDK smoke imports all public entries, checks the optional viem peer, and typechecks NodeNext/Bundler consumers; CLI smoke checks the installed executable's exact version and help. Every `next` run compares both packages' `latest` values before/after and fails if either changed. GitHub Releases are created only after npm verification passes, with package-specific tags and the tarball attached. A final check fetches those Git tags and compares their commits with verified npm provenance; conflicting pre-existing tags fail the run.

If npm publication succeeds but verification or GitHub Release creation fails, rerun the workflow or dispatch the same file on the same channel. It skips already published versions, downloads the published tarball, verifies its provenance and recovers its original publication commit before tagging. Missing GitHub Releases trigger consumer/provenance verification again. It never guesses a commit from the current branch head. A prerelease attestation must identify `refs/heads/next`; stable attestations must identify `refs/heads/main`.

Before declaring issue #126 complete, link a successful first SDK candidate run with candidate SHA/version, `next` npm tag, `sdk-v…` Git tag, provenance, before/after `latest` and published consumer smoke results. Workflow code and local tarball smoke alone do not satisfy that publication gate.

To rerun SDK smoke against a specific published candidate after installing repository dependencies:

```bash
SDK_PACKAGE=@erc7730/sdk@1.0.0-next.0 node scripts/sdk-consumer-install.mjs
```

## Maintainer setup

- GitHub Environment **npm** must allow branches **main and next**, with release-owner review if desired. A tags-only branch policy blocks this workflow.
- Enable **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests**. The Version PR action receives `github-token` explicitly and does not create GitHub Releases or tags.
- Configure npm Trusted Publisher for **each** public package: GitHub user `MiltonTulli`, repository `ERC-7730`, workflow filename `release.yml`, Environment `npm`. Use GitHub-hosted runners, npm ≥ 11.5.1 (CI installs npm 11) and `id-token: write`.
- Keep `--provenance`, OIDC and cosign verification. Do not add `NPM_TOKEN` or `NODE_AUTH_TOKEN`. The workflow removes setup-node's dummy `_authToken` so npm can exchange the OIDC identity.
- Protect both branches and require CI. Building needs Node ≥ 22.18; published packages support Node ≥ 20. Never weaken checks or publish from a laptop to get around a failed gate.

If the Version PR bot is unavailable, run `pnpm version-packages` on a clean branch based on the intended channel, commit the generated files, open the Version PR manually and review/merge it. For the first `next` cycle, explicitly enter pre mode first. Publish through the same workflow, not `pnpm release` or a laptop `npm publish`.

## Rollback and troubleshooting

Do not unpublish. Deprecate the broken version, ship a corrective patch through `main`, and merge the fix back into `next`. Do not move `latest` to a prerelease.

| Symptom | Action |
| --- | --- |
| `ENEEDAUTH` / `E404` at publish | Check that package's Trusted Publisher and removal of dummy `_authToken` |
| Deployment blocked | Allow the selected channel branch in Environment `npm`; approve any required review |
| Version PR never opens | Enable Actions PR creation; check pending root changesets and branch pre-state |
| Weekly cadence failure | Wait for the exact seven-day boundary, then dispatch on `main`; use a true corrective patch for emergencies |
| Promotion failure | Check candidate version, full SHA, provenance, Git tag, ancestry and review notes |
| Published version but no GitHub Release | Rerun the same channel; recovery verifies npm provenance and original commit |
| Tarball inspection fails | Remove leaked sources/tests/maps from package files; do not bypass the check |
| Docs-only merge publishes nothing | Expected when both package versions and GitHub Releases already exist |
