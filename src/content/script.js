import defaultSelectors from "../config/selectors.json";
import { initRatioYT } from "../core/index.js";
import { extensionPlatform } from "../platform/extension.js";

initRatioYT({
  platform: extensionPlatform,
  selectors: defaultSelectors,
});
