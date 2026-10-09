# Release guide

The `version` in `extension/manifest.json` is the single source of truth. A release tag must be `v` followed by that exact version: for example, version `1.1.1` requires tag `v1.1.1`. The extension is distributed through GitHub Releases.

## Validate and package locally

Use Node.js 22 and Python 3.9 or later. No third-party dependencies are required. Run these commands from the repository root:

```sh
python3 -m unittest discover -s tests -v
node --test tests/*.test.mjs
for file in extension/background.js extension/pages/*.js extension/utils/*.js; do
  node --check "$file"
done
python3 scripts/package.py
```

The package script writes these files to `dist/`:

- `image-collector-<version>.zip`: the installation package for the manifest version.
- `image-collector.zip`: the same package with a fixed filename for the latest-download link.
- `SHA256SUMS.txt`: SHA-256 checksums for both ZIP files.

The ZIP contains `manifest.json` at its root, so users can extract it and load that folder directly. Only extension runtime files and the MIT license enter the package. Unexpected files or directories and symbolic links cause packaging to fail; regular `.DS_Store` files are skipped.

The runtime allowlist includes `utils/i18n.js`, `_locales/en/messages.json`, and `_locales/zh_CN/messages.json`. Packaging checks that `default_locale` names a bundled catalog, that the localized name, description, and action title reference valid messages, and that both catalogs contain nonempty translations for those metadata keys. Update the allowlist in `scripts/package.py` when adding runtime files.

Before releasing, load the unpacked extension and check the popup, collection list, parsing page, and context menu in English and Simplified Chinese. Check automatic language selection, manual choices persisting after reopening a page, and updates across open pages. Also verify that switching date display languages preserves local dates and Monday-based weeks. After reloading an updated extension at `chrome://extensions/`, refresh its open pages.

## Publish a new version

1. Update `extension/manifest.json` to a numeric version, such as `1.1.1`.
2. Complete local validation and commit all intended changes before tagging:

```sh
git add -A
git commit -m "发布 1.1.1 版本"
git tag -a v1.1.1 -m "v1.1.1"
git push origin main
git push origin v1.1.1
```

Replace the example version with the version being released. The commit message follows this repository's Chinese commit-message convention.

GitHub Actions validates the code, runs the package tests, and checks that the tag matches the manifest version. When all checks pass, it creates the release, generates release notes, and uploads the ZIP files and checksums. A personal access token is not required.

## Workflow triggers

| Trigger | Result |
| --- | --- |
| Push to `main` or open a pull request targeting `main` | Validate and create an Actions artifact without publishing a release. |
| Push a `v*` tag | Publish a release after validating the version match. |
| Run the workflow manually on a branch | Validate and create an artifact. |
| Run the workflow manually on a version tag | Publish or update the release for that tag. |

Artifacts are kept for 30 days. Rerunning an already published tag replaces its release attachments and retains existing release notes. Use a new tag for a new version.

Fixed latest-download link: [image-collector.zip](https://github.com/fangxiaoxingit/image-collection-chrome/releases/latest/download/image-collector.zip).
