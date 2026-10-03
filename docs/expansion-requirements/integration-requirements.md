# Markset support for Intentset — requirements v0.1

## Outcome and boundary

Enable Intentset to author and publish readable Markset documents without changing Markset's rendering vocabulary to encode product-specific concepts. Markset remains useful without Intentset. Intentset owns the graph, semantic profile definitions, release filtering, and publication authorization.

These are proposed changes to evaluate against the actual Markset implementation during development; this handoff does not assert that they are missing today.

| ID | Requirement | Acceptance |
|---|---|---|
| MKS-001 | Preserve JSON-compatible document metadata, including the `intentset` namespace | Parse/serialize preserves semantic values and unknown namespaces; duplicates and unsafe YAML are rejected by the agreed authoring parser |
| MKS-002 | Provide a generic way for a host to invoke a supplied semantic profile validator | An Intentset validator and an unrelated sample validator can be invoked without adding domain logic to Markset core |
| MKS-003 | Keep syntax and semantic diagnostics distinguishable | A syntax pass can coexist with profile failure; reports identify validator, version, code, severity, path/location, and message |
| MKS-004 | Keep profiles out of the syntax grammar | Intentset adds no behavior/rule directives; unknown syntax follows the upstream Markset specification |
| MKS-005 | Render accepted documents inertly | No code/template execution, network access, or arbitrary module loading from frontmatter; rendering tests include hostile text and links |
| MKS-006 | Support portable publication through existing rendering capabilities | Plain-text/Markdown fallback preserves meaningful content and source references; HTML retains heading structure and accessible document semantics |
| MKS-007 | Preserve publication provenance metadata supplied by the host | Round trips retain snapshot/source/profile versions without interpreting them as permissions or verification claims |
| MKS-008 | Make compatibility explicit | Adapter pins a Markset version and semantic profile version; unsupported combinations fail clearly rather than claiming conformance |

## Integration design

The minimal implementation may be a host-side adapter over existing parser/renderer exports. A new Markset plugin system or profile registry is not required merely to satisfy Intentset. Prefer the smallest generic extension that closes a demonstrated API gap. Do not fork the grammar or add Intentset-specific node types.

## Security and responsibility

Profiles are code selected by a trusted host, not executable code discovered from a document. A frontmatter profile identifier is data. The host resolves it from an allowlist and supplies a validator. Markset must not fetch schemas or scripts from arbitrary URLs while rendering. Syntax/rendering success does not mean product truth, current passing evidence, or authorization.

## Required publication behavior

The input to publication is already audience-filtered and reviewed by Intentset. Markset renders that input and preserves safe provenance. Markset does not choose which internal artifacts a customer may see. Existing sanitization policy must be evaluated against the adopted version before publication ships.

## Out of scope

Product graph storage, slice ownership, CI evidence freshness, work-item synchronization, customer authorization, semantic cross-reference syntax extensions, and a Markset website redesign. Any generic symbolic-reference feature is a separate upstream proposal.
