Rollout review · Checkout Platform · October 2026

# One-page checkout: rollout review

The one-page checkout has served all web traffic since 8 September. It converts better, places orders faster and
fails less often than the four-step flow it replaced. One incident at the 50% stage cost us two weeks and showed
that our rollback is far slower than every rollout plan assumed. We need a decision on where the checkout team
spends the fourth quarter.

Prepared by the Checkout Platform team for engineering and product leadership, 4 October 2026.

## In short

- The redesign is a clear win: conversion is up 0.3 points, and the lift has held for ten weeks.
- One incident, on 13 August, failed 3,100 saved-card payments over 47 minutes.
- Turning the new checkout off took 20 minutes, not seconds. That is still true today.
- We ask for a decision between three options for Q4 by **17 October**. We recommend hardening first.

## What shipped

The new checkout replaces four pages (basket, delivery, payment, review) with one. Delivery and payment are edited
in place, the order total updates as the customer types, and saved addresses and cards are preselected. Behind the
page, checkout now calls a single orchestration service instead of five separate services from the browser, which is
where most of the latency gain comes from.

The four-step flow is still deployed, behind the `checkout.one_page` flag, and still served to a 2% holdback that
ended on 1 October.

## Results

Measured over the four weeks after full rollout (8 September to 5 October), against the four weeks before staff
testing began.

| Metric | Value | Change |
|---|---|---|
| Checkout conversion | 3.4% | +0.3 pts |
| Revenue per visitor | $2.91 | +6% |
| Time to place order, p95 | 1.21 s | -34% |
| Payment error rate | 0.41% | -0.21 pts |

The lift is not a novelty effect. The old flow ran beside the new one for the whole rollout, and the gap between
them held steady from the first week of the canary to the end of the holdback. The one dip is the week of the
incident.

Weekly checkout conversion (%), new flow against the old:

| Week of | New checkout | Old checkout |
|---|---|---|
| 21 Jul | 3.29 | 3.12 |
| 28 Jul | 3.35 | 3.10 |
| 4 Aug | 3.38 | 3.09 |
| 11 Aug | 3.21 | 3.11 |
| 18 Aug | 3.37 | 3.13 |
| 25 Aug | 3.40 | 3.08 |
| 1 Sep | 3.41 | 3.10 |
| 8 Sep | 3.39 | 3.11 |
| 15 Sep | 3.42 | 3.09 |
| 22 Sep | 3.40 | 3.12 |

Mobile web gained more than desktop (+0.4 points against +0.2), which bears on option C below.

## Rollout

1. **Staff testing, 7 to 18 July.** 1,900 real orders from staff. We fixed 23 defects, two of them in tax rounding.
2. **1% canary, 21 July.** Conversion ahead of the old flow from the first day. No alerts.
3. **10%, 28 July.** Latency held at 10x the load. Support contacts about checkout fell by a fifth.
4. **50%, 11 August.** The incident below, on 13 August. We went back to 10% the same afternoon.
5. **50% again, 25 August.** With the token fix and a new test against reissued cards.
6. **100%, 8 September.** A 2% holdback stayed on the old flow until 1 October.

## The incident

On 13 August at 14:06 UTC, payments with a saved card began failing for customers whose bank had reissued that card
since they saved it. The old flow refreshed the stored card token on its payment page. The new flow has no payment
page, and the refresh call went with it. Nothing in our tests used a reissued card.

The payment error rate on the new flow rose from 0.4% to 2.8%. An alert fired at 14:19, we decided to roll back at
14:31, and the flag was off at 14:33. Errors did not return to baseline until 14:53: checkout pods read flags through
a configuration cache that refreshes every 15 minutes, so the change reached the last pod twenty minutes after we
made it.

In all, 3,100 payment attempts failed for about 1,240 customers over 47 minutes. Six in ten retried and paid. We
estimate $96,000 in orders not recovered.

> **Warning: our rollback is not instant.** Every checkout flag change still takes up to 20 minutes to reach every
> pod, because of the configuration cache. Our rollout plans, runbooks and on-call training all assume seconds. Until
> the cache is fixed, treat any change to a checkout flag as a 20-minute operation.

What we have changed since: the token refresh moved into the orchestration service, a reissued-card case is in the
payment test suite, and an alert on payment errors by card age now fires within five minutes.

## Options for the fourth quarter

The checkout team has one quarter and can take on one of these.

- **A. Express wallets.** Apple Pay and Google Pay on product pages, skipping checkout. Projected +0.2 points of
  conversion. Needs the whole quarter.
- **B. Harden, then retire.** Flag changes that apply in seconds, then delete the four-step flow. No conversion gain,
  but it removes the incident's causes and 41,000 lines. Six weeks.
- **C. Bring it to the apps.** The one-page flow in iOS and Android, where 38% of orders are placed. Needs two
  mobile engineers for the quarter.

A has the largest projected gain, but it adds a second payment path while the first still depends on a rollback we
know to be slow. C is likely the larger prize over a year, since mobile web gained most, but it cannot start until
the mobile team finishes the app redesign in November.

## Decision needed

We ask leadership to approve **option B for the first six weeks of the quarter, followed by the start of option A**,
and to confirm by **17 October** so that the work can be planned before the sprint that starts on 20 October.

If the answer is A alone, we need a named owner for the configuration cache outside this team, because the risk
above does not go away by itself.
