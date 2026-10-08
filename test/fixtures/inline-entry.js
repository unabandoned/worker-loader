// The exact form CyberChef uses in src/web/waiters/*.mjs.
import ChefWorker from "worker-loader?inline=no-fallback!./worker.js";

globalThis.__createdWorker = new ChefWorker();
