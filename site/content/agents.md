---
markset: 0
theme:
  preset: technical
---

{.eyebrow}
Getting started

# Writing with agents

{.lead}
Agents draft most documents now, and they already write Markdown. Give them Markset's eight constructs and a checker,
and what they write is a page people want to read: still plain text, still easy to review, and checked before anyone
opens it.

## The loop

:::steps
1. **Point your agent at the guide.** It ships with the command line tool: the eight constructs, when each earns its
   place and when it does not, and the rules that keep a document portable.
2. **Ask for the document.** Say who it is for and what it has to do. The agent writes the content first, then gives a
   construct only to content that already has its shape.
3. **The agent checks its own work.** `markset check` names every problem with a code, and the guide tells the agent
   to fix them all before it hands the document over.
4. **You review the source and the page.** The source is Markdown, so the diff is the content. The preview shows the
   page as a reader will see it.
5. **Change what you would say differently.** Edit a line in VS Code or in the visual editor, without asking for the
   whole document again.
:::

## Set it up

Install the command line tool beside your project:

```sh
npm install --save-dev @markset-lang/cli
```

Then add one line to the file your agent reads, so it loads the guide before it writes:

:::tabs
### Claude Code
In `CLAUDE.md`:

```text
@node_modules/@markset-lang/cli/guide.md
```

### Other agents
In `AGENTS.md`:

```text
Before writing a Markset document, read node_modules/@markset-lang/cli/guide.md and follow it.
```

### Without installing
In the prompt:

```text
Read https://markset.org/guide.md and follow it.
```
:::

Installed, the guide stays in step with the version you run. `markset guide` prints it.

[[Read the guide](../guide/index.html)]{.button .primary} [[The markset command](../cli/index.html)]{.button}

## The same document, twice

An agent was given the guide and nothing else, and asked for a two-page review of an invented checkout rollout, for
engineering and product leaders. Its document checked clean on the first run. Then it wrote the same content as plain
Markdown, for comparison. Both are drawn by the same renderer with the same stylesheet: the only difference is the constructs.

### The headline numbers

::::columns{ratio="1:1"}
{.eyebrow}
Plain Markdown

| Metric | Value | Change |
|---|---|---|
| Checkout conversion | 3.4% | +0.3 pts |
| Revenue per visitor | $2.91 | +6% |
| Time to place order, p95 | 1.21 s | -34% |
| Payment error rate | 0.41% | -0.21 pts |

::col

{.eyebrow}
Markset

:::metrics
| Metric | Value | Change |
|---|---|---|
| Checkout conversion | 3.4% | +0.3 pts |
| Revenue per visitor | $2.91 | +6% |
:::

:::metrics{direction=inverse}
| Metric | Value | Change |
|---|---|---|
| Time to place order, p95 | 1.21 s | -34% |
| Payment error rate | 0.41% | -0.21 pts |
:::
::::

The agent split the numbers into two blocks because two of them improve by going down, and the guide says a block
has one direction.

### The trend behind them

::::columns{ratio="1:1"}
{.eyebrow}
Plain Markdown

| Week of | New checkout | Old checkout |
|---|---|---|
| 21 Jul | 3.29 | 3.12 |
| 4 Aug | 3.38 | 3.09 |
| 11 Aug | 3.21 | 3.11 |
| 25 Aug | 3.40 | 3.08 |
| 8 Sep | 3.39 | 3.11 |
| 22 Sep | 3.40 | 3.12 |

::col

{.eyebrow}
Markset

:::figure[Weekly checkout conversion (%), new flow against the old]{chart=line}
| Week of | New checkout | Old checkout |
|---|---|---|
| 21 Jul | 3.29 | 3.12 |
| 4 Aug | 3.38 | 3.09 |
| 11 Aug | 3.21 | 3.11 |
| 25 Aug | 3.40 | 3.08 |
| 8 Sep | 3.39 | 3.11 |
| 22 Sep | 3.40 | 3.12 |
:::
::::

The chart is added to the table, not swapped for it: a reader who wants the exact number still has it, and
anywhere Markset is not supported the table is all there is.

{.small .muted}
Every other week of the agent's ten, to fit a column. The full documents have them all.

[[Open the Markset version](rollout-review/index.html)]{.button .primary} [[Open the plain version](rollout-review-plain/index.html)]{.button}

### What it chose, and what it left out

- **One card**, for the summary at the top. No other section is wrapped in one.
- **A line chart**, because the trend is the argument: the lift held for ten weeks, and the one dip is the week of
  the incident.
- **Steps** for the six stages of the rollout, which happened in order.
- **One warning**, for the risk that is still live. The incident itself stays in paragraphs.
- **A grid** for the three options the readers have to choose between, with a badge on the recommended one.
- **No columns and no tabs.** Nothing in the content had their shape.

That restraint comes from the guide, which spends as long on when not to use a construct as on how to write one.
