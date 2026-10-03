---
markset: 0
title: Breakwater — week 40
theme:
  preset: technical
  accent: "#3b5bdb"
  density: compact
  radius: md
---

::::columns{.masthead ratio="2:1"}

{.eyebrow}
Weekly service review · Week 40 · 29 September to 5 October 2026

# Breakwater, week 40

{.lead}
The API platform's week on one page: what every service did, what went wrong and when, what shipped, and what next week has to decide.

::col

:::card[This week]{.verdict tone=warn}
**One incident, resolved.** Auth failed logins for 38 minutes on Tuesday. Every service is healthy now, and Auth's error budget is the number to watch.
:::

::::

:::metrics{.kpis}
| Measure | This week | Change |
|---|---|---|
| Requests | 1.84 B | +6% |
| Availability | 99.95% | -0.03 pts |
| Error budget left | 74% | -9 pts |
| Deploys | 47 | +9 |
:::

## Services

:::grid{.services cols=3}
- ### Edge

  [Healthy]{.badge .success}

  **99.99%** available · **37 ms** p95

  TLS termination and the firewall rules. A quiet week, and the lowest latency it has run at since July.

- ### Auth

  [Degraded Tuesday]{.badge .warn}

  **99.91%** available · **61 ms** p95

  INC-2291: a certificate rotated in one region before its replacement was trusted. 4% of logins failed for 38 minutes.

- ### Rate limiter

  [Healthy]{.badge .success}

  **100%** available · **3 ms** p95

  Shed 0.2% of traffic, all of it from two keys already on the abuse list.

- ### Router

  [Healthy]{.badge .success}

  **99.99%** available · **12 ms** p95

  The new routing table shipped on Wednesday behind a flag, and is on for a tenth of traffic.

- ### Ledger API

  [Healthy]{.badge .success}

  **99.98%** available · **88 ms** p95

  Write latency is flat for the first week since the March migration.

- ### Search API

  [Watch]{.badge .info}

  **99.97%** available · **146 ms** p95

  An index rebuild on Thursday doubled p95 for twenty hours. No incident; the rebuild is now scheduled for Sundays.
:::

## Latency and incidents

::::columns{ratio="2:1"}

:::figure[p95 latency by day, in milliseconds. Auth's spike is INC-2291 on Tuesday; Search's is Thursday's index rebuild.]{#fig-latency chart=line}
| Day | Edge | Auth | Search API |
|---|---|---|---|
| Mon | 38 | 64 | 140 |
| Tue | 39 | 182 | 142 |
| Wed | 41 | 71 | 139 |
| Thu | 38 | 66 | 236 |
| Fri | 37 | 63 | 188 |
| Sat | 35 | 60 | 150 |
| Sun | 36 | 61 | 146 |
:::

::col

:::card[Log]{.log}
- **Tue 09:14** INC-2291 opened: login failures in eu-west.
- **Tue 09:52** Resolved by restoring the old certificate. Rotation paused.
- **Wed 11:20** New routing table on for 10% of traffic.
- **Thu 13:30** Search index rebuild begins; p95 climbs.
- **Fri 10:05** Rebuild complete; p95 back by the afternoon.
- **Fri 16:05** Rotation resumed, with a trust check first.
:::

::::

## Change

::::columns{ratio="2:1"}

:::figure[Deploys and rollbacks by day. Both rollbacks were caught by the canary before a customer saw them.]{#fig-deploys chart=column}
| Day | Deploys | Rollbacks |
|---|---|---|
| Mon | 9 | 0 |
| Tue | 6 | 1 |
| Wed | 11 | 0 |
| Thu | 10 | 1 |
| Fri | 8 | 0 |
| Sat | 2 | 0 |
| Sun | 1 | 0 |
:::

::col

:::card[Shipped]{.log}
- **Router** The new routing table, behind a flag, on for 10% of traffic.
- **Rate limiter** Per-key limits read from the tenant record instead of a file.
- **Ledger API** The March migration's last compatibility shim, removed.
- **Rolled back** Two Auth releases, Tuesday and Thursday, both at the canary.
:::

::::

## Error budget

::::columns{ratio="1:2"}

:::card[Policy]{.log}
- **Below 50%** A service's own team reviews every deploy before it ships.
- **Below 25%** Non-urgent deploys stop until the budget recovers.
- **Auth, now** 31% left with eight weeks of the quarter to go.
:::

::col

:::figure[Error budget left this quarter, as a percentage. Auth has spent more than two thirds of its budget in five weeks.]{#fig-budget chart=bar}
| Service | Budget left |
|---|---|
| Edge | 94 |
| Auth | 31 |
| Rate limiter | 88 |
| Router | 91 |
| Ledger API | 83 |
| Search API | 58 |
:::

::::

## Next week

::::columns

:::card[Decide]
- Whether Auth freezes non-urgent deploys until its budget recovers past 50%.
- Whether the routing table goes to half of traffic on Wednesday.
:::

::col

:::card[Carried over]
- The trust check for certificate rotation, in every region and not only eu-west.
- A search rebuild that runs without doubling p95.
:::

::col

:::card[On call]
- **Primary** Platform, rotation B
- **Secondary** Identity
- **Change freeze** none planned
:::

::::

{.small .muted}
Breakwater, INC-2291 and every service, number and team on this page are invented. It exists to show a Markset document whose page is a grid of panels rather than a column of prose: a masthead in `columns`, the week's numbers in `metrics`, a `grid` of services whose status is a badge, and three charts drawn from tables. Source: `examples/service-review.md`, rendered with `examples/console.css`.
