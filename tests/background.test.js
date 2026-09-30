const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createRunner(initialState, { autoResponse = false } = {}) {
  let state = structuredClone(initialState);
  let sendCount = 0;
  let scheduledAlarm;
  let resolveSend;
  let messageListener;
  let sendStarted;
  const started = new Promise((resolve) => { sendStarted = resolve; });
  const chrome = {
    alarms: {
      onAlarm: { addListener() {} },
      create(name, options) { scheduledAlarm = { name, ...options }; },
      clear() { scheduledAlarm = undefined; }
    },
    runtime: { onMessage: { addListener(listener) { messageListener = listener; } } },
    storage: {
      local: {
        async get() { return { mjFlowState: structuredClone(state) }; },
        async set(value) { state = structuredClone(value.mjFlowState); }
      }
    },
    tabs: {
      async get() { return { id: 1, windowId: 1, discarded: false }; },
      async sendMessage() {
        sendCount += 1;
        if (autoResponse) return { ok: true };
        sendStarted();
        return new Promise((resolve) => { resolveSend = resolve; });
      }
    }
  };
  const context = vm.createContext({ chrome, crypto, setTimeout, clearTimeout, console, TextEncoder, URLSearchParams, AbortController });
  const source = fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8");
  vm.runInContext(source, context);
  return {
    context,
    started,
    resolveSend: (response) => resolveSend(response),
    getSendCount: () => sendCount,
    getScheduledAlarm: () => scheduledAlarm,
    getState: () => structuredClone(state),
    setState: (next) => { state = structuredClone(next); },
    sendControl: (message) => new Promise((resolve) => messageListener(message, { tab: { id: 1 } }, resolve))
  };
}

test("a stale send response cannot clear a newer run", async () => {
  const runner = createRunner({
    running: true,
    queueRunnerId: "old-run",
    queueTabId: 1,
    queue: [
      { id: "old-task", prompt: "old", status: "pending" },
      { id: "new-task", prompt: "new", status: "pending" }
    ],
    logs: []
  });
  const sending = vm.runInContext("processNextQueueTask(1, 'old-run')", runner.context);
  await runner.started;
  const next = runner.getState();
  next.queueRunnerId = "new-run";
  next.activeTaskId = "new-task";
  next.activeTaskStartedAt = Date.now();
  next.queue[1].status = "sending";
  runner.setState(next);
  runner.resolveSend({ ok: true });
  await sending;

  const actual = runner.getState();
  assert.equal(actual.queueRunnerId, "new-run");
  assert.equal(actual.activeTaskId, "new-task");
  assert.equal(actual.queue[1].status, "sending");
});

test("a removed task is not replaced by another task at the same index", async () => {
  const runner = createRunner({
    running: true,
    queueRunnerId: "run",
    queueTabId: 1,
    queue: [
      { id: "first", prompt: "first", status: "pending" },
      { id: "second", prompt: "second", status: "pending" }
    ],
    logs: []
  });
  const sending = vm.runInContext("processNextQueueTask(1, 'run')", runner.context);
  await runner.started;
  const next = runner.getState();
  next.queue.shift();
  next.activeTaskId = "";
  runner.setState(next);
  runner.resolveSend({ ok: true });
  await sending;

  assert.equal(runner.getState().queue[0].id, "second");
  assert.equal(runner.getState().queue[0].status, "pending");
});

test("pausing an in-flight send records its result without starting the next task", async () => {
  for (const response of [{ ok: true }, { ok: false, error: "发送按钮暂不可用" }]) {
    const runner = createRunner({
      running: true, queueRunnerId: "run", queueTabId: 1,
      queue: [
        { id: "first", prompt: "first", status: "pending" },
        { id: "second", prompt: "second", status: "pending" }
      ], logs: []
    });
    const sending = vm.runInContext("processNextQueueTask(1, 'run')", runner.context);
    await runner.started;
    const paused = runner.getState();
    paused.running = false;
    paused.nextSendAt = 0;
    runner.setState(paused);
    await runner.sendControl({ type: "stop-queue-runner" });
    assert.ok(runner.getScheduledAlarm()?.when > Date.now());
    runner.resolveSend(response);
    await sending;

    const actual = runner.getState();
    assert.equal(actual.queue[0].status, response.ok ? "sent" : "failed");
    assert.equal(actual.queue[1].status, "pending");
    assert.equal(actual.activeTaskId, "");
    assert.equal(actual.queueRunnerId, "");
    assert.equal(actual.running, false);
    assert.equal(runner.getSendCount(), 1);
    assert.equal(runner.getScheduledAlarm(), undefined);
  }
});

test("a paused send can recover from a missing response without sending remaining tasks", async () => {
  const runner = createRunner({
    running: false, queueRunnerId: "run", queueTabId: 1,
    activeTaskId: "first", activeTaskStartedAt: Date.now() - 100000,
    queue: [
      { id: "first", prompt: "first", status: "sending" },
      { id: "second", prompt: "second", status: "pending" }
    ], logs: []
  });
  await vm.runInContext("resumeScheduledQueue()", runner.context);
  await new Promise((resolve) => setImmediate(resolve));

  const actual = runner.getState();
  assert.equal(actual.queue[0].status, "failed");
  assert.equal(actual.queue[1].status, "pending");
  assert.equal(actual.activeTaskId, "");
  assert.equal(actual.running, false);
  assert.equal(runner.getSendCount(), 0);
});

test("a 100-item queue runs to completion without dropping tasks", async () => {
  const queue = Array.from({ length: 100 }, (_, index) => ({
    id: `task-${index}`,
    prompt: `prompt-${index}`,
    status: "pending"
  }));
  const runner = createRunner({
    running: true,
    queueRunnerId: "run",
    queueTabId: 1,
    queue,
    logs: [],
    settings: { sendIntervalMin: 10, sendIntervalMax: 10 }
  }, { autoResponse: true });

  for (let index = 0; index < queue.length; index += 1) {
    const state = runner.getState();
    state.nextSendAt = 0;
    runner.setState(state);
    await vm.runInContext("processNextQueueTask(1, 'run')", runner.context);
  }

  const actual = runner.getState();
  assert.equal(runner.getSendCount(), 100);
  assert.equal(actual.queue.length, 100);
  assert.equal(actual.queue.filter((task) => task.status === "sent").length, 100);
  assert.equal(actual.running, false);
});

test("missing interval settings fall back to 35 to 50 seconds", () => {
  const runner = createRunner({});
  for (let index = 0; index < 100; index += 1) {
    const seconds = vm.runInContext("randomSendIntervalSeconds()", runner.context);
    assert.ok(seconds >= 35 && seconds <= 50);
  }
});

test("translation service errors retain the original prompt", async () => {
  const runner = createRunner({});
  runner.context.fetch = async () => ({ ok: true, json: async () => ({
    responseStatus: 429, responseData: { translatedText: "Quota exceeded" }
  }) });
  const result = await vm.runInContext("translatePrompts(['原文'])", runner.context);
  assert.equal(result.failedCount, 1);
  assert.equal(result.lines[0], "原文");
});

test("long text without punctuation is split within the translation byte limit", () => {
  const runner = createRunner({});
  const chunks = vm.runInContext("splitForTranslation('中文😀'.repeat(150))", runner.context);
  assert.ok(chunks.every((chunk) => new TextEncoder().encode(chunk).length <= 460));
  assert.equal(chunks.join(""), "中文😀".repeat(150));
});

test("an in-flight send has a recovery alarm before the response arrives", async () => {
  const runner = createRunner({
    running: true, queueRunnerId: "run", queueTabId: 1,
    queue: [{ id: "task", prompt: "prompt", status: "pending" }], logs: []
  });
  const sending = vm.runInContext("processNextQueueTask(1, 'run')", runner.context);
  await runner.started;
  const alarm = runner.getScheduledAlarm();
  runner.resolveSend({ ok: true });
  await sending;
  assert.equal(alarm?.name, "mj-flow-next-send");
  assert.ok(alarm.when > Date.now());
});

test("translation timeout covers reading the response body", async () => {
  const runner = createRunner({});
  runner.context.fetch = async (_url, { signal }) => ({
    ok: true,
    json: () => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    })
  });
  await assert.rejects(vm.runInContext("fetchJsonWithTimeout('https://example.test', 10)", runner.context), /aborted/);
});
