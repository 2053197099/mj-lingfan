const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createContentContext() {
  let saved;
  const context = vm.createContext({
    chrome: {
      runtime: { getURL: (file) => file },
      storage: { local: {
        async get() { return { mjFlowState: saved || {} }; },
        async set(value) { saved = value.mjFlowState; }
      } }
    },
    document: { getElementById: () => ({}) },
    crypto,
    setTimeout,
    clearTimeout,
    console
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, "Object.assign(globalThis, { normalizeStoredQueue, buildTextTasks, buildSuffix, expandVariableCombinations, bindEvents, checkAutoDownloads, findSendButton, dispatchEnter, waitForComposerSubmission, setAspectRatio, saveState, clearLogs, startQueue, updateLivePanels, state, DEFAULT_SETTINGS, setTestShadow: (value) => { shadow = value; }, setTestRender: (value) => { render = value; } });\n})();"), context);
  context.savedState = () => saved;
  return context;
}

test("loading a queue keeps sent items and does not requeue an in-flight task", () => {
  const context = createContentContext();
  const queue = [
    { id: "sent", status: "sent" },
    { id: "sending", status: "sending" }
  ];
  context.queue = queue;
  const running = vm.runInContext("normalizeStoredQueue(queue, true)", context);
  assert.equal(running.length, 2);
  assert.equal(running[1].status, "sending");
  const stopped = vm.runInContext("normalizeStoredQueue(queue, false)", context);
  assert.equal(stopped[0].status, "sent");
  assert.equal(stopped[1].status, "failed");
});

test("reloading while a pause is waiting for the current send preserves that task", () => {
  const context = createContentContext();
  context.queue = [{ id: "current", status: "sending" }, { id: "orphan", status: "sending" }];
  const queue = vm.runInContext("normalizeStoredQueue(queue, false, 'current')", context);
  assert.equal(queue[0].status, "sending");
  assert.equal(queue[1].status, "failed");
});

test("clearing logs during a run persists without changing the queue or countdown", async () => {
  const context = createContentContext();
  context.state.running = true;
  context.state.queueRunnerId = "run";
  context.state.activeTaskId = "current";
  context.state.nextSendAt = Date.now() + 35000;
  context.state.queue = [{ id: "current", status: "sending", prompt: "portrait" }];
  context.state.logs = [{ message: "old log" }];
  context.state.status = "正在发送";
  await context.saveState({ writeQueue: true });
  const before = structuredClone(context.savedState());

  context.clearLogs();
  await new Promise((resolve) => setImmediate(resolve));
  const actual = context.savedState();
  assert.equal(actual.logs.length, 0);
  assert.deepEqual(actual.queue, before.queue);
  assert.equal(actual.activeTaskId, before.activeTaskId);
  assert.equal(actual.nextSendAt, before.nextSendAt);
  assert.equal(actual.running, true);
});

test("a paused active send cannot be restarted before its result is settled", async () => {
  const context = createContentContext();
  context.state.activeTaskId = "current";
  context.state.queue = [{ id: "next", status: "pending", prompt: "next prompt" }];
  await context.startQueue();
  assert.equal(context.state.running, false);
  assert.equal(context.state.activeTaskId, "current");
  assert.equal(context.savedState(), undefined);
});

test("a background startup failure unlocks start and preserves pending tasks", async () => {
  const context = createContentContext();
  context.setTestRender(() => {});
  context.chrome.runtime.sendMessage = (_message, callback) => callback({ ok: false, error: "没有找到 Midjourney 标签页" });
  context.state.queue = [{ id: "next", status: "pending", prompt: "next prompt" }];

  await context.startQueue();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(context.state.running, false);
  assert.equal(context.state.queueRunnerId, "");
  assert.equal(context.state.queue[0].status, "pending");
  assert.equal(context.savedState().running, false);
  assert.match(context.state.warning, /后台队列启动失败/);
});

test("live updates enable start and refresh queue buttons without replacing the active input", () => {
  const context = createContentContext();
  context.state.queue = [{ id: "current", mode: "text", status: "sent" }, { id: "other", status: "failed" }];
  const start = { disabled: true };
  const pause = { disabled: false };
  const retry = { disabled: true, textContent: "重试失败 0" };
  const clear = { disabled: true, textContent: "清理已完成 0" };
  const label = { textContent: "文生图 · 发送中" };
  const row = { dataset: { taskId: "current" }, querySelector: () => label };
  const controls = { start, pause, "retry-failed": retry, "clear-sent": clear };
  context.setTestShadow({ querySelectorAll: () => [row], querySelector(selector) {
    const action = selector.match(/data-action=['"]([^'"]+)/)?.[1];
    return controls[action] || null;
  } });

  context.updateLivePanels();
  assert.equal(start.disabled, false);
  assert.equal(pause.disabled, true);
  assert.equal(retry.disabled, false);
  assert.equal(retry.textContent, "重试失败 1");
  assert.equal(clear.disabled, false);
  assert.equal(clear.textContent, "清理已完成 1");
  assert.equal(label.textContent, "文生图 · 已发送");
});

test("repeating one prompt 100 times creates 100 base tasks", () => {
  const context = createContentContext();
  const tasks = vm.runInContext(
    "buildTextTasks({ prompts: ['1'], prefix: '', suffix: '', repeat: 100, limit: 500 })",
    context
  );
  assert.equal(tasks.length, 100);
});

test("aspect selection preserves queued tasks while idle, paused and running, and only affects new tasks", async () => {
  for (const mode of ["idle", "paused", "running"]) {
    const context = createContentContext();
    context.state.running = mode === "running";
    context.state.activeTaskId = mode === "paused" ? "sending" : "";
    context.state.queue = ["pending", "sending", "sent", "failed"].map((status) => ({
      id: status, status, prompt: "portrait --relax --ar 1:1", error: status === "failed" ? "原错误" : ""
    }));
    const original = structuredClone(context.state.queue);
    await context.saveState({ writeQueue: true });
    context.setTestShadow({ querySelectorAll: () => [] });

    context.setAspectRatio("3:4");
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(context.state.queue, original, mode);
    assert.deepEqual(context.savedState().queue, original, mode);
    assert.equal(context.savedState().settings.aspectRatio, "3:4");
    const tasks = context.buildTextTasks({ prompts: ["new portrait"], prefix: "", suffix: context.buildSuffix(""), repeat: 1 });
    assert.equal(tasks[0].prompt, "new portrait --relax --ar 3:4");
  }
});

test("changing aspect ratio cannot overwrite a recently settled paused task in storage", async () => {
  const context = createContentContext();
  context.state.activeTaskId = "current";
  context.state.queue = [{ id: "current", status: "sending", prompt: "portrait --ar 1:1" }];
  await context.saveState({ writeQueue: true });
  context.savedState().activeTaskId = "";
  context.savedState().queue = [{ id: "current", status: "sent", prompt: "portrait --ar 1:1" }];
  context.setTestShadow({ querySelectorAll: () => [] });

  context.setAspectRatio("21:9");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(context.savedState().queue[0].status, "sent");
  assert.equal(context.savedState().queue[0].prompt, "portrait --ar 1:1");
  assert.equal(context.savedState().activeTaskId, "");
  assert.equal(context.savedState().settings.aspectRatio, "21:9");
});

test("changing aspect ratio during a run leaves the active queue untouched", async () => {
  const context = createContentContext();
  context.state.running = true;
  context.state.queue = [{ status: "pending", prompt: "portrait --ar 1:1" }];
  context.setTestShadow({ querySelectorAll: () => [] });

  context.setAspectRatio("3:4");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(context.state.settings.aspectRatio, "3:4");
  assert.equal(context.state.queue[0].prompt, "portrait --ar 1:1");
});

test("fresh settings use a 35 to 50 second interval", () => {
  const context = createContentContext();
  assert.equal(context.DEFAULT_SETTINGS.sendIntervalMin, 35);
  assert.equal(context.DEFAULT_SETTINGS.sendIntervalMax, 50);
  assert.equal(context.state.settings.sendIntervalMin, 35);
  assert.equal(context.state.settings.sendIntervalMax, 50);
});

test("inline options preserve named variables for subsequent expansion", () => {
  const context = createContentContext();
  context.state.settings.variablesText = "place = forest | beach";
  const tasks = context.expandVariableCombinations("[color|red|blue] {place}");
  assert.deepEqual(Array.from(tasks), ["red forest", "red beach", "blue forest", "blue beach"]);
});

test("large variable combinations resolve every token within the queue limit", () => {
  const context = createContentContext();
  const options = Array.from({ length: 25 }, (_, i) => `a${i}`).join(" | ");
  context.state.settings.variablesText = `a = ${options}\nb = ${options}\nc = final`;
  const tasks = context.expandVariableCombinations("{a} {b} {c}");
  assert.equal(tasks.length, 500);
  assert.ok(tasks.every((item) => item.endsWith(" final")));
});

test("panel events attach to the replaceable panel and dragging uses its geometry", () => {
  const context = createContentContext();
  let drag;
  const panel = {
    addEventListener() {},
    getBoundingClientRect: () => ({ left: 10, top: 20 })
  };
  const host = {
    addEventListener() { assert.fail("Do not accumulate listeners on the persistent shadow root"); },
    querySelectorAll: () => [],
    querySelector: (selector) => selector === ".mj-flow-shell" ? panel : {
      addEventListener(_name, listener) { drag = listener; }
    }
  };
  context.bindEvents(host);
  drag({ target: { closest: () => null }, clientX: 30, clientY: 40, preventDefault() {} });
  assert.equal(context.state.dragOffset.x, 20);
  assert.equal(context.state.dragOffset.y, 20);
});

test("automatic downloads skip existing images and submit each new image once", async () => {
  const context = createContentContext();
  const image = (src) => ({ src, getBoundingClientRect: () => ({ width: 100, height: 100 }) });
  context.document.images = [image("https://example.test/existing.png")];
  const downloads = [];
  context.chrome.runtime.sendMessage = (message, callback) => {
    downloads.push(message.url);
    callback({ ok: true });
  };
  context.state.settings.autoDownload = true;
  await context.checkAutoDownloads();
  context.document.images.push(image("https://example.test/new.png"));
  await context.checkAutoDownloads();
  await context.checkAutoDownloads();
  assert.deepEqual(downloads, ["https://example.test/new.png"]);
});

test("a rejected download is not recorded as successfully submitted", async () => {
  const context = createContentContext();
  context.document.images = [];
  context.chrome.runtime.sendMessage = (_message, callback) => callback({ ok: false });
  context.state.settings.autoDownload = true;
  await context.checkAutoDownloads();
  context.document.images.push({ src: "https://example.test/new.png", getBoundingClientRect: () => ({ width: 100, height: 100 }) });
  await context.checkAutoDownloads();
  assert.equal(context.state.downloadedUrls.has("https://example.test/new.png"), false);
});

test("the settings button next to the composer is not a send button", () => {
  const context = createContentContext();
  context.window = { getComputedStyle: () => ({ display: "block", visibility: "visible" }) };
  const settings = {
    textContent: "Settings", title: "", getAttribute: () => null,
    getBoundingClientRect: () => ({ left: 300, right: 340, top: 10, bottom: 50, width: 40, height: 40 })
  };
  const target = { closest: () => null, parentElement: { querySelectorAll: () => [settings] } };
  assert.equal(context.findSendButton(target), null);
});

test("Enter submission uses one keydown with legacy key codes", () => {
  const context = createContentContext();
  context.KeyboardEvent = class { constructor(type, options) { Object.assign(this, { type }, options); } };
  const events = [];
  context.dispatchEnter({ dispatchEvent(event) { events.push(event); } });
  assert.deepEqual(events.map((event) => event.type), ["keydown", "keyup"]);
  assert.equal(events[0].key, "Enter");
  assert.equal(events[0].keyCode, 13);
  assert.equal(events[0].which, 13);
});

test("uncleared prompt is not reported as successfully submitted", async () => {
  const context = createContentContext();
  let clock = 0;
  context.Date = { now: () => (clock += 6000) };
  context.setTimeout = (callback) => { callback(); };
  await assert.rejects(context.waitForComposerSubmission({ isConnected: true, value: "still here" }, ""), /发送未确认/);
  clock = 0;
  await context.waitForComposerSubmission({ isConnected: true, value: "" }, "");
});
