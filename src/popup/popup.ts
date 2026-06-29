// Popup controller.
// Reads and writes chrome.storage.local so the content script can check
// whether Comet is enabled without the popup needing to be open.

const KEY_ENABLED = "comet_enabled";

const toggleBtn = document.getElementById("toggle-enabled") as HTMLButtonElement;

// Initialise toggle from storage.
chrome.storage.local.get(KEY_ENABLED, (result) => {
  const enabled = result[KEY_ENABLED] !== false; // default: enabled
  setToggle(enabled);
});

toggleBtn.addEventListener("click", () => {
  const current = toggleBtn.getAttribute("aria-checked") === "true";
  const next = !current;
  setToggle(next);
  chrome.storage.local.set({ [KEY_ENABLED]: next });
});

function setToggle(enabled: boolean): void {
  toggleBtn.setAttribute("aria-checked", String(enabled));
}
