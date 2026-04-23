// Service worker: registers context menus and stages text for the reader tab.

const MENU_PAGE = "speedreader-page";
const MENU_SELECTION = "speedreader-selection";
const STAGED_KEY = "sr.staged";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_PAGE,
    title: "Speed read this page",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: MENU_SELECTION,
    title: "Speed read selection",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === MENU_SELECTION && info.selectionText) {
    await chrome.storage.local.set({
      [STAGED_KEY]: {
        mode: "text",
        title: tab.title ?? "Selection",
        text: info.selectionText,
        at: Date.now(),
      },
    });
  } else if (info.menuItemId === MENU_PAGE && tab.url) {
    await chrome.storage.local.set({
      [STAGED_KEY]: {
        mode: "url",
        title: tab.title ?? tab.url,
        url: tab.url,
        at: Date.now(),
      },
    });
  } else {
    return;
  }

  await chrome.tabs.create({
    url: chrome.runtime.getURL("src/reader/index.html"),
  });
});
