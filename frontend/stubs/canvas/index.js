// Native node-canvas is intentionally not installed (see package.json description).
// To compile new MindAR image targets, use the MindAR web compiler or install `canvas` locally.
module.exports = new Proxy({}, {
  get() {
    throw new Error("node-canvas is stubbed in this project; the browser AR runtime does not need it.");
  },
});
