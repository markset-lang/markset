---
markset: 0
---

# Rotating a signing key

{.lead}
Steps carry order. They also carry a timeline, which is the same thing wearing a hat.

:::steps
1. **Mint the replacement.** Ask the vault for a new pair. Nothing is serving it yet.
2. **Publish the public half.** Both keys verify, for the length of one token lifetime.
3. **Cut traffic over.** Sign with the new key. The old one still verifies.
4. **Retire the old key.** Only once the longest-lived token signed with it has expired.
:::

> [!WARNING]
> Skipping step two rejects every token in flight.
