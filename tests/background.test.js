const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createRunner(initialState, { autoResponse = false } = {}) {
  let state = structuredClone(initialState);
  let sendCount = 0;
  let resolveSend;
  let sendStarted;
  const started = new Promise((resolve) => { sendStarted = resolve; });
  const chrome = {
    alarms: {
      onAlarm: { addListener() {} },
      create() {},
      clear() {}
    },
    runtime: { onMessage: { addListener() {} } },
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
  const context = vm.createContext({ chrome, crypto, setTimeout, clearTimeout, console });
  const source = fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8");
  vm.runInContext(source, context);
  return {
    context,
    started,
    resolveSend: (response) => resolveSend(response),
    getSendCount: () => sendCount,
    getState: () => structuredClone(state),
    setState: (next) => { state = structuredClone(next); }
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
