"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const webpack = require("webpack");

const fixtures = path.join(__dirname, "fixtures");
const loaderPath = path.resolve(__dirname, "../src/index.js");

/**
 * Run a real webpack compile of a fixture entry and return the stats plus the
 * emitted files. `rule` adds a module rule that applies the loader to
 * worker.js; inline `worker-loader!` requests resolve through the alias.
 */
function compile(entry, { loaderOptions, rule = true, config = {} } = {}) {
  const outputPath = fs.mkdtempSync(path.join(os.tmpdir(), "worker-loader-"));
  const compiler = webpack({
    mode: "development",
    devtool: false,
    context: fixtures,
    entry: `./${entry}`,
    output: { path: outputPath, filename: "[name].bundle.js", publicPath: "/public-path/" },
    resolveLoader: { alias: { "worker-loader": loaderPath } },
    module: {
      rules: rule
        ? [{ test: /worker\.js$/, use: { loader: loaderPath, options: loaderOptions } }]
        : [],
    },
    ...config,
  });

  return new Promise((resolve, reject) => {
    compiler.run((error, stats) => {
      if (error) {
        reject(error);
        return;
      }

      compiler.close(() => {
        const files = Object.fromEntries(
          fs
            .readdirSync(outputPath)
            .map((name) => [name, fs.readFileSync(path.join(outputPath, name), "utf8")]),
        );
        fs.rmSync(outputPath, { recursive: true, force: true });
        resolve({ stats, files });
      });
    });
  });
}

/**
 * Execute a browser bundle in a VM with just enough of a worker-capable global
 * to record how the generated constructor builds the Worker.
 */
function runBundle(code) {
  const created = [];
  const blobs = [];

  class FakeWorker {
    constructor(url, options) {
      created.push({ ctor: this.constructor.name, url, options });
    }
  }
  class SharedWorker extends FakeWorker {}

  const sandbox = {
    Worker: FakeWorker,
    SharedWorker,
    Blob: class Blob {
      constructor(parts) {
        blobs.push(parts.join(""));
        this.id = blobs.length - 1;
      }
    },
    URL: {
      createObjectURL: (blob) => `blob:fake/${blob.id}`,
      revokeObjectURL() {},
    },
  };
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.runInNewContext(code, sandbox);

  return { created, blobs };
}

module.exports = { compile, runBundle };
