// Content script entry point.
// Keep this file minimal — it is the single entry the manifest points to.
import { enableCursor, disableCursor } from "./cursor.js";

// Must match the key written by the popup.
const KEY_ENABLED = "comet_enabled";

function apply(enabled: boolean): void {
  if (enabled) enableCursor();
  else disableCursor();
}

chrome.storage.local.get(KEY_ENABLED, (result) => {
  apply(result[KEY_ENABLED] !== false); // default: enabled
});

chrome.storage.onChanged.addListener((changes, area) => {
  const change = changes[KEY_ENABLED];
  if (area === "local" && change !== undefined) apply(change.newValue !== false);
});
