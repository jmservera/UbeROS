# Versioning Policy

UbeROS follows [Semantic Versioning 2.0.0](https://semver.org). The Git tag is
the single source of truth for a release version, and every published artifact
(container images, the release bundle, and the running stack) is stamped with
that version. This document defines the version grammar, the Git-tag rule, how
change types map to version increments, how pre-releases are ordered, and how a
version bump is reviewed before a tag is created.

Requirements owned: FR-A1, FR-A2, FR-A3, FR-A4 (see
[PRD 004, Theme A](prds/004-uberos-release-packaging.md)).

## Semantic Versioning grammar

A version is `MAJOR.MINOR.PATCH`, with an optional pre-release identifier and
optional build metadata:

```text
MAJOR.MINOR.PATCH[-prerelease][+build]
```

* `MAJOR`, `MINOR`, and `PATCH` are non-negative integers with no leading zeros.
* `-prerelease` is an optional dot-separated series of identifiers containing ASCII
  alphanumerics and `-` (for example `-beta`, `-beta.2`, `-rc.1`). It marks the version as unstable
  and takes lower precedence than the corresponding final release.
* `+build` is optional build metadata (for example `+20260726` or
  `+sha.a1b2c3d`). Build metadata is ignored when determining precedence.

Examples of valid versions:

* `0.4.0`
* `0.4.0-beta`
* `0.4.0-beta.2`
* `0.4.0-beta+sha.a1b2c3d`
* `1.0.0`

Every version string published by the release pipeline must validate against
this grammar (FR-A1).

## Git tag rule

Releases are cut from an **annotated Git tag** named `v<version>`, where
`<version>` is the semver string defined above:

```text
v0.4.0
v0.4.0-beta
v1.0.0
```

The tag is the single source of truth (FR-A2). The pipeline strips the leading
`v` and stamps the resulting version onto every artifact, so a published
artifact's version always equals its tag minus the `v`. For example, tag
`v0.4.0-beta` produces the image
`ghcr.io/jmservera/uberos/frontend:0.4.0-beta`.

## Increment rules

The type of change since the last release determines which component of the
version increments (FR-A3):

| Change type | Example | Increment |
|-------------|---------|-----------|
| Breaking / incompatible change | Removed or renamed a public API, env var, or compose contract | `MAJOR` |
| Backward-compatible feature | Added a new optional service, flag, or capability | `MINOR` |
| Backward-compatible fix | Bug fix, docs, or internal change with no API impact | `PATCH` |

Incrementing a component resets the lower components to zero: a `MINOR` bump
resets `PATCH`, and a `MAJOR` bump resets both `MINOR` and `PATCH`.

### The `0.x` beta phase

UbeROS is currently in the `0.x` (`0.4.x`) beta phase. Under semver, the public
API is considered unstable while `MAJOR` is `0`, so the normal `MAJOR` rule is
relaxed:

* Anything **may** change at any time — a `0.x` release carries no stability
  guarantee.
* Breaking changes bump `MINOR` (for example `0.4.0` → `0.5.0`) instead of
  `MAJOR`.
* Backward-compatible features and fixes bump `PATCH` (for example `0.4.0` →
  `0.4.1`).
* The first stable, backward-compatibility-guaranteeing release is `1.0.0`.
  Promoting to `1.0.0` is an explicit decision, after which the standard
  `MAJOR` / `MINOR` / `PATCH` rules above apply in full.

## Pre-release precedence

A pre-release version has **lower** precedence than its associated final
release. When identifiers are otherwise equal, a version with a pre-release
suffix sorts before the version without one:

```text
0.4.0-beta < 0.4.0-beta.2 < 0.4.0-rc.1 < 0.4.0
```

Precedence between pre-releases is compared identifier by identifier: numeric
identifiers compare numerically, alphanumeric identifiers compare
lexically in ASCII order, and a larger set of identifiers has higher precedence
when all preceding identifiers are equal. Build metadata (`+build`) is **not**
considered when comparing precedence.

This ordering guarantees that `0.4.0-beta` publishes and sorts before the final
`0.4.0` release (FR-A4), so consumers pulling the pinned pre-release tag never
receive it in place of the final release.

## Bump review

A version bump is **proposed and reviewed before the tag is created**, so the
increment matches the actual change set (FR-A3):

1. **Propose.** When preparing a release, the release manager proposes the next
   version by applying the [increment rules](#increment-rules) to the changes
   merged since the last tag. Record the proposed version and the rationale
   (breaking / feature / fix) in the release pull request.
2. **Review.** A reviewer confirms that the proposed increment matches the
   change set — for example, that a breaking change is not being shipped as a
   `PATCH`. During the `0.x` phase the reviewer also confirms breaking changes
   bump `MINOR` rather than `MAJOR`.
3. **Tag.** Only after the bump is approved does the release manager create the
   annotated `v<version>` tag. Pushing the tag triggers the release pipeline,
   which stamps the version onto every artifact.

Because the tag drives publication, the bump review is the last human gate
before a version becomes permanent — a published tag is treated as immutable.

## References

* [Semantic Versioning 2.0.0](https://semver.org)
* [PRD 004 — Release, Packaging and Distribution](prds/004-uberos-release-packaging.md)
