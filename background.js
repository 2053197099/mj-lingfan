const STORE_KEY = "mjFlowState";
const QUEUE_ALARM = "mj-flow-next-send";
const SEND_ACTION_TIMEOUT_MS = 60000;
const ACTIVE_TASK_TIMEOUT_MS = SEND_ACTION_TIMEOUT_MS + 30000;
const TRANSLATE_TIMEOUT_MS = 12000;
const queueRunners = new Map();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== QUEUE_ALARM) return;
  resumeScheduledQueue();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;

  if (message.type === "download-url") {
    chrome.downloads.download(
      {
        url: message.url,
        filename: message.filename || undefined,
        saveAs: Boolean(message.saveAs)
      },
      (downloadId) => {
        const error = chrome.runtime.lastError;
        sendResponse({
          ok: !error,
          downloadId,
          error: error ? error.message : undefined
        });
      }
    );
    return true;
  }

  if (message.type === "translate-prompts") {
    translatePrompts(message.lines)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "翻译失败" }));
    return true;
  }

  if (message.type === "start-queue-runner") {
    startQueueRunner(sender, message.runnerId)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "后台队列启动失败" }));
    return true;
  }

  if (message.type === "stop-queue-runner") {
    const tabId = sender?.tab?.id;
    if (tabId) queueRunners.delete(tabId);
    chrome.alarms.clear(QUEUE_ALARM);
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

async function startQueueRunner(sender, runnerId) {
  const tab = sender?.tab;
  if (!tab?.id || !tab.windowId) throw new Error("没有找到 Midjourney 标签页");
  const id = typeof runnerId === "string" && runnerId ? runnerId : crypto.randomUUID();
  if (queueRunners.get(tab.id) === id) return;
  queueRunners.set(tab.id, id);
  keepQueueTabAwake(tab.id);
  const state = await getStoredState();
  state.queueTabId = tab.id;
  state.queueRunnerId = id;
  state.activeTaskId = "";
  state.activeTaskStartedAt = 0;
  state.nextSendAt = 0;
  await setStoredState(state);
  processNextQueueTask(tab.id, id).finally(() => {
    if (queueRunners.get(tab.id) === id) queueRunners.delete(tab.id);
  });
}

async function resumeScheduledQueue() {
  const state = await getStoredState();
  if (!state.running || !state.queueRunnerId || !state.queueTabId) return;
  queueRunners.set(state.queueTabId, state.queueRunnerId);
  keepQueueTabAwake(state.queueTabId);
  processNextQueueTask(state.queueTabId, state.queueRunnerId).finally(() => {
    if (queueRunners.get(state.queueTabId) === state.queueRunnerId) queueRunners.delete(state.queueTabId);
  });
}

async function processNextQueueTask(tabId, runnerId) {
  const state = await getStoredState();
  if (!state.running || state.queueRunnerId !== runnerId) return;
  if (state.activeTaskId) {
    const startedAt = Number(state.activeTaskStartedAt) || 0;
    const expiresAt = startedAt + ACTIVE_TASK_TIMEOUT_MS;
    if (startedAt && Date.now() < expiresAt) {
      scheduleNextAlarm(expiresAt);
      return;
    }
    const lockedTask = state.queue.find((item) => item.id === state.activeTaskId);
    if (lockedTask && lockedTask.status === "sending") {
      lockedTask.status = "failed";
      lockedTask.error = "发送超时，已自动跳过。";
      addStoredLog(state, `发送超时，已跳过继续：${shorten(lockedTask.prompt)}`, "error");
    }
    state.activeTaskId = "";
    state.activeTaskStartedAt = 0;
    state.warning = "上一个任务发送超时，已跳过并继续执行后续任务。";
    await setStoredState(state);
  }
  if (state.nextSendAt && Date.now() < state.nextSendAt - 500) {
    scheduleNextAlarm(state.nextSendAt);
    return;
  }

  const taskIndex = state.queue.findIndex((task) => task.status === "pending");
  if (taskIndex < 0) {
    state.running = false;
    state.queueRunnerId = "";
    state.activeTaskId = "";
    state.activeTaskStartedAt = 0;
    state.queueTabId = 0;
    state.nextSendAt = 0;
    state.status = "队列已完成。";
    state.warning = "";
    addStoredLog(state, "当前排队任务数量为 0。", "success");
    await setStoredState(state);
    chrome.alarms.clear(QUEUE_ALARM);
    return;
  }

  const task = state.queue[taskIndex];
  state.activeTaskId = task.id;
  state.activeTaskStartedAt = Date.now();
  state.nextSendAt = 0;
  task.status = "sending";
  task.runnerId = runnerId;
  task.error = "";
  state.warning = "";
  state.status = `准备发送：${shorten(task.prompt)}`;
  addStoredLog(state, task.prompt, "user");
  addStoredLog(state, `准备发送：${shorten(task.prompt)}`, "info");
  await setStoredState(state);

  const response = await sendPromptToTab(tabId, task);

  const latest = await getStoredState();
  const latestTask = latest.queue.find((item) => item.id === task.id) || latest.queue[taskIndex];
  latest.activeTaskId = "";
  latest.activeTaskStartedAt = 0;
  if (latestTask) {
    if (response?.ok) {
      latestTask.status = "sent";
      latestTask.sentAt = Date.now();
      latestTask.error = "";
      latest.status = `已发送：${shorten(task.prompt)}`;
      latest.warning = "";
      addStoredLog(latest, `已发送：${shorten(task.prompt)}`, "success");
    } else {
      latestTask.status = "failed";
      latestTask.error = response?.error || "发送失败";
      latest.warning = `发送失败：${latestTask.error}，已跳过并继续执行后续任务。`;
      addStoredLog(latest, `发送失败，已跳过继续：${latestTask.error}`, "error");
    }
  }

  if (!latest.running || latest.queueRunnerId !== runnerId) {
    await setStoredState(latest);
    return;
  }
  if (!latest.queue.some((item) => item.status === "pending")) {
    latest.running = false;
    latest.queueRunnerId = "";
    latest.queueTabId = 0;
    latest.nextSendAt = 0;
    latest.status = "队列已完成。";
    latest.warning = "";
    addStoredLog(latest, "当前排队任务数量为 0。", "success");
    await setStoredState(latest);
    chrome.alarms.clear(QUEUE_ALARM);
    return;
  }

  const waitSeconds = randomSendIntervalSeconds(latest.settings);
  latest.nextSendAt = Date.now() + waitSeconds * 1000;
  latest.status = `发送间隔：${waitSeconds} 秒`;
  latest.warning = "";
  await setStoredState(latest);
  scheduleNextAlarm(latest.nextSendAt);
}

async function sendPromptToTab(tabId, task) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) {
    return { ok: false, error: "Midjourney 标签页已关闭。" };
  }
  if (tab.discarded) {
    return { ok: false, error: "Midjourney 标签页被浏览器休眠，请打开该页面后重试。" };
  }
  return withTimeout(
    chrome.tabs.sendMessage(tabId, { type: "perform-send-prompt", taskId: task.id, prompt: task.prompt }),
    SEND_ACTION_TIMEOUT_MS,
    "发送动作超时，请确认 Midjourney 页面可输入。"
  ).catch((error) => ({ ok: false, error: error.message || String(error) }));
}

function scheduleNextAlarm(timestamp) {
  chrome.alarms.create(QUEUE_ALARM, { when: Math.max(Date.now() + 1000, Number(timestamp) || Date.now() + 1000) });
}

function keepQueueTabAwake(tabId) {
  if (!tabId || !chrome.tabs?.update) return;
  chrome.tabs.update(tabId, { autoDiscardable: false }).catch(() => {
    // Some browsers or policies do not allow changing this flag. Queue sending
    // can still continue; this only reduces background tab discard risk.
  });
}

async function getStoredState() {
  const data = await chrome.storage.local.get(STORE_KEY);
  const state = data[STORE_KEY] || {};
  return {
    ...state,
    settings: state.settings || {},
    queue: Array.isArray(state.queue) ? state.queue : [],
    logs: Array.isArray(state.logs) ? state.logs : [],
    queueRunnerId: typeof state.queueRunnerId === "string" ? state.queueRunnerId : "",
    activeTaskId: typeof state.activeTaskId === "string" ? state.activeTaskId : "",
    activeTaskStartedAt: Number(state.activeTaskStartedAt) || 0,
    queueTabId: Number(state.queueTabId) || 0,
    nextSendAt: Number(state.nextSendAt) || 0,
    running: Boolean(state.running),
    status: typeof state.status === "string" ? state.status : "准备就绪",
    warning: typeof state.warning === "string" ? state.warning : ""
  };
}

async function setStoredState(state) {
  await chrome.storage.local.set({ [STORE_KEY]: state });
}

function addStoredLog(state, message, type = "info") {
  state.logs.push({ message, type, time: Date.now() });
  if (state.logs.length > 80) state.logs = state.logs.slice(-80);
}

function randomSendIntervalSeconds(settings = {}) {
  const min = Math.max(1, Number(settings.sendIntervalMin) || 10);
  const max = Math.max(1, Number(settings.sendIntervalMax) || 30);
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function shorten(value) {
  const text = String(value || "");
  return text.length > 72 ? `${text.slice(0, 72)}...` : text;
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function translatePrompts(lines) {
  const items = Array.isArray(lines) ? lines : [];
  const output = [];
  let failedCount = 0;
  for (const line of items) {
    const text = String(line || "");
    if (!text.trim()) {
      output.push(text);
      continue;
    }
    try {
      output.push(await translateLine(text));
    } catch (_) {
      failedCount += 1;
      output.push(text);
    }
  }
  return { lines: output, failedCount };
}

async function translateLine(text) {
  const chunks = splitForTranslation(text);
  if (chunks.length > 1) {
    const translated = [];
    for (const chunk of chunks) {
      translated.push(await translateLine(chunk));
    }
    return translated.join(" ");
  }
  const params = new URLSearchParams({
    q: text,
    langpair: "zh-CN|en"
  });
  const response = await fetchWithTimeout(`https://api.mymemory.translated.net/get?${params.toString()}`, TRANSLATE_TIMEOUT_MS);
  if (!response.ok) throw new Error(`翻译接口不可用：${response.status}`);
  const data = await response.json();
  const translated = data?.responseData?.translatedText;
  if (!translated) throw new Error("翻译接口没有返回结果");
  return String(translated).trim();
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function splitForTranslation(text) {
  const maxBytes = 460;
  if (new TextEncoder().encode(text).length <= maxBytes) return [text];
  const parts = String(text)
    .split(/([。！？；;，,])/)
    .reduce((items, part, index, source) => {
      if (index % 2 === 0) items.push(`${part}${source[index + 1] || ""}`.trim());
      return items;
    }, [])
    .filter(Boolean);
  const chunks = [];
  let current = "";
  for (const part of parts.length ? parts : [text]) {
    const next = [current, part].filter(Boolean).join(" ");
    if (new TextEncoder().encode(next).length <= maxBytes) {
      current = next;
    } else {
      if (current) chunks.push(current);
      current = part;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
