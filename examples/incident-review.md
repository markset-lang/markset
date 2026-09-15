---
markset: 0
title: Nine hours of stale search
theme:
  preset: report
  accent: "#b4501f"
  density: comfortable
  radius: sm
---

{.eyebrow}
Incident review · INC-4417 · Ambercourt Recall

# Nine hours of stale search

{.lead}
On 19 August, Recall served search results from a nine-hour-old index to roughly a third of our customers. Nothing was lost and nothing was corrupted. What failed was our ability to notice: every alarm we had was watching the indexer, and the indexer was healthy the entire time.

[Severity 2]{.badge .warn} [Resolved]{.badge .success} [Review complete]{.badge}

:::metrics{.impact direction=inverse}
| Measure | Value | Change |
|---|---|---|
| Time to detect | 8h 41m | +8h 26m |
| Time to repair | 31m | -4m |
| Accounts affected | 6,312 | |
| Data lost | None | |
:::

> [!NOTE]
> **If you read one section, read "Why nobody saw it".** The outage itself was a one-line configuration error and it is not interesting. The nine hours are the finding: we had eleven alarms on this system and none of them could have fired, because all eleven measured the health of a process rather than the freshness of its output.

{.tick}
***

{.eyebrow}
What happened

## A queue that drained into nothing

Recall keeps its search index fresh with a write-behind queue. Document changes land in `recall-ingest`, a worker drains the queue every thirty seconds, and the index picks up the batch on its next commit. The worker is stateless and horizontally scaled, and it has been the least eventful part of this system for two years.

At 01:14 a routine configuration change shipped a new value for `ingest.target_index`. The value was correct for staging and wrong for production: it named `recall-v3`, an index that exists in production but is not the one queries read. The worker drained the queue as fast as it ever had, committed every batch successfully, and wrote all of it to an index nobody was searching.

:::card[The whole defect]{tone=danger}
```diff
  ingest:
-   target_index: recall-v3-staging
+   target_index: recall-v3
```
The environment suffix is the only thing that made this line correct. The value that replaced it is a real index name in production, so every downstream check that asked "does this index exist" answered yes.
:::

{.tick}
***

{.eyebrow}
Timeline

## The nine hours, in order

:::steps
1. ### 01:14 — The change ships

   {.when}
   Tuesday, 19 August

   Change `CFG-8821` merges and deploys through the ordinary pipeline. Two approvals, both from engineers who own the service. The diff is four lines and the staging soak is green, because in staging the value is correct.

2. ### 01:14 to 09:47 — Everything looks fine

   Queue depth is flat. Worker error rate is zero. Commit latency improves slightly, which in hindsight is the signal: the target index is smaller and cheaper to write, and nobody reads an improvement as a symptom.

3. ### 09:47 — A customer notices

   A support ticket arrives: a document edited "yesterday afternoon" is not searchable. The first response follows the runbook, which sends the reporter to re-index their workspace. That succeeds, and the document is still not searchable, because the re-index writes to the same wrong place.

4. ### 10:26 — Escalation, and the first real look

   {.when}
   39 minutes after the first report

   An on-call engineer compares document counts between `recall-v3` and the alias that queries actually resolve. The gap is 1.1 million documents. This is the moment the incident becomes understood, and it took one query that nobody had a reason to run.

5. ### 10:31 — Rollback

   The configuration change is reverted. The worker picks up the correct target on its next cycle with no restart and no intervention.

6. ### 10:57 — Caught up

   The queue is retained for 24 hours, so every change made during the outage was still on it. Backfill replays 1.1 million documents in 26 minutes. No customer had to do anything, and the re-indexes people ran during the outage turned out to be harmless.
:::

{.tick}
***

{.eyebrow}
The finding

## Why nobody saw it

::::columns{ratio="2:1"}
Every alarm on Recall watches the indexer: queue depth, worker error rate, commit latency, restart count, memory, lag between enqueue and commit. All eleven are process health, and all eleven were green, correctly, for the entire nine hours. The worker was doing exactly what it had been told to do, quickly and without error.

What we had no alarm for is the thing the system exists to provide: that a document written now is findable soon. That property does not live in any one process, which is why it did not occur to anyone to measure it — it is nobody's component.

The support runbook had the same shape. "Document not searchable" routed to re-indexing the workspace, which is the right first step when the index is behind and exactly the wrong one when the index is not the index. The runbook could not distinguish those two cases because it never asked which index it was talking to.

::col

:::card[The rule we are taking from this]{tone=info}
Alarm on the promise, not on the parts.

If a user-visible property cannot be stated as a measurement, it cannot be alarmed, and every component being healthy will be mistaken for the system being healthy.
:::
::::

:::figure[Contributing factors, and whether each one was necessary for the incident. Only the first was sufficient on its own; the rest are what turned a four-minute fix into nine hours.]
| Factor | Necessary | What it cost us |
|---|---|---|
| Config value valid in both environments | Yes | The whole incident. A staging-only value would have failed closed. |
| No freshness measurement | No | Eight and a half hours of detection time |
| Runbook assumed a lagging index | No | The first 39 minutes, and one misleading customer instruction |
| Improvement read as noise | No | Two review passes that could have caught it |
| Alias indirection undocumented | No | Roughly 20 minutes of the investigation |
:::

{.tick}
***

{.eyebrow}
What held

## The parts that worked

:::grid{cols=3}
- ### Queue retention

  Twenty-four hours of retention is why this was a stale-read incident and not a data-loss one. It was set to 24 hours in 2024 for an unrelated reason and nobody has touched it since.

- ### Rollback without restart

  The worker re-reads its configuration each cycle, so the fix took effect in thirty seconds with no deploy and no coordination.

- ### The escalation path

  Thirty-nine minutes from a support ticket to an engineer running the query that found it. The handoff worked; what was missing was a reason to run the query sooner.
:::

{.tick}
***

{.eyebrow}
Evidence

## What we looked at

:::tabs
### Document counts

```
$ recall-admin count --index recall-v3 --index recall-v3-live
recall-v3       1,104,882   updated 10:24:51Z
recall-v3-live  8,271,394   updated 01:14:06Z
```

The second timestamp is the deploy. Nothing had been written to the live index since.

### Query path

```
$ recall-admin resolve --alias search
search -> recall-v3-live

$ recall-admin resolve --alias ingest-target
ingest-target -> recall-v3
```

Two aliases, one of them unused by queries, and no check anywhere that they agreed.

### The change

```diff
  ingest:
-   target_index: recall-v3-staging
+   target_index: recall-v3
    batch_size: 500
    flush_interval: 30s
```
:::

{.tick}
***

{.eyebrow}
Actions

## What we are changing

:::steps
1. {#act-freshness .now}
   ### Alarm on freshness, not on the worker

   A canary document is written every minute and queried back through the same path a customer uses. The alarm is on the age of the newest result, with a five-minute threshold. This would have fired at 01:19.

   **Owner: Priya Raghunathan · Due 29 August · Done**

2. {.now}
   ### Make the two aliases agree, or fail

   Startup check: if `ingest-target` and `search` resolve to different indexes, the worker refuses to start. There is no legitimate configuration in which they differ.

   **Owner: Tobias Lindqvist · Due 5 September**

3. ### Teach the runbook to ask which index

   "Document not searchable" gets a first step that prints both aliases and the age of the newest document in each. Re-indexing moves to second, after that question has an answer.

   **Owner: Support engineering · Due 12 September**

4. ### Environment suffixes become mandatory

   Index names in configuration must carry an environment suffix, validated at load. A value that is meaningful in two environments is a value that will eventually be shipped to the wrong one.

   **Owner: Tobias Lindqvist · Due 30 September**
:::

> [!WARNING] The action we are not taking
> Several people asked for a rule that configuration changes cannot ship overnight. We are not adding one. The deploy worked correctly, the reviews were competent, and the time of day changed nothing about this incident except who was awake to read a dashboard that would have looked fine anyway.

> [!TIP]- Where the numbers come from
> Accounts affected is the count of accounts with at least one search during the window whose results could have differed, not the count of accounts that noticed. One customer reported it. The gap between 6,312 and 1 is itself worth sitting with: stale results look like correct results.

{.tick}
***

{.small .muted}
Ambercourt, Recall, INC-4417 and every name and number in this document are invented; it exists to show what a Markset document looks like at the length real writing runs to. Source: `examples/incident-review.md`, rendered with `examples/incident.css`.
