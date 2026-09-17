---
markset: 0
title: Keystone Baseline Control
theme:
  preset: report
  accent: "#14607a"
  density: comfortable
  radius: none
---

{.eyebrow}
Waypoint · NRT · Change set

# Keystone Baseline Control

{.lead}
Record the timeframe we originally agreed, log every change to it with a reason, and report where the slip actually came from. Scoped to the keystones that are moving now — twelve items, not a hundred and eighteen.

:::metrics{.figures}
| Measure | Value |
|---|---|
| Items flagged Keystone | 118 |
| Active (Shaping + Build) | 31 |
| Active with dates set | 12 |
| Target changes | [53]{.danger} |
:::

{.tick}
***

{.eyebrow}
Step 0

## Retire the duplicate date pair first

{.lead}
NRT has two competing pairs of date fields. Adding baselines before resolving that gives you four date fields and no agreement on which two are real.

The live pair is `Plan start` (`field_2117`) and `Plan target` (`field_2116`). The legacy pair is `Legacy plan start` (`field_1804`) and `Legacy plan target` (`field_1805`). Twenty-seven keystones carry both, and seventeen of them disagree.

The legacy pair looks baseline-shaped — frozen at older values on most records — and it is tempting to simply rename it. Don't. On three of the twenty-seven the legacy date is *later* than the plan date, so it is not a consistent record of anything. It is an abandoned migration, not a baseline.

**Action:** export the legacy pair's values for the twenty-seven affected items, then remove both fields from the Keystone type. The export is your audit trail; the exported values are *not* the baselines you are about to set.

:::figure[Seven of the seventeen diverging records. NRT-431 is the shape of the problem: the "older" field holds the *later* date, so the legacy pair cannot be promoted wholesale.]
| Item | Status | Plan target | Legacy target | Divergence |
|---|---|---|---|---:|
| `NRT-114` | 2-Shaping | 2026-12-03 | 2025-10-09 | [+420 d]{.danger} |
| `NRT-27` | 6-Done | 2025-04-11 | 2024-03-31 | [+376 d]{.danger} |
| `NRT-640` | 5-Measure | 2026-01-08 | 2025-09-11 | [+119 d]{.danger} |
| `NRT-702` | 5-Measure | 2026-01-08 | 2025-09-25 | [+105 d]{.danger} |
| `NRT-655` | 5-Measure | 2026-03-26 | 2025-12-31 | [+85 d]{.danger} |
| `NRT-618` | 5-Measure | 2025-11-04 | 2025-09-04 | [+61 d]{.danger} |
| `NRT-431` | 6-Done | 2025-11-13 | 2025-11-20 | [−7 d]{.success} |
:::

{.tick}
***

{.eyebrow}
Step 1

## Eight new fields

{.lead}
Baselines as plain date pickers, a reason as a picklist, and a log that automation writes so nobody has to.

The existing date fields are `waypoint:interval` — they store JSON, not dates: `{"start":"2026-09-01","end":"2026-09-30"}`. That is fine for a plan that is deliberately fuzzy at the edges, but useless for arithmetic. Make the baselines **plain date pickers** so slip is a subtraction and a query works normally.

There is precedent in the project: `Start date` (`field_1600`) is already a standard date picker sitting on the Keystone type. It is set on **zero of the hundred and eighteen** keystones, so it is dead weight you can reuse or remove in the same pass.

:::figure[Seven of the eight are written by automation. The team fills in one field, once, when a date moves.]
| Field | Type | Written by | Purpose |
|---|---|---|---|
| `Baseline start` | Date picker | Automation | The start we agreed at commitment. Never edited after stamping. |
| `Baseline target` | Date picker | Automation | The target we agreed at commitment. Never edited after stamping. |
| `Baseline set on` | Date picker | Automation | When the commitment was made, so "agreed as of when?" is always answerable. |
| `Baseline origin` | Select | Automation / owner | Stamped at Build · Backfilled from history · Retro-entered, no forecast · Re-baselined |
| `Date change reason` | Select | Owner | The one field a human must fill. Options below. |
| `Date change note` | Paragraph | Owner | Free-text detail alongside the category. Optional. |
| `Date change log` | Paragraph | Automation | Append-only record: field, old → new, who, when. |
| `Change unexplained` | Checkbox | Automation | Set when a date moves without a reason. Drives the nag list. |
:::

### Date change reason — the options

This is the highest-leverage decision in the whole scheme. Free text produces forty unreadable sentences a year; a picklist produces a distribution you can put in front of leadership.

- **Business decision — priority reallocated.** We chose to do something else first.
- **Dependency or external block.** Waiting on a vendor, a customer, another team.
- **Scope increased.** The thing got bigger after we committed.
- **Estimate was wrong.** The work was harder than we forecast.
- **Capacity lost.** Attrition, support load, incident response.
- **Correction.** Typo or data fix, no real change to the plan.

> [!NOTE] Why "Correction" is on the list
> It is not hypothetical. NRT-114 and NRT-115 each had a target typed as `2025-02-28` when `2026` was meant, corrected minutes later. NRT-903's start was set to `2027-12-31` — ten months past its own target — before being corrected. Without this option those keystrokes land in your slip statistics as real schedule decisions.

{.tick}
***

{.eyebrow}
Step 2

## Backfill: twelve items, values already recovered

{.lead}
Every original target is still in the tracker's change history. These are the exact values to enter — no judgment calls required.

Slip is measured from the *first* value the field ever held to what it holds today. Where the plan was set at month granularity, the month's end date is used.

:::figure[Recovered from each item's change history on the `Plan start` and `Plan target` fields. Two of the twelve have never moved and are omitted.]
| Item | Status | Baseline target | Current target | Slip | Revisions | Baseline origin |
|---|---|---|---|---:|---:|---|
| `NRT-114` | 2-Shaping | 2025-09-25 | 2026-12-03 | [+434 d]{.danger} | [18]{.danger} | [Backfilled]{.badge .warn} |
| `NRT-115` | 2-Shaping | 2025-11-11 | 2026-11-19 | [+373 d]{.danger} | [9]{.danger} | [Backfilled]{.badge .warn} |
| `NRT-903` | 2-Shaping | 2026-07-31 | 2027-02-11 | [+195 d]{.danger} | [8]{.danger} | [Backfilled]{.badge .warn} |
| `NRT-388` | 2-Shaping | 2026-03-31 | 2026-06-30 | [+91 d]{.danger} | 2 | [Backfilled]{.badge .warn} |
| `NRT-577` | 4-Build | 2026-07-31 | 2026-09-03 | [+34 d]{.danger} | 4 | [Backfilled]{.badge .warn} |
| `NRT-452` | 2-Shaping | 2026-09-30 | 2026-10-01 | [+1 d]{.danger} | 1 | [Backfilled]{.badge .warn} |
| `NRT-861` | 4-Build | 2026-06-30 | 2026-06-04 | [−26 d]{.success} | 5 | [Backfilled]{.badge .success} |
| `NRT-1012` | 4-Build | 2026-09-30 | 2026-09-30 | [0 d]{.muted} | [0]{.muted} | [Retro-entered]{.badge} |
| `NRT-1013` | 4-Build | 2026-09-30 | 2026-09-30 | [0 d]{.muted} | [0]{.muted} | [Retro-entered]{.badge} |
| `NRT-1027` | 4-Build | 2026-09-03 | 2026-09-03 | [0 d]{.muted} | [0]{.muted} | [Retro-entered]{.badge} |
:::

### Read the bottom three rows carefully

NRT-1012, NRT-1013 and NRT-1027 show zero slip and zero revisions. That is not discipline — all three were created between 18 and 24 August 2026, flipped from `1-Backlog` straight to `4-Build` in the same minute, with a start date backdated to early June. The item was recorded *after* the work began. There was never a forecast to miss.

Mark them `Retro-entered, no forecast` and exclude them from slip reporting. If you let them sit in the average as three perfect scores, the headline number becomes meaningless in exactly the direction that makes the report untrustworthy.

### And the top three

NRT-114's target has moved **eighteen times** across sixteen months. NRT-115's, nine times. Neither has ever been flagged, because no individual move looked alarming — NRT-577's four moves were 7, 14, 7 and 14 days apiece, and its start crept ten weeks in seven increments. That incremental drift is the entire thing a baseline exists to catch, and it is invisible to any status-by-status review.

Slip also tracks age, not difficulty: the two oldest items have the two worst records, and the three cleanest are the three newest. Any report you build should show slip against baseline age, or it will quietly reward whatever was committed most recently.

{.tick}
***

{.eyebrow}
Step 3

## Three automation rules

{.lead}
Waypoint has no validator that can require a field on edit, so enforcement is detect-and-nag, not prevent. Make the gap visible instead of trying to close it.

The interval fields hold JSON in a string, so the date has to be pulled out with a regex smart value. Rule 2 does all the bookkeeping, which leaves the owner one job: pick a reason.

:::card[R1 · Stamp the baseline at commitment]{.rule}
- **Trigger** Item transitioned → to status **4-Build**
- **Condition** Keystone = 1 AND Baseline target is empty
- **Action**
  1. Edit → Baseline target = `{{item.field_2116.match("\"end\":\"(.{10})\"")}}`
  2. Edit → Baseline start = `{{item.field_2117.match("\"end\":\"(.{10})\"")}}`
  3. Edit → Baseline set on = `{{now.date}}`
  4. Edit → Baseline origin = `Stamped at Build`
- **Note** *Fires on retro-entered items too. Rule 1b below catches those.*
:::

:::card[R1b · Catch the retro-entered ones]{.rule}
- **Trigger** Runs immediately after R1, same rule chain
- **Condition** Baseline start < `{{item.created}}`
- **Action**
  1. Edit → Baseline origin = `Retro-entered, no forecast`
  2. Comment: work began before this item was recorded; excluded from slip reporting
- **Why** *A start date earlier than the item's own creation date is proof the dates were fitted after the fact.*
:::

:::card[R2 · Log every date change, flag the unexplained]{.rule}
- **Trigger** Field value changed → **Plan start**, **Plan target**
- **Condition** Keystone = 1 AND Baseline target is not empty
- **Action**
  1. Edit → Date change log = `{{item.Date change log}}` + newline + `{{now.format("yyyy-MM-dd")}} · {{change.field}} · {{change.from.match("\"end\":\"(.{10})\"")}} → {{change.to.match("\"end\":\"(.{10})\"")}} · {{actor.displayName}}`
  2. If Date change reason is empty → Edit: Change unexplained = `Yes`
  3. If Date change reason is empty → Comment mentioning the item owner
- **Effect** *The human never types a date, a name or a timestamp — only a reason.*
:::

:::card[R3 · Clear the flag when the reason lands]{.rule}
- **Trigger** Field value changed → **Date change reason**
- **Condition** Change unexplained = Yes
- **Action**
  1. Edit → Date change log append `  → reason: {{change.to}} — {{item.Date change note}}`
  2. Edit → Change unexplained = `No`
  3. Edit → Date change reason = `(empty)`, ready for the next change
- **Note** *Clearing the reason field after logging keeps it a per-change prompt rather than a stale value that suppresses future flags.*
:::

> [!IMPORTANT] On enforcement
> You cannot block the edit, and trying to would only teach people to type "n/a". What actually works is Step 4: put the unexplained list on the page leadership reads. An unexplained change that is visible gets explained within a day.

{.tick}
***

{.eyebrow}
Step 4

## The wiki page

{.lead}
Five sections. One of them is written by a person each month; the rest maintain themselves.

Embed a published tracker view for the live table rather than hand-maintaining one — a stale table is worse than no table. But the embed alone will not do the job. Leadership reads the narrative and glances at the numbers.

::::card[Keystone Commitments · FY27]{.wire}
:::steps
1. ### What changed this month, and what we traded

   Three to five sentences, written by a person. This is the section that does the work — it is where a reprioritization reads as a decision the organization made together rather than a team missing a date.

2. ### Where the slip came from

   The reason-category distribution, as counts and days. **This is the headline, not average slip.** "Of 14 date changes this year, 9 were priority reallocations we made together, 2 were external dependencies, 3 were estimation misses" is the sentence the whole scheme exists to be able to say.

3. ### Commitments against baseline

   Embedded tracker view. Filter: `Keystone = 1 AND status in (2-Shaping, 4-Build) AND Baseline target is not EMPTY`. Columns: item, owner, baseline target, current target, slip, revisions, last reason. Group by `Commitment` — it is set on 117 of 118 keystones, so it is a grouping that already works. Show negative slip in the same column as positive; NRT-861 pulled in 26 days and the report should say so.

4. ### Changes awaiting an explanation

   Filter: `Change unexplained = Yes`. Usually empty. When it is not, it is short and specific, and it gets resolved because it is visible here.

5. ### Excluded from slip reporting

   Filter: `Baseline origin = Retro-entered, no forecast`. Listed openly with the reason, so the exclusion is a stated method rather than a gap someone discovers later.
:::
::::

### Scope it to the active twelve

Forty-one of the hundred and eighteen keystones sit in `1-Backlog`. Putting them on a leadership page dilutes precisely the signal you are trying to create. Parked work belongs in the tracker's views, not in the commitment report.

### Frame it as change accounting, not adherence scoring

Baselines can be picked up as a stick as easily as used as evidence, and "you missed your baseline" is the exact mindset you are trying to move away from. Say so explicitly when you introduce it, and let the reason distribution lead every report. A page that opens with *average slip: 34 days* hands over a stick. A page that opens with *64% of slip came from decisions we made together* makes the trade-offs visible, which is the actual goal.

{.tick}
***

## Verify before building

{.lead}
Five things I could not confirm from the API alone. None of them changes the design, but each could change the mechanics.

:::steps{.verify}
1. ### A plain date picker on the Keystone type

   The project's field panel offers Waypoint-native types, which lean toward intervals. `field_1600` proves a standard date picker *can* live on this item type, but it may need creating as a global custom field and associating, rather than through the tracker's own panel.

2. ### Automation firing on interval fields

   The `Field value changed` trigger needs to fire for `Plan start` and `Plan target`. Their changes do appear in the item's history, which is a strong signal but not proof the trigger sees them. Test with one item before rolling out.

3. ### The regex smart value against interval JSON

   Every rule above depends on `.match("\"end\":\"(.{10})\"")` pulling the date out of the stored JSON. Confirm it returns a bare date string that a date-picker field will accept.

4. ### Field count limits on your plan

   The Keystone type already carries 53 fields. Eight more is not obviously a problem, but plan limits exist — and retiring the legacy pair plus `Horizon` gives three back before you start.

5. ### Who can see the embedded view

   Confirm the embed renders for leadership readers who do not hold a tracker seat. If it does not, the fallback is an automation-generated table on the page — still automatic, just a different mechanism.
:::

### Two loose ends worth closing in the same pass

**`Horizon` (`field_2041`) is dead.** Its four options — Watching, Considering, Ranked, Committed — are set on exactly one of a hundred and eighteen keystones. Either retire it or repurpose it as the commitment gate, in which case R1 should trigger on it reaching `Committed` rather than on the Build transition.

**No keystone has ever sat in a "3-" status.** Every recent commitment goes `1-Backlog → 4-Build` directly. If the workflow has a gate at step 3, it is being skipped — worth knowing before you attach a baseline stamp to a transition.

And a question rather than a recommendation: a hundred and eighteen items carry a flag meaning "large initiative requiring careful tracking". That is enough that the flag no longer selects for much. Whether it matters depends on how else you use it — but the discipline in this document should attach to the thirty-one active keystones, not to the flag as a whole.

{.tick}
***

{.small .muted}
Northroad, Waypoint, NRT and every field, name and number in this document are invented; it exists to show what a Markset change set looks like when the argument is a set of tables and a set of rules. Nothing here was read from any real tracker. Source: `examples/keystone-baseline.md`, rendered with `examples/ledger.css`.
