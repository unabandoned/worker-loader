const marker = require("./dep");

self.onmessage = (event) => {
  self.postMessage({ marker, echo: event.data });
};
