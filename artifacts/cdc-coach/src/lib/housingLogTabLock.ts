/**
 * Simple same-device single-active-tab coordination for the officer Housing
 * Log page. Not a distributed lock: one BroadcastChannel handshake decides
 * whether this tab is the one allowed to edit/autosave, and a second tab
 * opened later renders read-only instead of silently racing the first tab's
 * writes to IndexedDB (last-write-wins corruption).
 */

export type HousingLogTabStatus = "active" | "secondary" | "unsupported";

type Message =
  | { type: "announce"; tabId: string }
  | { type: "here"; tabId: string }
  | { type: "cleared" };

export type HousingLogTabLock = {
  tabId: string;
  getStatus: () => HousingLogTabStatus;
  subscribe: (listener: (status: HousingLogTabStatus) => void) => () => void;
  subscribeCleared: (listener: () => void) => () => void;
  /** Tell any other tab on this device that the local working log was cleared. */
  announceCleared: () => void;
  close: () => void;
};

const CHANNEL_NAME = "lockuphq-housing-log-tab-lock";
const CLAIM_WINDOW_MS = 200;

export function createHousingLogTabLock(): HousingLogTabLock {
  const tabId = crypto.randomUUID();
  const statusListeners = new Set<(status: HousingLogTabStatus) => void>();
  const clearedListeners = new Set<() => void>();
  let status: HousingLogTabStatus = "active";

  if (typeof BroadcastChannel === "undefined") {
    return {
      tabId,
      getStatus: () => "unsupported",
      subscribe: () => () => {},
      subscribeCleared: () => () => {},
      announceCleared: () => {},
      close: () => {},
    };
  }

  const notify = (next: HousingLogTabStatus) => {
    if (status === next) return;
    status = next;
    statusListeners.forEach((listener) => listener(status));
  };

  const channel = new BroadcastChannel(CHANNEL_NAME);
  // Whether this tab has already decided active vs secondary. Before that,
  // an incoming "announce" from another unsettled tab is tie-broken by
  // comparing tab ids so both sides independently reach the same verdict.
  let settled = false;

  channel.onmessage = (event: MessageEvent<Message>) => {
    const message = event.data;
    if (!message) return;
    if (message.type === "announce" && message.tabId !== tabId) {
      if (settled ? status === "active" : tabId < message.tabId) {
        channel.postMessage({ type: "here", tabId } satisfies Message);
        settled = true;
        notify("active");
      }
    } else if (message.type === "here" && message.tabId !== tabId) {
      settled = true;
      notify("secondary");
    } else if (message.type === "cleared") {
      clearedListeners.forEach((listener) => listener());
    }
  };

  channel.postMessage({ type: "announce", tabId } satisfies Message);
  const claimTimer = setTimeout(() => {
    if (!settled) {
      settled = true;
      notify("active");
    }
  }, CLAIM_WINDOW_MS);

  return {
    tabId,
    getStatus: () => status,
    subscribe: (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    subscribeCleared: (listener) => {
      clearedListeners.add(listener);
      return () => clearedListeners.delete(listener);
    },
    announceCleared: () =>
      channel.postMessage({ type: "cleared" } satisfies Message),
    close: () => {
      clearTimeout(claimTimer);
      channel.close();
    },
  };
}
