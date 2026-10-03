# Markset implementation backlog and acceptance

## Sequence

1. **Capability inventory:** inspect the chosen upstream spec and current parser/renderer API during implementation. Map MKS-001–008 to existing support, gaps, or incompatible assumptions. Exit: pinned version and gap list.
2. **Carrier adapter:** expose metadata and source locations without modifying grammar. Exit: unknown metadata round-trip and malformed/unsafe input fixtures pass.
3. **Generic profile hook:** implement host-selected validation only where needed. Exit: both Intentset and an unrelated mock profile work with unchanged Markset core.
4. **Publication adapter:** preserve safe provenance and portable content using existing rendering. Exit: reviewed sample is readable as Markdown and accessible HTML; no document-triggered execution/network calls.
5. **Compatibility release:** document adapter/version matrix and upgrade procedure. Exit: Intentset consumer fixtures pass against locked dependencies.

## Acceptance fixtures

| Fixture | Expected result |
|---|---|
| Ordinary Markset document without profile | Existing syntax/render behavior preserved |
| Valid syntax with missing Intentset required field | Syntax success; semantic failure |
| Unknown profile requested for validation | Explicit unsupported-profile failure |
| Unrecognized frontmatter namespace | Metadata preserved, no new semantics inferred |
| Document names a remote script as profile | No script/network execution |
| Duplicate frontmatter key / unsafe YAML construct | Rejected by authoring parser boundary |
| Generated publication metadata | Source/snapshot/profile values preserved |
| HTML/script-like body and unsafe URLs | Handled by documented sanitizer/render policy |
| Renderer/profile version mismatch | Clear compatibility failure |

Acceptance requires an actual implementation and upstream-compatible fixtures. This requirements package supplies no passing Markset compatibility result. Coordinate semantic fixture ownership with Intentset; do not duplicate its product validator inside Markset.
