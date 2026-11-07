<div align="center">

# RatioYT

A lightweight browser extension and userscript that brings like/dislike ratios back to YouTube video cards and filters out low-rated videos.

[![Version](https://img.shields.io/github/package-json/v/Bittu5134/RatioYT?label=version&color=2EA44F)](https://github.com/Bittu5134/RatioYT/releases)
[![License](https://img.shields.io/github/license/Bittu5134/RatioYT?color=2EA44F)](https://github.com/Bittu5134/RatioYT/blob/main/LICENSE)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)

<br>

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-install-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/ratioyt/ibdoandiabkbigbpjmlgpmndndnjnjkm)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox%20Add--ons-install-FF7139?style=for-the-badge&logo=firefoxbrowser&logoColor=white)](https://addons.mozilla.org/en-US/firefox/addon/ratioyt/)
[![Userscript](https://img.shields.io/badge/Userscript-install-2EA44F?style=for-the-badge&logo=tampermonkey&logoColor=white)](https://ratioyt.bittu.dev/ratioyt.user.js)

</div>

## Install

RatioYT runs as a browser extension or a standalone userscript.

- **Chromium browsers:** Chrome, Edge, Brave and Opera install from the [Chrome Web Store](https://chromewebstore.google.com/detail/ratioyt/ibdoandiabkbigbpjmlgpmndndnjnjkm).
- **Firefox:** install from [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/ratioyt/).
- **Userscript:** install [ratioyt.user.js](https://ratioyt.bittu.dev/ratioyt.user.js) in Tampermonkey, Violentmonkey or Greasemonkey.

Source builds are available on [GitHub Releases](https://github.com/Bittu5134/RatioYT/releases).

## Features

- **Like/dislike ratios on cards:** Shown on Home, Search, Shorts, and sidebar recommendations.
- **Hide clickbait by score:** Videos scoring below your chosen threshold are replaced with empty placeholders.
- **Four rating formats:** Choose between Percentage (96%), 10-point (9.6/10), smileys (😊 😐 😞), or ★★★★★.
- **Filter Only Mode:** Keeps low-rated video filtering active while hiding the score badges from your feed.
- **Customizable colouring:** Badge colour shifts with the score, so low and high ratings stand out at a glance.
- **Lightweight:** Runs efficiently in the background without slowing down your browser.
- **Extension or Userscript:** Install as a standalone browser extension or run as a lightweight userscript with full settings support.

## Privacy

- **Zero telemetry:** RatioYT collects, stores, and transmits zero personal data, zero browsing history, and zero analytics.
- **Network requests:** The extension makes outbound requests to only two endpoints:
  1. The public [Return YouTube Dislike API](https://returnyoutubedislike.com), to query ratings by video ID.
  2. [ratioyt.bittu.dev/selectors.json](https://ratioyt.bittu.dev/selectors.json), to check for YouTube layout updates.
- **On-device storage:** Ratings are stored locally in your browser's IndexedDB for 7 days so repeat visits skip the network. User preferences stay in your browser's local storage.
- **Open source:** RatioYT is free software under GPL-3.0. Read the full [Privacy Policy](https://ratioyt.bittu.dev/privacy/) or inspect the source on [GitHub](https://github.com/Bittu5134/RatioYT).

## Support & Contact

<div align="center">

[![Patreon](https://img.shields.io/badge/Patreon-support-F96854?style=for-the-badge&logo=patreon&logoColor=white)](https://www.patreon.com/cw/LazyBittu)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://bittu.dev/discord)
[![Email](https://img.shields.io/badge/email-hello%40bittu.dev-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:hello@bittu.dev)
[![GitHub](https://img.shields.io/badge/GitHub-Bittu5134-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Bittu5134/RatioYT)

</div>

Bug reports and feature requests go to [GitHub Issues](https://github.com/Bittu5134/RatioYT/issues). If RatioYT is useful to you, you can support development on [Patreon](https://www.patreon.com/cw/LazyBittu).

## License

RatioYT is free software licensed under the [GPL-3.0](https://github.com/Bittu5134/RatioYT/blob/main/LICENSE) by [Bittu](https://bittu.dev)
