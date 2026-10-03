# Cross-project integration contract — proposed v0.1

Identical coordination copy supplied to Intentset, Markset, and Streamlane. This is a requirements agreement to implement, not an existing runtime API. Intentset owns future versioned graph/export definitions; generic Markset APIs remain owned by Markset; Streamlane owns its work-item associations. Review changes across affected projects before changing compatibility claims.

## Authority

| Concern | Authority | Consumer |
|---|---|---|
| Document grammar/rendering | Markset | Intentset adapter |
| Product artifact/profile semantics | Intentset | Markset host-supplied validator; Streamlane read model |
| Source repository and graph snapshot | Intentset source/export producer | Streamlane |
| Evidence status and snapshot freshness | Intentset report producer | Streamlane displays without reinterpretation |
| Audience-safe publication projection | Intentset | Markset renders already-filtered input |
| Work-item lifecycle and artifact associations | Streamlane | Intentset may consume references in a later adapter |

## Minimum graph/report exchange

An export envelope must identify contract version, stable repository and product identity, source commit, graph hash, generation time, exact release context when applicable, and validation scope/status. It contains artifacts with stable IDs, types, titles, lifecycle, and authorized relationships/source locators. Optional report sections contain evidence results/freshness, knowledge review status, and explained impact paths. Missing optional sections mean “not supplied,” not success or zero impact.

Use the Core artifact semantics, not a second incompatible graph model. A schema/versioned fixture for the export must be implemented and reviewed before a consumer ships; the supplied frontmatter schema is not that export schema. The initial connector must reject unsupported versions and invalid identities. Consumer snapshots must be promoted atomically.

## Markset boundary

Intentset selects and invokes semantic validators through a trusted host adapter. Frontmatter profile IDs cannot load code. Markset renders documents and reports syntax/render failures independently from semantic validation. No new Intentset-specific directives or automatic remote schema retrieval are required.

## Access and provenance

The producer and consumer must each enforce applicable authorization. A payload authorized for a service account is not automatically authorized for all end users. Preserve provenance and exact snapshot identity. Public/customer knowledge publication excludes restricted engineering data before rendering or retrieval. Streamlane work-item completion cannot update product release status or evidence automatically.

## Compatibility gates

Pin adapter/export versions. Share a valid fixture and deliberately invalid fixtures for unsupported versions, mismatched identity, stale evidence, forbidden content, and missing optional reports. A working integration must pass both producer and consumer acceptance checks. Compatibility is not established merely by placing these requirements in a repository.
