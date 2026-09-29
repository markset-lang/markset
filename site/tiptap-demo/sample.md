{.lead}
Release notes for _Harbor_ 2.4, the version that works offline.

> [!TIP] Upgrading from 2.3
> Nothing to migrate. Run `harbor upgrade` and restart.

:::grid{cols=3}
* **Offline mode**, edits queue until you reconnect
* **Faster sync**, about twice as fast on large repositories
* **Smaller install**, down to 38 MB
:::

:::metrics{direction=inverse}
| Metric          | 2.4    | Change |
|-----------------|--------|--------|
| Sync, 10k files | 21 s   | -48%   |
| Install size    | 38 MB  | -22%   |
:::

:::tabs
### macOS
`brew upgrade harbor`

### Windows
`winget upgrade harbor`
:::
