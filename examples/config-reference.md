---
markset: 0
title: Halyard configuration reference
theme:
  preset: technical
  accent: "#1f6f5c"
  density: compact
  radius: sm
---

{.eyebrow}
Reference · Halyard 3.4

# Configuration

{.lead}
Every key Halyard reads, where it reads it from, and what happens when two sources disagree. Halyard runs without a configuration file at all; everything below has a default, and this page is the list of defaults you can change.

[Halyard 3.4]{.badge} [Stable]{.badge .success} [Supersedes 3.2]{.badge .warn}

> [!NOTE]
> **Every key is optional.** A missing key takes its default, and an unknown key is an error rather than a warning, so a typo fails at startup instead of being silently ignored for six weeks.

{.tick}
***

{.eyebrow}
Resolution

## Where configuration comes from

Four sources, read in order. Later sources win key by key, not file by file: setting one key on the command line does not discard the file.

:::steps
1. ### Built-in defaults

   Every key in this document has one. Halyard with no configuration and no flags is a valid, running Halyard.

2. ### The configuration file

   `halyard.toml` in the working directory, or the path given to `--config`. If `--config` names a file that does not exist, that is an error; a missing `halyard.toml` is not.

3. ### Environment variables

   `HALYARD_` followed by the key path in upper snake case: `queue.max_retries` is `HALYARD_QUEUE_MAX_RETRIES`. Useful where a file is awkward, such as a container image you do not control.

4. ### Command-line flags

   `--queue-max-retries=5`. Highest precedence, and the only source that cannot be set for a whole fleet at once, which is the point.
:::

:::card[Seeing what actually applied]{tone=info}
```sh
halyard config --explain queue.max_retries
```
```
queue.max_retries = 5
  default         3
  halyard.toml    4      line 12
  environment     —
  flag            5      --queue-max-retries
```
Every key, every source that set it, and which one won. Run this before opening a support ticket.
:::

{.tick}
***

{.eyebrow}
Keys

## Server

:::figure[The `[server]` table. Addresses accept a host and port, a bare port, or a Unix socket path prefixed with `unix:`.]
| Key | Type | Default | Meaning |
|---|---|---|---|
| `listen` | address | `127.0.0.1:8080` | Where the HTTP API binds. Set to `0.0.0.0:8080` to accept external traffic. |
| `admin_listen` | address | unset | A second bind for the admin API. Unset means the admin API is served on `listen` under `/admin`. |
| `shutdown_grace` | duration | `30s` | How long in-flight jobs have after a `SIGTERM` before they are cancelled. |
| `max_body` | size | `4MiB` | Largest accepted request body. A job payload above this is rejected at submission rather than at execution. |
| `trusted_proxies` | list of CIDRs | empty | Which proxies may set `X-Forwarded-For`. Empty means the header is ignored entirely. |
:::

> [!WARNING] `shutdown_grace` and your orchestrator must agree
> If your platform's termination grace period is shorter than `shutdown_grace`, the process is killed mid-job and the grace setting has no effect at all. Set the platform's value higher than Halyard's, not the other way round.

## Queue

:::figure[The `[queue]` table. Retry delays are computed as `retry_base * 2^attempt`, capped at `retry_max_delay`.]
| Key | Type | Default | Meaning |
|---|---|---|---|
| `max_retries` | integer | `3` | Attempts after the first failure. `0` disables retrying. |
| `retry_base` | duration | `1s` | First retry delay, doubling thereafter. |
| `retry_max_delay` | duration | `5m` | Ceiling for the doubling. |
| `visibility_timeout` | duration | `5m` | How long a claimed job is hidden from other workers. A job that takes longer is claimed twice. |
| `dead_letter` | string | `dead` | Queue that exhausted jobs move to. Set to `""` to drop them, which is rarely what you want. |
| `max_depth` | integer | `0` | Submissions are rejected above this depth. `0` means unbounded. |
:::

:::card[The one that bites]{tone=warn}
`visibility_timeout` is the single most common cause of duplicate execution. It must exceed the longest run time of any job in the queue, including the slow tail — not the average, and not the timeout you wish your jobs had.

If you cannot bound the tail, have the job extend its own claim with `halyard.heartbeat()` instead of raising this globally.
:::

## Storage

::::columns{ratio="1:1"}
:::figure[The `[storage]` table.]
| Key | Type | Default |
|---|---|---|
| `backend` | `sqlite` `postgres` | `sqlite` |
| `url` | string | `file:halyard.db` |
| `pool_size` | integer | `10` |
| `statement_timeout` | duration | `30s` |
:::

::col

:::card[Choosing a backend]
`sqlite` is the default because it makes the first run work with no setup, and it is genuinely fine for a single node up to a few hundred jobs a minute.

`postgres` is required for more than one Halyard process. Two processes against one SQLite file will corrupt it, and Halyard cannot detect that you have done it.
:::
::::

## Observability

:::figure[The `[observability]` table. Halyard emits no telemetry unless a key here is set.]
| Key | Type | Default | Meaning |
|---|---|---|---|
| `log_level` | `error` `warn` `info` `debug` | `info` | `debug` logs every state transition and is very loud. |
| `log_format` | `text` `json` | `text` | `json` when something is collecting it. |
| `metrics_listen` | address | unset | Prometheus endpoint. Unset means no metrics server. |
| `trace_endpoint` | URL | unset | OTLP collector. Unset means no tracing. |
| `trace_sample` | float 0–1 | `0.05` | Ignored when `trace_endpoint` is unset. |
:::

{.tick}
***

{.eyebrow}
Formats

## The same configuration, four ways

:::tabs
### halyard.toml

```toml
[server]
listen = "0.0.0.0:8080"
shutdown_grace = "45s"

[queue]
max_retries = 5
visibility_timeout = "15m"

[storage]
backend = "postgres"
url = "postgres://halyard@db/halyard"
```

### Environment

```sh
HALYARD_SERVER_LISTEN=0.0.0.0:8080
HALYARD_SERVER_SHUTDOWN_GRACE=45s
HALYARD_QUEUE_MAX_RETRIES=5
HALYARD_QUEUE_VISIBILITY_TIMEOUT=15m
HALYARD_STORAGE_BACKEND=postgres
HALYARD_STORAGE_URL=postgres://halyard@db/halyard
```

### Flags

```sh
halyard serve \
  --server-listen=0.0.0.0:8080 \
  --server-shutdown-grace=45s \
  --queue-max-retries=5 \
  --queue-visibility-timeout=15m \
  --storage-backend=postgres \
  --storage-url=postgres://halyard@db/halyard
```

### Checking it

```sh
halyard config --check
halyard config --dump          # every key, including defaults
halyard config --dump --changed-only
```
:::

{.tick}
***

{.eyebrow}
Types

## How values are written

:::figure[The four value types that are not strings, numbers or booleans. All four are accepted in every source, including environment variables, where they are written exactly as they would be in the file.]
| Type | Accepted | Rejected |
|---|---|---|
| duration | `30s` `5m` `2h` `1h30m` | `30` (no unit), `0.5h` |
| size | `4MiB` `512KiB` `2GiB` `1048576` | `4MB` (decimal prefixes are not accepted) |
| address | `127.0.0.1:8080` `:8080` `unix:/run/halyard.sock` | `localhost` (no port) |
| list | `["10.0.0.0/8", "192.168.0.0/16"]`, or comma-separated in the environment | a bare unquoted value containing a comma |
:::

{.small .muted}
Durations and sizes are parsed the same way everywhere, including in job payloads. A unit is always required, because `timeout = 30` has meant seconds in one tool and milliseconds in the next often enough to be worth one extra character.

{.tick}
***

{.eyebrow}
Changes

## Deprecated and removed

:::figure[Keys that changed in 3.x. A deprecated key still works and logs a warning at startup; a removed key is a startup error naming its replacement.]
| Key | Status | Since | Replacement |
|---|---|---|---|
| `queue.retry_delay` | Removed | 3.0 | `queue.retry_base`, which doubles rather than repeating |
| `server.bind` | Removed | 3.0 | `server.listen` |
| `storage.dsn` | Deprecated | 3.2 | `storage.url` |
| `observability.statsd` | Removed | 3.3 | `observability.metrics_listen`, Prometheus rather than StatsD |
| `queue.parallelism` | Deprecated | 3.4 | Set worker count per worker, not per queue |
:::

> [!CAUTION]- Upgrading from 2.x
> 2.x configuration is not read by 3.x. The `[worker]` table was split into `[queue]` and per-worker configuration, and there is no automatic migration because the split needs a decision this tool cannot make for you: whether a setting was about the queue's policy or about one machine's capacity.
>
> ```sh
> halyard config --migrate-from-2x old.toml > halyard.toml
> ```
>
> The migration tool writes what it can and leaves a comment at every place it could not decide. Read the output; do not pipe it straight into production.

{.tick}
***

{.small .muted}
Halyard is invented, as is every key, default and version number on this page. It exists as a Markset example of reference documentation — the genre that is mostly tables and code — and it is the one long example that names no theme of its own, so it is read here on the site's stylesheet exactly as the site's other pages are. Source: `examples/config-reference.md`.
