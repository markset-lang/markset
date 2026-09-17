---
markset: 0
title: The mean tenant does not exist
theme:
  preset: report
  accent: "#0f766e"
  density: comfortable
  radius: sm
---

{.eyebrow}
Capacity review · Cistern · FY27 planning

# The mean tenant does not exist

{.lead}
Cistern has been sized for four years against an average tenant holding 945 GB. The number is arithmetically correct and it describes almost nobody: three percent of the fleet sits within a factor of two of it. Half our tenants hold less than 9 GB, and 340 of them hold three quarters of everything we store.

[Planning input]{.badge} [FY27]{.badge .info} [Decision by 14 October]{.badge .warn}

:::metrics{.fleet}
| Measure | Value | Change |
|---|---|---|
| Tenants | 12,100 | +18% |
| Stored | 11.4 PB | +28% |
| Mean tenant | 945 GB | +9% |
| Median tenant | 9 GB | +1 GB |
:::

> [!IMPORTANT]
> **The fleet total is the only number here that behaves.** It has grown between two and three percent a month for four years, which is why nobody has looked underneath it. Underneath it are two populations that share a service and little else, growing at 10% and 38% a year, and every capacity decision we have taken has been sized for the average of the two.

{.tick}
***

{.eyebrow}
What we planned for

## Four years of a straight line

Cistern's capacity model takes one input, total stored bytes, and it has been accurate every quarter since FY23. That accuracy is the problem. A total is the one view of this fleet in which the two populations cancel out, and it is the view every planning document has used.

:::figure[Stored volume and the share held by the largest 340 tenants, by quarter. The total is smooth; the composition is not.]{#fig-growth}
| Quarter | Stored | Tenants | Held by top 340 |
|---|---|---|---|
| FY25 Q1 | 5.9 PB | 7,900 | 61% |
| FY25 Q2 | 6.4 PB | 8,400 | 63% |
| FY25 Q3 | 7.0 PB | 9,000 | 65% |
| FY25 Q4 | 7.6 PB | 9,600 | 66% |
| FY26 Q1 | 8.3 PB | 10,200 | 68% |
| FY26 Q2 | 9.1 PB | 10,900 | 70% |
| FY26 Q3 | 10.2 PB | 11,500 | 72% |
| FY26 Q4 | 11.4 PB | 12,100 | 74% |
:::

Eight quarters of steady compounding, and a thirteen point shift in who holds the bytes. The second fact is the one that changes what we should build, and it is the one a total cannot show: 96% of the volume added in FY26 went to tenants that were already among our largest.

{.tick}
***

{.eyebrow}
The finding

## Two populations, one average

Stored volume per tenant is not distributed around a center. It has two of them, roughly two orders of magnitude apart, with the arithmetic mean sitting in the gap between.

:::figure[Tenants by stored volume. The mean, 945 GB, falls in the 250 GB to 1 TB band — the emptiest bucket in the fleet.]{#fig-dist .plot}
```ascii
  under 10 GB   |################################  6,140
  10 to 50 GB   |###################               3,660
  50 to 250 GB  |####                                760
  250 GB to 1 TB|##      <- the mean lives here      390
  1 to 8 TB     |####                                810
  8 to 40 TB    |#                                   290
  over 40 TB    |                                     50
```
:::

::::columns{ratio="3:2"}
The left population is what self-serve signup produces: a workspace, a few thousand documents, a long flat life. There are 9,800 of them and together they hold 116 TB, which is one percent of the fleet. They are not growing in bytes and they are not going to.

The right population is 340 tenants running archival workloads, holding 8.4 PB between them. They grew 38% last year and their contracts commit us to that rate or better. Everything expensive about Cistern is downstream of this group, and every capacity decision that mattered in FY26 was actually a decision about them.

Between the two is a 390-tenant band that our planning model treats as typical. It is the least populated part of the distribution, and no tenant has ever stayed in it for more than five quarters — they cross it on the way up or they never enter it at all.

::col

:::card[What the average is doing to us]{tone=warn}
An average is a claim that one number can stand in for a population. That claim is safe when the population has one mode and it fails silently when it has two.

We have not been planning badly for the average tenant. We have been planning well for a tenant that does not exist.
:::
::::

{.tick}
***

{.eyebrow}
What it costs

## Cost follows tenants at one end and bytes at the other

The unit economics invert across the distribution, which is the second thing the fleet total hides. Per stored terabyte, small tenants are our most expensive by a factor of three. Per tenant, they are our cheapest by a factor of twenty.

:::figure[Monthly cost by tier, split into what storage costs and what serving a tenant costs regardless of size.]{#fig-cost}
| Tier | Tenants | Stored | Storage | Per tenant | Share of bill |
|---|---|---|---|---|---|
| Workspace, under 50 GB | 9,800 | 116 TB | $23/TB | $4.10 | 21% |
| Team, 50 to 250 GB | 760 | 91 TB | $19/TB | $6.80 | 3% |
| Business, 250 GB to 1 TB | 390 | 214 TB | $16/TB | $11.20 | 4% |
| Scale, 1 to 8 TB | 810 | 2.6 PB | $11/TB | $28.00 | 26% |
| Archive, over 8 TB | 340 | 8.4 PB | $7/TB | $96.00 | 46% |
:::

The Workspace tier holds one percent of our bytes and accounts for twenty-one percent of our bill, almost all of it fixed per-tenant overhead: a metadata shard, a backup schedule, a quota watcher and an index that exist whether the tenant stores four gigabytes or none. Archive is the mirror image — three quarters of the bytes, under half the bill, and almost nothing that scales with tenant count.

A plan that optimizes cost per terabyte improves the tier that is already cheap. A plan that optimizes cost per tenant improves the tier that holds no data. Neither is wrong, and neither is a plan for Cistern, because Cistern is both.

{.tick}
***

{.eyebrow}
Projection

## Three ways FY27 goes, and the cheapest one is not the smallest

Volume is the wrong axis to choose a scenario on, and this is where the fleet total stops being merely uninformative and becomes actively misleading.

:::figure[Stored petabytes by quarter under three FY27 scenarios.]{#fig-scenarios chart=line}
| Quarter | Steady | Enterprise-led | Self-serve push |
|---|---|---|---|
| FY27 Q1 | 12.4 | 12.6 | 12.8 |
| FY27 Q2 | 13.5 | 14.0 | 13.9 |
| FY27 Q3 | 14.7 | 15.5 | 14.9 |
| FY27 Q4 | 16.0 | 17.2 | 15.8 |
| FY28 Q1 | 17.4 | 19.1 | 16.6 |
| FY28 Q2 | 18.9 | 21.2 | 17.3 |
| FY28 Q3 | 20.6 | 23.5 | 18.0 |
| FY28 Q4 | 22.4 | 26.1 | 18.6 |
:::

The three curves cross, and that is the whole finding. Self-serve leads for three quarters on a burst of onboarding, is overtaken by Steady in FY27 Q4, and runs below both for the rest of the period. A reader who checks the first two quarters and a reader who checks the last two come away with opposite impressions, and both of them have read the numbers correctly.

Volume is also the wrong thing to have been reading. Each scenario ends somewhere different on the measure that actually drives cost:

:::figure[Tenants at the end of the period, by scenario.]{#fig-ending chart=bar}
| Scenario | Ending tenants |
|---|---|
| Steady | 14,800 |
| Enterprise-led | 13,900 |
| Self-serve push | 24,000 |
:::

The self-serve push is the modest scenario by volume — it ends at 18.6 PB, four petabytes below Steady and seven below Enterprise-led — and the expensive one by tenant count, ending with 11,900 more tenants than Steady, each carrying $4.10 a month of fixed overhead that has nothing to do with the bytes they store.

{.tick}
***

{.eyebrow}
Recommendation

## Plan for two services, not one average

:::grid{cols=2}
- ### Workspace

  9,800 tenants, 116 TB, and a cost structure that is entirely per-tenant. The work is amortizing fixed overhead: shared metadata shards, one backup schedule across many tenants, no dedicated index below 10 GB. Capacity here is a tenant-count problem and has never been a storage problem.

- ### Archive

  340 tenants, 8.4 PB, and a cost structure that is entirely per-byte. The work is tiering, compaction and the contract terms that commit us to 38% growth. Capacity here is a storage problem and the tenant count is irrelevant.
:::

:::steps
1. ### Split the capacity model in two

   {.when}
   Before FY27 planning closes

   Two models with two inputs — tenant count for Workspace, stored bytes for Archive — replacing one model that takes the total. This is a spreadsheet change and it is the whole recommendation; everything below follows from it.

2. ### Stop reporting the mean

   Replace it in the fleet dashboard with the median and the top-340 share. The mean is not wrong, it is unreadable, and it is quoted in four planning documents that all inherit the same error.

3. ### Price the per-tenant floor

   $4.10 a month of fixed overhead per Workspace tenant is invisible in a per-terabyte price list. Whether it should be recovered or absorbed is a commercial decision, but it should be a decision.

4. ### Re-run the scenarios on both axes

   Every scenario in this review needs a tenant-count projection beside its volume projection. Three of them reverse order when you do.
:::

:::figure[What each scenario asks for, once tenant count is read beside volume.]{#fig-decision}
| Scenario | Storage build | Per-tenant build | Harder than it looks |
|---|---|---|---|
| Steady | 11 PB over two years | 2,700 tenants | No |
| Enterprise-led | 15 PB over two years | 1,800 tenants | Contract terms, not capacity |
| Self-serve push | 7 PB over two years | 11,900 tenants | Yes — the cheap-looking one |
:::

> [!NOTE]
> **This review deliberately proposes no new storage hardware.** Every scenario above is inside the commitments we already hold. What it proposes is that we stop making one decision where there are two, which costs nothing and is the reason the last four capacity plans were accurate and useless.

{.tick}
***

{.small}
Cistern capacity review · Prepared for the FY27 planning cycle · Figures are fleet-wide as of FY26 Q4 close · Distribution and cost tables exclude internal tenants and trials
