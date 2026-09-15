---
markset: 0
title: Runbook — checkout latency
theme:
  preset: report
  accent: "#8a2d3b"
  density: compact
  radius: none
---

{.eyebrow}
Runbook · CHK-LAT · Page severity 2

# Checkout latency above 800ms

{.lead}
You have been paged because p99 checkout latency has been above 800ms for five minutes. This page is written to be read while that is still happening. **Do the triage, then find your symptom.** Everything below the first two sections is reference.

[On call: payments]{.badge .danger} [Escalate after 20 min]{.badge .warn} [Last reviewed: 2026-09]{.badge}

:::metrics{.first direction=inverse}
| Signal | Threshold | Page at |
|---|---|---|
| Checkout p99 | 800ms | 5 min |
| Checkout error rate | 0.5% | 2 min |
| Authorization p99 | 2s | 5 min |
:::

{.tick}
***

{.eyebrow}
Do this first

## Triage, in order

:::steps
1. {.now}
   ### Is it us, or is it the processor?

   ```sh
   chk dash --window 30m --split upstream
   ```

   If `processor_wait` is most of the latency, this is not our outage. Go to **The processor is slow** and stop following these steps.

2. {.now}
   ### Did something ship?

   ```sh
   chk deploys --since 45m
   ```

   Correlate the start of the graph with the deploy list. If a checkout-path service deployed within ten minutes of onset, roll it back now and diagnose afterwards. A rollback that turns out to be unnecessary costs four minutes; the alternative costs the incident.

3. ### Is one dependency doing it?

   ```sh
   chk dash --window 30m --split dependency
   ```

   One dependency above its own p99 baseline is the usual answer, and it tells you which section below to read. Several at once usually means the database or the network, not the dependencies.

4. ### Declare, if it is still going

   Twenty minutes from page to either recovery or a declared incident. If you are still reading at minute twenty, declare — a declared incident that resolves in a minute costs nothing, and an undeclared one that runs an hour costs a lot.
:::

{.tick}
***

{.eyebrow}
Find your symptom

## What the split is telling you

:::grid{cols=2}
- ### `processor_wait` dominates

  The card processor is slow and we are waiting on them. We cannot fix it; we can stop making it worse.

  **Do:** raise the circuit breaker threshold so retries stop piling on, and check the processor's status page before escalating to them.

- ### `db_wait` dominates

  Almost always lock contention on `orders`, and almost always a long-running analytical query that escaped to the primary.

  **Do:** find it with `chk db --slow`, and kill it. Killing a read query is safe; confirm it is a read first.

- ### `inventory_rpc` dominates

  The inventory service is slow or a pod is unhealthy. Checkout blocks on it, which is a known design problem, not a mystery.

  **Do:** check inventory's own dashboard. If one pod is bad, drain it; if all are, page inventory's on-call.

- ### Nothing dominates

  Latency is up everywhere by a similar proportion. That is the platform, not the application: a node pool, the service mesh, or DNS.

  **Do:** stop looking at checkout and page platform on-call with the evidence that it is uniform.
:::

{.tick}
***

{.eyebrow}
Procedures

## The three things you might have to do

:::tabs
### Roll back a deploy

```sh
chk deploys --since 45m
chk rollback <service> --to <previous>
chk dash --window 10m
```

Rollback takes about 90 seconds to take effect. Watch for two full minutes before deciding it did not work — the graph lags the fix.

### Raise the breaker threshold

```sh
chk breaker show checkout->processor
chk breaker set checkout->processor --failure-ratio 0.5 --window 60s
```

This makes us *more* tolerant of a slow processor, which is right when they are degraded and wrong the rest of the time. **Put it back when the incident closes**, and note it in the incident channel so the next person knows it is not the normal value.

### Kill a slow query

```sh
chk db --slow --min 30s
chk db --kill <pid>
```

Confirm the query is a `SELECT` before killing it. Killing a write leaves the transaction to roll back, which can take as long as the query has been running and will make things worse for several minutes.
:::

> [!WARNING] Two things not to do
> **Do not scale checkout up** while `db_wait` is the problem. More replicas means more connections competing for the same locks, and the graph gets worse in a way that looks like the scaling has not taken effect yet.
>
> **Do not flush the cache** to "start clean". A cold cache under an already-degraded checkout has caused two of the last four incidents on this service, both times during the attempted fix rather than the original fault.

{.tick}
***

{.eyebrow}
Escalation

## Who to wake, and when

:::figure[Escalation paths. Twenty minutes is the outer bound for any of them; go sooner if the symptom is unambiguous.]
| Symptom | Escalate to | When |
|---|---|---|
| `processor_wait`, processor status page is green | Payments lead | 10 min, they have the vendor contact |
| `db_wait`, no slow query found | Database on-call | Immediately, this is not a normal cause |
| `inventory_rpc`, all pods unhealthy | Inventory on-call | Immediately |
| Uniform across dependencies | Platform on-call | Immediately |
| Anything, still going at 20 minutes | Incident commander | 20 min, no exceptions |
:::

> [!TIP]- What to put in the incident channel
> Four things, in this order: what the alert said, what the dependency split shows, what you have already tried, and what you are about to try next. Do not write a narrative — the next person to arrive reads the last message first and needs to know what is in flight, not how you got here.

{.tick}
***

{.small .muted}
Checkout, the `chk` tool, every service name and every threshold on this page are invented. It exists as a Markset example of the shortest and densest genre there is: a page read by someone under time pressure who needs the first screen to be the answer. Source: `examples/runbook.md`, rendered with `examples/runbook.css`.
