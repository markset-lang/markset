---
markset: 0
title: Proof, Not Category
theme:
  preset: editorial
  accent: "#1b6b66"
  radius: none
---

{.eyebrow}
Strategy read · 14 September 2026

# Proof, Not Category

{.lead}
The Wayfinder strategy argues that we are *better*. The market described in Harbin's 2026 outlook is asking whether we *work*, and whether we cost less than the four things we replace. Here is where the roadmap answers that, and where it can't yet.

:::metrics{.sources}
| Field | Value |
|---|---|
| Read against | Harbin Group — Five Questions for Freight Technology 2026 |
| Corpus | 74 planning documents, `docs/strategy/` |
:::

:::card{.judgment}
{.eyebrow}
The judgment

{.claim-lead}
Our planning documents are written for a market that rewards capability differentiation. The Harbin piece describes a market that has stopped rewarding it.

The market analysis closes its risk list with: *"Carriers may not yet understand the value of lane-level variance tracking, deadhead detection, or dwell attribution. Market education is needed to create demand."* That instinct is backwards for 2026. The operations director Harbin quotes didn't say he misunderstood the category. He said adopting new dispatch software is a non-starter right now. You don't educate past that.

{.pull}
We either prove our way past it, or we arrive as a consolidation play that removes line items instead of adding one. Preferably both.
:::

{.eyebrow}
Where the corpus is silent

## Six things the market cares about that our planning docs never mention

Every count below is a full-text search across all 74 planning documents. These are not under-developed areas. They are absent ones.

:::figure[Case-insensitive search, `docs/strategy/`, 13 September 2026. Terms grouped where a concept has several common spellings.]{.coverage}
| Concept | Docs | Why it matters now |
|---|---:|---|
| Total cost of ownership | 0 | One of only two things Harbin says buyers now ask about before capability. |
| Pilot-to-production rate | 1 | The other one, and the single mention sits in a document that declares itself uncommitted. |
| Benchmark study, control group, holdout | 0 | The entire burden-of-proof question. No study design exists anywhere in the plan. |
| Outcome-based pricing | 0 | Named by Harbin as a survival adaptation. The stored telemetry now makes one feasible inside a quarter; nothing in the plan pursues it. |
| Owner-operator, brokerage, spot market | 0 | The interchange rule lands January 2027, two months before our general-availability date. |
| Offline or printed dispatch | 0 | Four states have enacted in-cab device restrictions. The only offline mentions are a printable driver summary and legacy fax history. |
:::

::::columns{ratio="1:9" .reading}
{.marker}
Q1

::col

## The telemetry is being written. It isn't evidence yet.

:::card{.claim}
{.eyebrow}
Harbin's question

Can freight tech clear the burden of proof? Buyers are consolidating vendors, new-logo growth is obstructed, and the companies that survive will be the ones that can demonstrate measurable savings.
:::

{.label}
### In the corpus

There is no efficacy strategy, and that is the visible gap. The data underneath is in better shape than the product documents suggest: since the `leg-history` spec, the engine appends a dated history point on every completed leg, logs nine kinds of dispatcher-readable event, and records every session's start, last ping and end. The roadmap documents still place this in Horizon 2; it is already shipping. What remains is the distance between *a history* and *evidence*, and three gaps define it.

{.facts}
- **Leg-level attempts are not stored.** A history point carries the running totals as they stood, not the route offered, the deviation taken, or the minutes that leg actually cost. Completed loads *are* stored, and the analytics series plans variance analysis on them. But re-planning mid-route is where most of the value is claimed, and it leaves no trace, so the platform's own promise that live dispatch feeds back into lane pricing has nothing to read.
- **The driver's tablet writes the record.** The server-side resolver validates every event and writes no history; the only server-written row is a swept `sessionInterrupted`. A series is as complete as the network that produced it, and coverage gaps are not random. They track exactly the rural lanes a savings claim is about.
- **Everything expires at 400 days, and the archive is last in line.** One contract year fits; a lane followed across a rate cycle or into a second year does not, and an expired row cannot be reconstructed from anything else the platform holds. The analytics lake is designed to become the system of record after expiry, but streaming history into it is the fifth of five phases, and the clock on the earliest rows is already running.

So an outcome-based contract bounded by one quarter is now feasible on what is stored. A durable-savings claim, a longitudinal study, or anything a procurement analyst would sign is not yet.

:::card{.change}
{.label}
### What I'd change

**Make the history evidence-grade, and name it in the roadmap.** Three concrete moves. Pull the history stream into the lake ahead of the rest of the analytics build, since it is independent of the warehouse work and the deadline is not a phase but a date: the expiry on the first rows written. Add a leg-attempt record beside the history point, so re-planning feeds lane pricing the way the product overview says it does. And make the write path server-authoritative, or at minimum publish a completeness measure so a study can report its own coverage. None of these is a redesign. All of them are cheaper now than after the first buyer asks for the study.

**Then use the asset we're underplaying.** Our quarterly lane benchmarks give us a before-and-after instrument that no AI-native entrant has. Benchmark, then managed dispatch, then next benchmark, with matched lanes at the same carrier, is a credible study design built on data we already collect. Most competitors would have to buy a benchmarking firm to run it. We need a statistician and a data model.

**Make it a Phase 1 success criterion:** one carrier, one lane group, one publishable before-and-after result. Today's criteria are all engineering criteria, and none of them would survive a procurement committee.
:::

### The credibility risk to close first

The live console now computes variance from stored history, which is real. But the demo screen still reads a hand-written label, and four views there treat it as a measurement. Deadhead is permanently `Elevated`. And the Lane Trend chart still works backwards from the current rate to generate the history it then plots a trend line through, while the real series sits beside it.

> {.quote}
> "The data this chart invents is now stored for real lanes. Nothing has been rewired to read it."
>
> {.src}
> `docs/strategy/03-engine/15-variance-status.md`

An operations director who finds a fabricated trend line doesn't file a bug. They end the evaluation and tell three peers. I'd make **"computed from real data or suppressed entirely"** a release gate. For the trend chart the fix is now a rewiring, not a data model. For the rest, suppressing a panel costs us a demo; a discovered one costs us the account.
::::

::::columns{ratio="1:9" .reading}
{.marker}
Q2

::col

## Utilization, and the restriction as an opening

:::card{.claim}
{.eyebrow}
Harbin's question

Will the in-cab device debate get to the point? Sixteen states introduced restriction bills and four enacted them. Two national carriers banned handheld interaction below highway speed; one declared a twelve-month freeze on new in-cab software. The regional study found savings, but primarily among *consistent* users.
:::

{.label}
### In the corpus

Consistency is the variable that separates the regional study's savings from the industry's flat adoption numbers. Every session's start, last ping and end are now on disk, and read by nothing. In the engine reference's own words, utilization is "unanswerable despite being on disk." The admin experience aggregates savings, not implementation fidelity.

:::card{.change}
### Utilization: measure the thing that predicts savings

Build the fidelity view over the session table that already exists. This is a reader, not a pipeline. Not "how many drivers are active" but **which terminals are clearing the usage threshold that predicts savings, and which aren't.** That one screen is simultaneously our efficacy engine, our churn early warning and our renewal argument. It also converts an awkward conversation, "your costs didn't move", into a defensible one: "these eleven terminals never hit utilization."
:::

:::card{.change}
### The freeze is a procurement unlock in disguise

I don't think the strategy realizes how strong our hand is here. Our lane library is a reviewed, quality-gated set of pre-computed routes with pre-generated explanations, which means **no live model output need ever reach a driver.** Everything delivered is human-approved before it ships.

Make that an explicit, switchable carrier policy: a reviewed-routes-only mode where the model operates entirely in the back office, on generation, curation and dispatcher analytics, and the in-cab surface is a vetted library. That is a direct, honest answer for a frozen carrier, and no assistant-native competitor can offer it. It turns the lane library from an internal supply story into a trust-and-compliance story, which is a far better thing to be selling this year.
:::
::::

::::columns{ratio="1:9" .reading}
{.marker}
Q3

::col

## Our best-aligned document is the one marked "not committed"

:::card{.claim}
{.eyebrow}
Harbin's question

Will we update the playbook to meet the moment? Only two commitments have achieved broad adoption: total cost of ownership as the first question asked, and a published pilot-to-production rate. The priorities that follow are hybrid connected and offline, human practice over product surface, and outcomes over inputs.
:::

### Pilot-to-production — promote the integration document

The single mention in the entire corpus sits in the carrier integration document, which opens by declaring itself "an exploration, not a committed capability. It has no spec and no design partner yet."

That document is the strongest strategic writing we have and it is in the wrong drawer. Its thesis, that dispatch vendors know the plan but never see the road while telematics vendors see the road but not the plan, *is* the update-the-playbook argument, arrived at independently. And the evidence it cites is the most persuasive outcome data anywhere in our documentation:

> {.quote}
> An independent study measured carriers using just-in-time re-planning completing **27% more loads per tractor** than those on fixed weekly plans, and **49% more** for carriers running mixed regional and long-haul fleets.
>
> {.src}
> `docs/strategy/04-integration/01-overview.md`

:::card{.change}
{.label}
### What I'd change

Commit it to Phase 2 and reframe the pitch. Not "import your lane plan" but **"we make the dispatch system you already bought actually work, per load."** Carriers have already spent the money on core systems; the unmet need is execution, not another core. Start with carriers on rated networks specifically, which is also precisely where our own competitive read identifies the incumbent's weakness.
:::

### Total cost of ownership — committed, and it needs its own model

Cost is a commitment, not an option. The work is therefore to design the model properly rather than to decide whether to have one, and the design problem is real, because today's engine is savings-shaped. Variance graphs, dependency chains and exception catalogs were all built around fuel, dwell and deadhead. Phase 3 currently carries "multi-cost expansion" as a single bullet, which hand-waves over the hardest modeling problem in the plan.

The useful finding is that cost doesn't resist our architecture uniformly. It splits into two strands that need different evidence models:

{.facts}
- **Direct operating cost fits the existing engine well.** Fuel, tolls, dwell and deadhead are genuinely additive and attributable, which is exactly what the variance graph represents. Exceptions are patterned and well documented, so the existing detector transfers with a new catalog rather than a new mechanism.
- **Capital and labor cost do not.** They are contract-dependent, not leg-dependent: the evidence attaches to an agreement and its terms, not to a measurable event. Modeling them as per-leg variance is the mistake to avoid, and it is the one a leg-derived engine will make by default.

:::card{.change}
{.label}
### What I'd change

Replace the Phase 3 bullet with a **named cost workstream carrying its own design**: a direct-cost strand modeled on the existing variance graph with an exception catalog, and a contract-cost strand whose evidence is agreement-anchored rather than leg-anchored.

**Lead with measurement.** The lane library is already contract-ready, since rate tables, accessorials and term sets are exactly the primitives a cost model needs and they are being built regardless. That lets the cost measurement layer ship while the attribution model is still being designed, which both de-risks the sequencing and puts a total-cost credential in front of buyers considerably earlier than a full build would.
:::

:::card{.change}
### Offline — the cheapest high-leverage item on this list

We will have structured stops, rate tables, quality gates and template-driven manifest assembly. Rendering a manifest to paper and capturing scanned exceptions is a modest add on top of work we are doing anyway, and it answers device restriction directly, opens the short-haul segment where handhelds are banned outright and the incumbent is strongest, and serves the non-connected half of a mixed fleet. Nor is it foreign to the company: part of our legacy exception data arrived by fax. The operational muscle exists; the product path does not.
:::

:::card{.change}
### Dispatchers — one artifact, not a dozen dashboards

The dispatcher experience defines more than a dozen views, a command center and an assistant. That is a product-centric answer to a human-capacity problem. Dispatchers under pressure don't adopt a tenth view; they adopt one artifact that saves them Sunday evening.

Cut hard toward a single deliverable, **tomorrow's board, the three loads at risk in each lane, the alternates already attached**, and treat the dashboards as the substrate that produces it rather than the product itself. This also feeds back into the first two questions: dispatcher-driven assignment is what produces consistent usage, and consistent usage is what produces the savings we need to prove.
:::
::::

::::columns{ratio="1:9" .reading}
{.marker}
Q4 · Q5

::col

## The channel we haven't priced

:::card{.claim}
{.eyebrow}
Harbin's questions

Do asset-based carriers start benefiting from the interchange rule, and will brokerages expand access or simply subsidize existing scale? Spot-market participation now reaches 15% of regional capacity and directs over four billion dollars into discretionary lane spend. The rule takes effect January 2027.
:::

{.label}
### In the corpus

Zero mentions of owner-operators, brokerages, the spot market or leased capacity. Meanwhile the rule lands two months before our Phase 2 general-availability date.

The architectural irony is that we are better positioned than the strategy is. Platform tenanting, module federation, roles held in a table rather than the token, and Lightweight Dispatch Mode, where "any dispatcher can select a lane and start a managed session in under 30 seconds", describe a product that could serve a 40-truck operator with no IT department. It is currently framed only as an enterprise upsell.

The honest constraint is the anchoring: carrier identifiers, telematics feeds, benchmark history, a pricing desk. A spot-market buyer has none of those.

:::card{.change}
{.label}
### What I'd change

Force an explicit decision rather than let it drift. Either scope non-enterprise out and record why, or fund one thin thing in Phase 2: **self-serve tenant onboarding with no telematics dependency, and an owner-facing savings report.**

The integrated platform vision already lists an owner value proposition, "see exactly what each truck earned and where it lost", with no product behind it. Spot-market money is per-operator discretionary spend, and what operators buy with it is visible evidence of margin. That happens to be the thing we are architecturally best at, sold to the one buyer who needs no educating about why variance matters.

And the analyst's warning applies if we go there. Spot participation skews toward scale; one state's small-operator share fell from half at launch to roughly a sixth. Our mixed-fleet data, and the 49% figure in particular, is the strongest access argument we hold. It belongs in that channel's positioning from day one, not retrofitted after someone asks.
:::
::::

::::columns{ratio="1:9" .reading}
{.marker}
All

::col

## Right roadmap, wrong story

{.label}
### In the corpus

Buyers are consolidating vendors. Our roadmap's center of gravity, where Phase 3 replaces the legacy planner and the lane library becomes the single unified source, is genuinely a consolidation play, and it is correct.

But the narrative around it is a *new category* narrative: "the only platform that", "no competitor occupies this space." In a year when buyers are cutting rather than adding, a new category reads as new risk and a new budget line. The same roadmap, told as displacement, reads as savings.

:::card{.change}
{.label}
### What I'd change

Re-cut the positioning around displacement math. Name the specific line items a carrier cancels, the separate benchmarking vendor, the separate planning tool, the separate rate service, the separate exception desk, and attach a dollar figure. That is the only pitch that survives the quote from the operations director.

And our best wedge is the one that isn't a new logo at all: the existing installed base. Phase 1 already targets it correctly. It just needs commercial and evidence success criteria alongside the engineering ones.
:::
::::

{.eyebrow}
The four changes that matter most

:::steps{.closing-steps}
1. ### Make the history evidence-grade

   Stream it into the lake before the first rows expire, add leg-attempt records, and make the write path server-authoritative. The series exists and the roadmap hasn't caught up to it. These are what turn it into something a study, or a contract, can rest on. This is the one I'd argue hardest for.

2. ### A cost model as a named workstream, measurement first

   Total cost of ownership is the sector's first question and we are committing to it. Direct operating cost fits the engine we have; contract cost needs an agreement-anchored evidence model. The lane library lets the measurement layer lead while that design is done.

3. ### Commit carrier integration as the pilot-to-production layer

   It is our sharpest strategic thinking, and it maps onto the other commitment the sector has actually made. It should not be sitting in an uncommitted exploration.

4. ### Ship reviewed-routes-only mode and an offline path

   Together they convert the device restrictions from a threat into the reason a frozen carrier can buy us when it can't buy anyone else.
:::

{.coda}
The through-line: most of what I'd change is about making the platform able to answer the question the market is actually asking. The history needed to answer it has started being written. The plan has not yet noticed, and the record is not yet one a buyer could hold us to.

{.colophon .small .muted}
A worked example for the Markset documentation. The company, the analyst, the corpus and every figure here are invented.\
Written in Markset and rendered by the reference implementation with a theme stylesheet.
