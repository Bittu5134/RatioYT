# RatioYT

A lightweight browser extension and userscript that brings like/dislike ratios back to YouTube video cards and filters out low-rated videos.

## Install

RatioYT is available as a browser extension or a userscript. Pick your platform:

- **Chrome:** [Chrome Web Store](https://chromewebstore.google.com/detail/ratioyt/ibdoandiabkbigbpjmlgpmndndnjnjkm)
- **Firefox:** [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/ratioyt/)
- **Brave:** [Chrome Web Store](https://chromewebstore.google.com/detail/ratioyt/ibdoandiabkbigbpjmlgpmndndnjnjkm)
- **Microsoft Edge:** [Chrome Web Store](https://chromewebstore.google.com/detail/ratioyt/ibdoandiabkbigbpjmlgpmndndnjnjkm)
- **Userscript (Tampermonkey / Violentmonkey):** [ratioyt.user.js](https://ratioyt.bittu.dev/ratioyt.user.js)

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

## Contact

- **Discord:** [bittu.dev/discord](https://bittu.dev/discord)
- **Email:** [hello@bittu.dev](mailto:hello@bittu.dev)
- **GitHub:** [Bittu5134/RatioYT](https://github.com/Bittu5134/RatioYT)
- **Patreon:** [LazyBittu](https://www.patreon.com/cw/LazyBittu)

## Support

If RatioYT is useful to you, you can support development on [Patreon](https://www.patreon.com/cw/LazyBittu).

## License

RatioYT is free software licensed under the [GPL-3.0](https://github.com/Bittu5134/RatioYT/blob/main/LICENSE) by [Bittu](https://bittu.dev)