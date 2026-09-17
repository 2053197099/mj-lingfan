const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createContentContext() {
  const context = vm.createContext({
    chrome: { runtime: { getURL: (file) => file } },
    document: { getElementById: () => ({}) },
    crypto,
    console
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, "Object.assign(globalThis, { normalizeStoredQueue, buildTextTasks });\n})();"), context);
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
