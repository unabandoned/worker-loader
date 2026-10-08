"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { compile, runBundle } = require("./helpers");

function assertNoErrors(stats) {
  assert.deepEqual(stats.compilation.errors, []);
  assert.deepEqual(stats.compilation.warnings, []);
}

test("inline=no-fallback, as CyberChef imports its workers", async () => {
  const { stats, files } = await compile("inline-entry.js", { rule: false });

  assertNoErrors(stats);
  // The worker is inlined into the bundle, not emitted beside it.
  assert.deepEqual(Object.keys(files), ["main.bundle.js"]);

  const bundle = files["main.bundle.js"];
  assert.doesNotMatch(bundle, /sourceMappingURL/);

  const { created, blobs } = runBundle(bundle);
  assert.equal(created.length, 1);
  assert.equal(created[0].ctor, "FakeWorker");
  assert.equal(created[0].url, "blob:fake/0");
  // The blob holds the worker's own compiled bundle, dependencies included.
  assert.match(blobs[0], /worker-dependency-marker/);
  assert.match(blobs[0], /self\.onmessage/);
});

test("default: the worker is emitted as its own file under the public path", async () => {
  const { stats, files } = await compile("entry.js");

  assertNoErrors(stats);
  assert.ok(files["worker.bundle.worker.js"], "worker chunk is emitted");
  assert.match(files["worker.bundle.worker.js"], /worker-dependency-marker/);

  const { created, blobs } = runBundle(files["main.bundle.js"]);
  assert.deepEqual(blobs, []);
  assert.equal(created.length, 1);
  assert.equal(created[0].url, "/public-path/worker.bundle.worker.js");
});

test("inline=fallback keeps the emitted file as the fallback", async () => {
  const { stats, files } = await compile("entry.js", {
    loaderOptions: { inline: "fallback" },
  });

  assertNoErrors(stats);
  assert.ok(files["worker.bundle.worker.js"]);
  assert.match(
    files["main.bundle.js"],
    /__webpack_require__\.p \+ "worker\.bundle\.worker\.js"/,
  );
  const { created } = runBundle(files["main.bundle.js"]);
  assert.equal(created[0].url, "blob:fake/0");
});

test("worker option picks the constructor and passes its options", async () => {
  const { stats, files } = await compile("entry.js", {
    loaderOptions: { worker: { type: "SharedWorker", options: { name: "chef" } } },
  });

  assertNoErrors(stats);
  const { created } = runBundle(files["main.bundle.js"]);
  assert.equal(created[0].ctor, "SharedWorker");
  assert.deepEqual({ ...created[0].options }, { name: "chef" });
});

test("filename and esModule options", async () => {
  const { stats, files } = await compile("entry.js", {
    loaderOptions: { filename: "[name].custom.js", esModule: false },
  });

  assertNoErrors(stats);
  assert.ok(files["worker.custom.js"]);
  assert.match(files["main.bundle.js"], /module\.exports = function Worker_fn/);
});

test("invalid options fail the build through webpack's schema validation", async () => {
  const { stats } = await compile("entry.js", {
    loaderOptions: { inline: "sometimes", unknown: true },
  });

  const messages = stats.compilation.errors.map((error) => error.message).join("\n");
  assert.match(messages, /Invalid options object/);
  assert.match(messages, /options\.inline should be one of these/);
  assert.match(messages, /has an unknown property 'unknown'/);
});
