# Image Collector

English | [简体中文](README.zh-CN.md)

[Download the latest version](https://github.com/fangxiaoxingit/image-collection-chrome/releases/latest/download/image-collector.zip) · [Release history](https://github.com/fangxiaoxingit/image-collection-chrome/releases) · [Release guide](docs/RELEASING.md)

A Chrome extension for collecting, previewing, and downloading web images in batches. Collect a single image from the context menu, or parse a page and choose the images you want.

## Features

- **Image collection**: Collect from the context menu, parse the current tab, or enter a URL to parse.
- **Candidate selection**: View image dimensions and file sizes, then select images to add to your collection.
- **Image management**: Preview full-size images, move to the previous or next image, select all, and delete individual images or multiple images at once.
- **Date grouping**: Browse images by day, week, or month, with the most recently added images first.
- **Batch downloads**: Save images in year-month folders, with a customizable subfolder and download URL parameters.
- **Data backup**: Import and export JSON, with automatic deduplication by the complete URL.
- **Interface languages**: Use English or Simplified Chinese, automatically selected from browser preferences or chosen manually.

## Installation

1. Download `image-collector.zip` from the [latest release](https://github.com/fangxiaoxingit/image-collection-chrome/releases/latest) and extract it.
2. Open `chrome://extensions/` in Chrome's address bar.
3. Enable **Developer mode** in the upper-right corner, then click **Load unpacked**.
4. Select the extracted folder containing `manifest.json`. If installing from source, select the repository's `extension` folder.
5. Pin **Image Collector** to the toolbar from Chrome's extensions menu for easy access.

No dependencies or build commands are required. You can also refer to [Chrome's official loading instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world).

To update, extract the new version, reload the extension, and refresh any open extension pages. The extension is currently distributed through GitHub.

## Usage

### Interface language

The popup, collection list, and parsing page each have a language selector with **Use browser language**, **Simplified Chinese**, and **English**. Automatic mode is the default: it checks your browser's preferred languages in order and uses the first supported match. `zh` / `zh-*` selects Simplified Chinese, and `en` / `en-*` selects English. If none match, it uses English. If the browser does not provide a preferred-language list, it checks the browser's interface language instead.

The Chinese translation is **Simplified Chinese**; Traditional Chinese browser preferences also select this translation. A manual choice is saved in the current browser's local extension storage and updates open extension pages and the **Collect Image** context menu. Automatic mode checks again when a page is reopened or the browser languages change.

Switching languages updates interface text, the body of prompts, and date formatting. Dates still use the local time zone, and weeks still begin on Monday. Buttons in native alert / confirmation dialogs and error details returned by Chrome or the system use the browser's own language. Chrome selects the extension name, description, and toolbar hover title from its interface language and the extension's catalog fallback rules; a manual language choice inside the extension does not change this metadata. See [Chrome's internationalization documentation](https://developer.chrome.com/docs/extensions/reference/api/i18n#search-for-messages) for its fallback rules.

### Collect images

- **Single image**: Right-click an image on a web page and choose **Collect Image (收集图片)**.
- **Current page**: Click the extension icon → **Parse Page (解析页面)**. Select images on the candidate page, then click **Add Selected (添加已选)**.
- **Specific URL**: Enter a URL on the parsing page and click **Parse URL (解析网址)**, then select and add images. Parsing temporarily opens a background tab and closes it when finished.

### Manage and download

Click the extension icon → **Collection (收集列表)**. Select images to download or delete them in batches, or click an image to open a full-size preview. Use the left and right arrow keys to switch images, and press `Esc` to close the preview.

**Date grouping (日期排序)** at the top groups images by day by default. You can switch to weekly or monthly grouping, and the extension remembers your last selection. Dates use your browser's local time zone, and weeks begin on Monday. Both groups and images within each group are ordered with the most recently added first.

**Send Email (发送邮件)** opens your default email client with the selected image URLs in the message body; you send the email yourself. **Refresh (刷新)** reloads the locally stored list and settings.

### Download settings

Click **More Options (更多功能)** in the collection list:

| Setting | Description |
| --- | --- |
| Download Directory (下载目录) | Enter a subfolder relative to Chrome's default download directory, such as `image-collector`. Leave it blank to save images in year-month folders directly under the default download directory. |
| URL Parameters (URL 参数) | The default is `format=jpg&name=large`. If filled in, this setting replaces the download URL's entire existing query string. Leave it blank to preserve the original URL. |

Example save path:

```text
Default download directory/
└── image-collector/       # Optional custom subfolder
    └── YYYY-MM/
        └── Image file
```

**For ordinary image URLs or URLs with signed parameters, we recommend leaving URL Parameters (URL 参数) blank to avoid download failures caused by replacing the original parameters.** This setting only affects downloads; it does not change the original URLs in your collection.

Batch downloads save images as separate files and do not create a ZIP archive. The page reports how many download tasks were successfully started; check Chrome's download history for their final completion status. If Chrome prompts you to choose a save location, you can adjust the relevant settings at `chrome://settings/downloads`. See the [Chrome downloads API documentation](https://developer.chrome.com/docs/extensions/reference/api/downloads#type-DownloadOptions) for download path restrictions.

## Data and permissions

Collection records, parsing candidates, and settings are saved in the current browser's local extension storage and are not uploaded to a project server. Previews, file size checks, and downloads make requests to the original image hosts. Parsing a specific URL visits the corresponding page.

JSON exports include complete image URLs and download settings. You can restore them by importing the file through **More Options (更多功能)**. Before sharing an export, check whether any URLs contain private access parameters.

| Permission | Purpose |
| --- | --- |
| `contextMenus` | Provides the Collect Image (收集图片) context menu item. |
| `storage` | Saves collection records, parsing candidates, and settings. |
| `downloads` | Starts image downloads. |
| `tabs` | Retrieves page information and opens the collection page and temporary parsing tabs. |
| `scripting` | Runs the image extraction script on the target page. |
| `activeTab` | Temporarily grants access to the current tab when you click the extension. |
| `<all_urls>` | Allows parsing across different websites and requesting file sizes from the original image hosts. |

## Known limitations

- Page parsing only extracts HTTP(S) `<img>` elements present at the time of parsing, with both width and height at least 120px. It does not extract CSS backgrounds, Canvas content, or `data:` / `blob:` images, and it does not automatically scroll to load more content. You can scroll the page first, then use **Parse Page (解析页面)**.
- **Refresh Candidates (刷新候选)** only reloads the most recent parsing results. If the page content changes, parse it again.
- Context menu collection does not verify that the target is an image. Using it on a non-image area may save a page, link, or media URL.
- Deduplication compares complete URLs, not image content. Different URLs for the same image may still be saved separately.
- File sizes appear as **Unknown (未知)** when they cannot be retrieved. Expired URLs or access restrictions on the original host may prevent previews or downloads.

## Development

Built with vanilla JavaScript, HTML / CSS, and Manifest V3, with no framework or build step.

```text
extension/
├── manifest.json       # Extension configuration and permissions
├── background.js       # Context menu and single-image collection
├── _locales/
│   ├── en/messages.json    # English strings
│   └── zh_CN/messages.json # Simplified Chinese strings
├── assets/             # Icons
├── pages/
│   ├── popup.*         # Extension entry menu
│   ├── list.*          # Collection list, previews, and settings
│   └── parse.*         # Page parsing and candidate selection
└── utils/              # Local storage, downloads, and helper utilities
```

After editing the code, click **Reload** for the extension at `chrome://extensions/` and refresh any open extension pages. Use DevTools to debug page interactions; inspect background logs through the Service Worker debugging link in the extension's details.

Before submitting changes, we recommend checking context menu deduplication, page parsing, adding candidates, downloads, deletion, and JSON import / export, along with both interface languages, automatic selection, synchronization across pages, and saved language choices.

## Automated releases

When you push to `main` or submit a pull request, GitHub Actions automatically validates the project and generates installation packages. Pushing a `v*` tag that matches the version in `manifest.json` automatically publishes a release with a ZIP using a fixed filename, a versioned ZIP, and a SHA-256 checksum file.

To package locally, run `python3 scripts/package.py`. Output files are placed in `dist/`. See the [release guide](docs/RELEASING.md) for the full process and manual release options.

## License

This project is licensed under the [MIT License](LICENSE).
