# Proposed semantic profile adapter contract

## Status

Design target for implementation discussion. These names are conceptual, not installed API names. A host adapter is sufficient if existing Markset APIs already expose the required data.

## Inputs and outputs

| Operation | Input | Output |
|---|---|---|
| Parse | UTF-8 source, source path, pinned Markset version | Parsed document/body, JSON-compatible metadata, syntax diagnostics and available source locations |
| Validate profile | Parsed input, trusted validator selected by explicit profile ID/version | Profile diagnostics; no mutation of canonical content |
| Render | Parsed publication document and explicit rendering options | Output plus rendering diagnostics; no inferred product authorization |

A diagnostic contains `origin` (syntax/profile/render), `code`, `severity`, `message`, `path`, optional line/column, and validator version. Diagnostics must have stable deterministic ordering. A missing location must remain absent rather than becoming an invented source coordinate.

## Profile resolution

Intentset uses `intentset.profile: intentset/<type>/0.1`. The host selects a compatible adapter explicitly. Unsupported profiles may still render as documents where syntax permits, but must be reported as semantically unvalidated. A requested profile-validation operation must fail when its validator is unavailable.

## Example metadata

```yaml
markset: 0
intentset:
  spec: "0.1"
  profile: intentset/behavior/0.1
  id: BEH-ASMT-SCHEDULE
  type: behavior
  title: Schedule an assessment
  status: draft
  owner: team-assessment
  visibility: internal
  audiences: [engineering]
  parent: CAP-ASMT-ASSIGN
  availability:
    products: [PRD-LE]
    releases: [pilot-1]
    roles: [teacher]
    editions: [standard]
    flags: []
```

This shows the carrier, not a self-contained valid graph. Resolving the parent and product, verifying sections, and checking publication eligibility are Intentset's job. Markset core must not claim to perform them.

## Failure cases

Malformed syntax: preserve syntax diagnostics and do not claim a successful conforming render. Valid syntax but bad profile: emit profile failure independently. Missing profile validator: explicitly unvalidated. Unknown metadata namespace: preserve its JSON-compatible values. Unsafe executable frontmatter: reject; do not attempt evaluation. Rendering output must not leak diagnostics containing excluded source content into public pages.
