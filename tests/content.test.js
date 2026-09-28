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
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, "Object.assign(globalThis, { normalizeStoredQueue, buildTextTasks, expandVariableCombinations, bindEvents, checkAutoDownloads, findSendButton, dispatchEnter, waitForComposerSubmission, setAspectRatio, state, DEFAULT_SETTINGS, setTestShadow: (value) => { shadow = value; } });\n})();"), context);
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

test("repeating one prompt 100 times creates 100 base tasks", () => {
  const context = createContentContext();
  const tasks = vm.runInContext(
    "buildTextTasks({ prompts: ['1'], prefix: '', suffix: '', repeat: 100, limit: 500 })",
    context
  );
  assert.equal(tasks.length, 100);
});

test("changing aspect ratio updates queued pending prompts but not sent or sending tasks", async () => {
  const context = createContentContext();
  const pending = { id: "pending", status: "pending", prompt: "portrait --relax --ar 1:1" };
  const sending = { id: "sending", status: "sending", prompt: "portrait --relax --ar 1:1" };
  const sent = { id: "sent", status: "sent", prompt: "portrait --relax --ar 1:1" };
  context.state.queue = [pending, sending, sent];
  context.setTestShadow({ querySelectorAll: () => [] });

  context.setAspectRatio("3:4");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(context.state.queue[0].prompt, "portrait --relax --ar 3:4");
  assert.equal(context.state.queue[1].prompt, "portrait --relax --ar 1:1");
  assert.equal(context.state.queue[2].prompt, "portrait --relax --ar 1:1");
  assert.equal(context.savedState().queue[0].prompt, "portrait --relax --ar 3:4");
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
