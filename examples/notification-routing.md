---
markset: 0
title: Notification Routing Overhaul
theme:
  preset: report
  accent: "#1d5fa8"
  radius: sm
---

{.eyebrow}
HAR-412 · Analysis and recommendation

# Notification Routing Overhaul

{.lead}
A team lead asked to stop deploy notifications for one project. There is no place to do that, so support tells them to create a sub-project. This is the anatomy of why — **five layers of routing configuration, none of them editable by the person asking** — and a model that replaces all five with one rule.

:::metrics{.dossier}
| Field | Value |
|---|---|
| Idea | HAR-412 · Parking lot |
| Area | Delivery |
| Code traced | harbor-api, harbor-web, harbor-worker, harbor-cli |
| Layers found | 5 |
| Lead-editable | 0 |
:::

{.tick}
***

:::card[The short version]{.verdict}
Channel routing is assembled from **three additive sources** in the event catalog, filtered by **one subtractive JSON blob** on projects, **frozen into a snapshot** the first time a digest is opened, and then re-applied **per entry** by the web client. Only the first of those has any admin UI, and it is keyed by event id in an internal tool.

The instinct behind HAR-412 is to add a sixth layer for projects. That would make the problem worse. The recommendation is to **split the two questions that are currently tangled together** — *which* channel a plan tier expects, and *whether* a notification is wanted here — and resolve the second one with a single most-specific-wins precedence rule that a support agent can state in one sentence.

There is also a separable bug worth fixing on its own: a channel muted by a project during delivery **comes back in the weekly digest**.
:::

{.tick}
***

{.eyebrow}
Current state

## How routing is set today

Five layers, in the order they are applied. The ordering is not documented anywhere in the code — it is the emergent result of one SQL `UNION`, one Ruby filter loop, one snapshot write, and one client-side store.

:::columns{ratio="1:5:2" .layer}
{.ord}
**L1** additive

::col
[Union — adds channels]{.op .add}

### Event level, unscoped

Every channel ever linked to an event type, regardless of plan, region or project. This is the only layer with real coverage, and the only one with a UI — the internal Catalog *Event Channel Link* screen, which takes an event id or a bulk file.

{.tbl}
`catalog.event_channel_link → channel_def`

::col
{.facts}
- **Scale** ~612,400 rows
- **Owner** Delivery, via Catalog
- **Lead** No access
:::

:::columns{ratio="1:5:2" .layer}
{.ord}
**L2** additive

::col
[Union — adds channels]{.op .add}

### Event level, scoped to the workspace's plan tier

The same idea, narrowed to the plan tier of the workspace being notified. Carries a `required` flag. No application code writes this table — it is populated by migrations and hand SQL.

{.tbl}
`event_tier_channel_link (event_id, tier_id)`

::col
{.facts}
- **Scale** ~88,900 rows
- **Owner** Migrations only
- **Lead** No access
:::

:::columns{ratio="1:5:2" .layer}
{.ord}
**L3** additive

::col
[Union — adds channels]{.op .add}

### Plan tier blanket

Every event in the digest gets these, with `required` hard-coded to `true` in the query. This is the layer the ticket describes as "mostly decided by your plan" — and it is the thinnest of the three, covering ~110 links against roughly 3,200 tiers, which are themselves scoped by billing period.

{.tbl}
`tier_channel_link (tier_id) → billing.plan_tier_ref`

::col
{.facts}
- **Scale** ~110 rows
- **Owner** Migrations only
- **Lead** No access
:::

:::columns{ratio="1:5:2" .layer}
{.ord}
**L4** subtractive

::col
[Filter — removes channels]{.op .sub}

### Project mute rules

A 256-character JSON column on the project, matched against event numbers by range. It can name a channel *kind* or a channel *id*. **This is the workaround support recommends** — and there is no UI for it either, in any repo.

{.tbl}
`project.channel_rules → {"mute": {"kind": [], "channelId": []}}`

::col
{.facts}
- **Scale** Per project
- **Owner** Migrations / hand SQL
- **Lead** No access
:::

:::columns{ratio="1:5:2" .layer}
{.ord}
**L5** runtime

::col
[Render — per entry]{.op .render}

### Client re-resolution on every navigation

On each entry change the client resets all channels, then re-enables whatever the snapshot holds for that entry. The three toggles — Email, Chat, Webhook — are always present and grayed out when empty, so routing visibly changes as the reader moves through the digest, with nothing on screen explaining why.

{.tbl}
`channelStore.enable(channelId) per entry, from entry_channel_link`

::col
{.facts}
- **Scale** Per entry
- **Owner** Derived
- **Lead** No access
:::

{.eyebrow}
Resolution path

## Where the answer is actually decided

The critical stage is the fourth. Channel resolution runs once, on *first* open, and the result is written to `entry_channel_link`. Re-opening a digest does not re-resolve it — the code short-circuits on `has_entries?`. Every configuration change made after that point is invisible for the life of the digest.

:::columns{.pipe}
{.sn}
01

**Union three sources**

One query per entry, three `SELECT`s joined by `UNION`. Purely additive — no source can remove what another added.

{.sw}
`ChannelResolver#fetch_event_channel_links`

::col
{.sn}
02

**Filter by project**

Decode each project's JSON, find the rule covering this event number, drop channels matching `mute`.

{.sw}
`NotificationRepository#assemble_digest`

::col
{.sn}
03

**Format the payload**

Each surviving link becomes a row carrying channel id, channel name and `required_input`.

{.sw}
`PayloadFormatter#format_channel_link`

::col{.hot}
{.sn}
04

**Freeze the snapshot**

**Written once, on first open only.** Re-open returns early. Nothing in the standard path ever rebuilds it.

{.sw}
`DigestService#open_digest → has_entries?`

::col
{.sn}
05

**Serve and render**

The snapshot is read back per entry and turned into enabled toggles and menu entries.

{.sw}
`get-digest → channelStore`
:::

{.tick}
***

{.eyebrow}
Diagnosis

## Why it reads as layered, and why results surprise people

The sentiment in the ticket is accurate, and it is not only about the number of layers. Several mechanisms actively teach people the wrong mental model.

{.findings}
| Finding | What actually happens | Kind | Evidence |
|---|---|---|---|
| No project-level control exists | Neither `projects` nor `digests` carries any channel column. The mute workaround is not a shortcut — it is the only mechanism that can subtract anything. | [Model gap]{.chip .model} | `catalog schema` |
| Two incompatible grammars | The additive layers only speak `channel_id`. The one subtractive layer speaks either a kind or an id. "Stop the chat pings" means either naming 9 separate ids or naming `CHAT`, which removes all 9 — including the one the plan tier requires. | [Model gap]{.chip .model} | `channel_def — 9 CHAT rows` |
| Channels freeze, preferences stay live | On the same settings screen, preference checkboxes take effect immediately, because the client reads `workspace_preference` at runtime. Channel changes take effect never, because resolution already ran. Two rules, one screen, no signal which is which. | [Defect]{.chip .defect} | `DigestService.rb:48–60` |
| The weekly digest drops the filter | The digest path calls the same resolver but never applies the project `mute` filter. A channel suppressed during delivery is present in the weekly roll-up. | [Defect]{.chip .defect} | `WeeklyDigestRepository.rb:110–116` |
| `allow` is a documented no-op | The column comment documents both `mute` and `allow`. Migrations dutifully maintain both arrays. Only `mute` is ever read. Anyone reading the schema to understand the feature is misled by the schema itself. | [Dead]{.chip .dead} | `project DDL vs NotificationRepository.rb:186` |
| `required_input` is never read | Travels from `required` through the resolver, the payload, the delivery schema and into the client's TypeScript interfaces. Nothing consumes it. It looks like the knob for "mandatory vs optional" and is not. | [Dead]{.chip .dead} | `interfaces.ts:75` |
| Region is not a modeled dimension | Residency requirements live in the channel's *label* — "Email (EU)", "Chat relay, US-East", "Webhook, AU only". Adding a region means adding channel defs and backfilling links across the catalog; there is no column to filter on. | [Model gap]{.chip .model} | `channel_def has no region column` |
| The tier baseline decays each period | `plan_tier_ref` carries `billing_period`, so a pricing change mints new `tier_id` values. The ~110 `tier_channel_link` rows do not follow, and the baseline quietly empties. | [Model gap]{.chip .model} | `plan_tier_ref.billing_period` |
| Duplicate menu entries are reachable | The `UNION` dedupes on the whole row, `required` included. One channel arriving from two layers with different flags survives twice, and `enable()` pushes to `selectedIds` without dedupe — so a single-channel toggle renders as a menu with the same entry twice. Latent rather than confirmed: current writers all insert `true`, so it depends on legacy `false` rows. | [Latent]{.chip .defect} | `ChannelResolver.rb:60–93 · channelStore.ts:184` |

{.tick}
***

{.eyebrow}
Recommendation

## One pipeline, two authorship tiers, one vocabulary

The five layers exist because two genuinely different questions are being answered with the same mechanism — an additive link row naming a specific channel id. Separate the questions and the layer count collapses on its own.

:::grid{cols=2 .split}
- {.qcard}
  ### "Which chat channel does an EU Enterprise workspace get?"

  Delivery policy. Answered once per billing period from the plan's own published channel list. It is a *variant selection* question, and it never has a per-team answer.

  {.who}
  Owned by **Delivery** · changes each period · scoped to the plan tier
- {.qcard}
  ### "Do we want deploy pings on this project?"

  Routing policy. Answered per workspace, per project, or per event, by the person who owns the project. It is a *permission* question, and it is the one HAR-412 is about.

  {.who}
  Owned by **Team leads and admins** · changes constantly · scoped to workspace, project, event
:::

:::card{.statement}
{.eyebrow}
The rule that replaces the union and the JSON

{.rule}
The most specific setting wins. Anything not set is inherited.

{.prec}
`event` › `project` › `workspace` › `plan-tier baseline`

One direction, no additive/subtractive split, no second grammar. Support can state it, a team lead can predict it, and every screen can show both the effective value and the tier it came from.
:::

:::steps{.moves}
1. ### Make the channel *kind* the only vocabulary anyone chooses from

   `channel_kind` already exists, already has display labels, and is already what `mute.kind` matches on. Promote it: **team leads and admins choose among Email, Chat, Webhook and Digest — four nouns, never 40 channel ids.** Variant selection stays with Delivery, one tier down. This single change is what makes "stop the chat pings" a coherent request instead of a 9-row enumeration.

2. ### Two tables replace four

   One table answers *which variant*, one answers *wanted or not*. The permission table is scope-polymorphic, so adding the project tier HAR-412 asks for is a new `scope` value rather than a new layer, a new query branch and a new precedence question.

   ```text
   tier_channel_policy      (tier_id, channel_kind, channel_id, is_default)
                            — Delivery owns. Names the variant a plan expects.

   channel_permission       (scope, scope_id, channel_kind, permission)
                              scope ∈ tier | workspace | project | event
                              permission ∈ allow | deny
                            — The only table any customer-facing screen writes.
   ```

   The existing 612,400 `event_channel_link` rows migrate mechanically to `scope='event', permission='allow'`, so the catalog work already done is preserved rather than re-entered.

3. ### Resolve when the digest is served, not when it is first opened

   The ticket's requirement — a lead turns deploy pings off and they stop — cannot be met while resolution is a one-time snapshot. Two options, in order of preference: **resolve on read** in `get-digest`, which removes the snapshot entirely and matches how `workspace_preference` already behaves; or, as the smaller change, **rebuild the snapshot on every open and on every routing save**. Either way, channels and preferences finally follow the same rule, so the settings screen stops teaching two of them.

4. ### Ship it into the UI slot that already exists

   The project settings screen already has a **Preferences** card: a registry-driven checkbox list, unsaved-changes badge, save and undo, and a tooltip explaining that preferences can only be changed while the project is idle. Add a **Channels** card beside it with the same interaction contract, driven by the channel-kind registry instead of `workspace_preference`. Leads already know how this card behaves. Event-level overrides belong in the event catalog, not here.

5. ### Always show the effective value and its source

   Most of the reported confusion is unanswerable questions, not wrong behavior. Every surface that mentions channels should read like **"Chat — Off, set on this project"** or **"Email — Delivery relay (EU), from your plan"**. That one presentational rule is what turns a precedence chain from a hidden mechanism into something a team lead can reason about, and it is worth shipping before any behavior changes at all.

6. ### Retire the dimensions that only look like controls

   Each of these is something a reasonable person believes governs behavior, and does not.

   - **`required` / `required_input`** — drop it, or give it real meaning as "this channel cannot be denied at a lower tier", which is a genuinely useful guarantee for compliance channels.
   - **`project.channel_rules.allow`** — delete it along with the whole column once the permission table lands.
   - **`enabled = true` on channels the client cannot render** — the Digest and Webhook defs are flagged enabled, but the client has no component for either; the digest is a separate scheduled job. Reconcile the flag against what the channel component can actually mount.
:::

{.tick}
***

{.eyebrow}
Direct answer

## "Which current methods for defining routing are needed?"

The ticket's own open question, answered against what the code shows. The short form: keep all four tiers, but stop letting three of them add and one of them subtract.

{.verdicts}
| Method | Call | Reasoning |
|---|---|---|
| **Event level** | [Keep]{.call .keep} | The only layer with real coverage, and the right home for "this event needs a webhook". Becomes `scope='event'`. Collapse L1 and L2 into it — the tier scoping on L2 belongs to variant selection, not permission. |
| **Plan tier** | [Keep, narrowed]{.call .narrow} | This is the plan-alignment job the ticket describes, and it should keep it — but as *variant selection plus a baseline allow set*, not as a third additive source. Needs a rollover story so a new billing period does not silently empty it. |
| **Projects** | [Keep as a tier]{.call .keep} | Legitimate for real multi-project workspaces — a noisy staging project beside a quiet production one. It should stop being the answer to "stop the chat pings", which is what a workspace tier is for. Move it into project settings with a real UI. |
| **Workspace** *(new)* | [Add]{.call .addit} | What HAR-412 actually asks for, and the tier a team lead reaches for first. Cheap once the permission table is scope-polymorphic; expensive and confusing if added as a sixth layer to the current union. |
| **Per recipient** | [Out of scope]{.call .out} | Not in the ticket, but worth noting so the model leaves room: personal mute settings already exist as `member_preference` scoped by seat type. A per-person channel choice would belong there, above the event tier, and the precedence rule should be written to accept it later. |

{.eyebrow}
Sequencing

## How to land it

Ordered so that the first phase changes no behavior and still reduces support load, and the second phase closes HAR-412 without waiting for the full model.

:::grid{cols=4 .phases}
- {.phase}
  `Phase 1`

  ### Make today's behavior legible

  Build the channel-kind registry and the effective-value panel over the *existing* five layers. Show every channel with its resolved state and which layer decided it.

  {.out}
  **Outcome** — support can answer "why am I getting this?" without a database console
- {.phase}
  `Phase 2`

  ### Workspace-level routing

  Add the Channels card to the settings screen, writing workspace-scope permissions. Rebuild the snapshot on save and on open so the change is visible.

  {.out}
  **Outcome** — HAR-412 closes; the mute workaround is retired from support scripts
- {.phase}
  `Phase 3`

  ### Replace the resolver

  Land `tier_channel_policy` and `channel_permission`, migrate the event and tier links, switch to precedence resolution, and drop the union, the JSON column and the dead flags.

  {.out}
  **Outcome** — one rule, one code path, four tiers
- {.phase}
  `Phase 4`

  ### Projects and parity

  Project overrides get a real editor. Delivery, digest and export paths all read the same resolver.

  {.out}
  **Outcome** — what the lead configured is what every surface shows
:::

> [!CAUTION] Worth fixing before any of this
> The digest-path divergence is a small, isolated bug with a clear customer impact and no dependency on the model work. The weekly repository calls the resolver and formats every link it returns, **without applying the project `mute` filter that the delivery path applies**. Any project that used the mute workaround to suppress a channel gets it back in the weekly roll-up — which is exactly the scenario the lead in HAR-412 was trying to prevent.

{.small .muted .colophon}
A worked example for the Markset documentation. The system, the ticket and every identifier here are invented.
Written in Markset and rendered by the reference implementation with a theme stylesheet.
