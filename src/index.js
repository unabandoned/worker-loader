"use strict";

const path = require("node:path");

const schema = require("./options.json");
const runAsChild = require("./runAsChild");
const {
  getDefaultFilename,
  getDefaultChunkFilename,
  getExternalsType,
} = require("./utils");

function loader() {}

function pitch(request) {
  this.cacheable(false);

  // webpack 5 validates the options against the schema itself.
  const options = this.getOptions(schema);

  // Use the plugins of the webpack instance that is running this loader, so
  // the child compiler can never be built from a second copy of webpack.
  const {
    EntryPlugin,
    ExternalsPlugin,
    node: { NodeTargetPlugin },
    web: { FetchCompileWasmPlugin, FetchCompileAsyncWasmPlugin },
    webworker: { WebWorkerTemplatePlugin },
  } = this._compiler.webpack;

  const compilerOptions = this._compiler.options || {};
  const filename = options.filename
    ? options.filename
    : getDefaultFilename(compilerOptions.output.filename);
  const chunkFilename = options.chunkFilename
    ? options.chunkFilename
    : getDefaultChunkFilename(compilerOptions.output.chunkFilename);
  const publicPath = options.publicPath
    ? options.publicPath
    : compilerOptions.output.publicPath;

  const workerContext = {
    request,
    options: {
      filename,
      chunkFilename,
      publicPath,
      globalObject: "self",
    },
  };

  workerContext.compiler = this._compilation.createChildCompiler(
    `worker-loader ${request}`,
    workerContext.options,
  );

  new WebWorkerTemplatePlugin().apply(workerContext.compiler);

  if (this.target !== "webworker" && this.target !== "web") {
    new NodeTargetPlugin().apply(workerContext.compiler);
  }

  new FetchCompileWasmPlugin({
    mangleImports: compilerOptions.optimization.mangleWasmImports,
  }).apply(workerContext.compiler);

  new FetchCompileAsyncWasmPlugin().apply(workerContext.compiler);

  if (compilerOptions.externals) {
    new ExternalsPlugin(
      getExternalsType(compilerOptions),
      compilerOptions.externals,
    ).apply(workerContext.compiler);
  }

  new EntryPlugin(
    this.context,
    `!!${request}`,
    path.parse(this.resourcePath).name,
  ).apply(workerContext.compiler);

  runAsChild(this, workerContext, options, this.async());
}

module.exports = loader;
module.exports.pitch = pitch;
