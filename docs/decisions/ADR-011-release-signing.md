# ADR-011: Release Artifact Signing

- Status: Accepted — Implemented (images attested; bundle signed; CI verify gate on tags)
- Implementation: `.github/workflows/release.yml` — `publish-images` attests each image with `actions/attest-build-provenance`; `publish-release` signs the bundle files with keyless `cosign sign-blob --new-bundle-format`; the `verify-signing` job re-verifies both on every tag. `install.sh` `verify_release_signature()` verifies the in-bundle signature at install time
- Date: 2026-07-30
- Deciders: jmservera (product), Trinity (technical)
- Related: issue #15, PRD Theme B (release packaging), ADR-004 (frontend image), docs/VERSIONING.md, README "Verifying a release"

## Context

UbeROS publishes eight service images to `ghcr.io/jmservera/uberos` and a
release bundle (`.tar.gz`, `.zip`, `checksums.txt`) on every `v*` tag. Checksums
prove a download is internally consistent, but they do not prove the artifacts
came from this repository's release pipeline. A registry or release attacker who
can replace both an artifact and its `checksums.txt` defeats a checksum-only
integrity check. The project wants provenance that a consumer can verify without
UbeROS distributing or rotating a private key, and the installer must keep
working on hosts that have neither `gh` nor `cosign`.

## Decision

Adopt **keyless (Sigstore) signing** for both artifact classes, matched to how
each is consumed:

- **Images** are signed with GitHub build-provenance attestations
  (`actions/attest-build-provenance`, `push-to-registry: true`). Consumers
  verify with `gh attestation verify oci://... --repo jmservera/UbeROS`, which
  checks a SLSA provenance predicate bound to this repository and workflow.
- **The release bundle** is signed with `cosign sign-blob` using GitHub OIDC.
  `checksums.txt` already vouches for every bundled file, so one signature over
  `checksums.txt` authenticates the whole extracted payload. The signature ships
  both inside the bundle (`checksums.txt.cosign.bundle`, for offline installer
  verification) and attached to the GitHub Release (alongside per-archive
  signatures).

Both paths are **keyless**: signing identity is the release workflow's OIDC
identity, recorded in the public Rekor transparency log, so there is no private
key to store or rotate. Signatures use the **new Sigstore bundle format**
(`--new-bundle-format`), pinned explicitly on both the signing and the verifying
side so a future change to the cosign default cannot silently break the
contract.

## Installer verification contract

`install.sh` treats signature verification as a **fail-closed enhancement over a
fail-open baseline**:

- No signature file present, or `cosign` absent → log and continue on checksums
  alone. This preserves installs on minimal hosts (the checksum verification
  still runs).
- Signature and `cosign` both present → a bad signature is fatal (`die`). A
  tampered or non-authentic bundle stops the install.

The pinned identity and issuer are overridable for forks via
`UBEROS_SIGN_IDENTITY_REGEXP` and `UBEROS_SIGN_OIDC_ISSUER`, defaulting to this
repository's release workflow and the GitHub Actions OIDC issuer.

## CI verification gate

The release workflow ends with a `verify-signing` job that consumes exactly what
a downstream user would: it runs `gh attestation verify` against a freshly
published image and `cosign verify-blob` against the bundle signature downloaded
from the Release. If either check fails, the release run fails, so signing
cannot regress unnoticed.

## Consequences

- Consumers can prove image and bundle provenance against this repository's
  workflow identity without any distributed key.
- Bundle verification requires `cosign` new enough to understand the new bundle
  format (2.4+); older cosign fails closed rather than silently accepting.
- Minimal hosts without `gh`/`cosign` still install using checksums, at the cost
  of provenance verification, and are told how to upgrade to a full check.
- The `verify-signing` gate adds one short job per release run and depends on the
  publish jobs completing first.
- Key rotation, offline/air-gapped verification (bundled trusted root), and
  signing the compose digest set are out of scope for this iteration.
