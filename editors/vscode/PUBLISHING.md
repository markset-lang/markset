# Publishing the extension by hand

The extension goes to the Visual Studio Marketplace through its web interface, not from the command line. The command line route needs a personal access token from Azure DevOps, and that has not been obtainable. Nothing below needs a token. Everything is done signed in to the marketplace with the Microsoft account that owns the publisher.

The extension has its own version, separate from the npm packages: every upload needs a new one, and an extension fix should not force a release of eight unchanged packages. Bump it here, in `editors/vscode/package.json`, and nowhere else.

## Once: create the publisher

Do this the first time only. If the publisher exists, skip to the next section.

1. Open a private browser window, so a work account's single sign-on does not choose the account for you, and go to <https://marketplace.visualstudio.com/manage>.
2. Sign in with the Microsoft account the publisher should belong to. Whichever account creates the publisher owns it, and a token later must come from an owner too. If the wrong account creates it, do not delete and recreate: on the publisher page under **Members**, add the right account as an **Owner** (it must be a Microsoft account; any address can become one at <https://signup.live.com>), sign in as that account, and remove the first one once it has uploaded successfully. The publisher, its ID and the listing are unaffected. This happened on 2026-09-17, when the publisher was created under a work account and the personal account saw no publisher to update.
3. Choose **Create publisher**.
   - **ID:** `markset-lang`. It has to match `"publisher"` in `package.json` exactly, or the marketplace refuses the package.
   - **Name:** `Markset`.
   - **Description:** the text in `docs/publisher-description.md` in this directory, or the short form of it if the field truncates.
   - **Logo:** `.screenshots/markset-128.png`, or render it again from `site/icon.svg` at 128 by 128.
4. Save. The publisher page at `https://marketplace.visualstudio.com/manage/publishers/markset-lang` is where every later step happens.

Optional, once: **Verify** on that page asks for a DNS TXT record at `markset.org` and puts a check mark beside the publisher name.

## Every release

### 1. Decide the version

Patch for a fix, minor for a feature, following the extension's own history in `CHANGELOG.md`. The first release was `0.3.1`, matching the packages by coincidence, and nothing requires that to continue.

### 2. Update the two files that name it

- `editors/vscode/package.json`: the `"version"` field.
- `editors/vscode/CHANGELOG.md`: a new `## <version> — <date>` section at the top saying what changed, in the register of the entries already there. The marketplace shows this file on the listing's Changelog tab.

### 3. Run the gate

From the repository root:

```sh
npm test
npm run lint
```

Both must pass. The extension's tests build the bundle into a temporary directory and activate it against a stub host, so a bundle that would fail on load fails here first.

### 4. Package

```sh
npm run vscode:package
```

This builds `editors/vscode/dist/` from the sources and writes `editors/vscode/markset-vscode-<version>.vsix`. The last line of the output names the file and its size; it has been around 130 KB. If `vsce` complains about the icon, README, LICENSE or repository fields, fix the manifest rather than passing a flag to skip the check.

### 5. Install it locally and look

```sh
code --install-extension editors/vscode/markset-vscode-<version>.vsix
```

Reload the window, open `examples/architecture.md`, and check four things: the **Markset** item appears in the status bar, the built-in preview icon shows constructs rather than fence lines, `:::` at the start of a line offers completions, and a deliberate mistake such as `:::grdi` is underlined. Five minutes here is cheaper than a broken listing.

### 6. Upload

1. Go to `https://marketplace.visualstudio.com/manage/publishers/markset-lang`, in the same private window and account as before.
2. For the first release, choose **New extension**, then **Visual Studio Code**, and drop the `.vsix` onto the dialog. For every later release, find the extension in the list, open its **…** menu, choose **Update**, and drop the new `.vsix`.
3. The upload is verified before it is listed. This usually takes a few minutes; the row shows the status, and an email arrives if verification fails. The usual failure is a version that was already uploaded, which is step 2 above.
4. Open the public listing at `https://marketplace.visualstudio.com/items?itemName=markset-lang.markset-vscode` and read it as a stranger would: the README renders as the Overview tab, the changelog as its own tab, and the icon appears top left.

### 7. Record it

```sh
git add editors/vscode/package.json editors/vscode/CHANGELOG.md
git commit -m "Extension <version>"
git tag vscode-v<version>
git push origin main vscode-v<version>
```

The tag is what ties a marketplace version to a commit, which is the first thing you want when a user reports a problem with a version.

## What is not covered

- **Open VSX**, the registry Cursor, VSCodium and Gitpod read, has no web upload; publishing there needs an access token from <https://open-vsx.org> and `npx ovsx publish`. It can wait until the marketplace listing has settled.
- **Publishing from CI** needs the Azure DevOps token as a repository secret. When a token becomes obtainable, the change is a job in `release.yml` that runs `npx vsce publish --no-dependencies -p "$VSCE_PAT"` from this directory on a `vscode-v*` tag. Until then, the steps above are the release.
