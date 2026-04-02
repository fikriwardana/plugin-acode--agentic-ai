// Test file to verify AgenticAIPlugin in a Node.js mock environment
const assert = require('assert');
const { JSDOM } = require('jsdom');

// Setup mock DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Mock window.acode
let initCallback, unmountCallback;
global.window.acode = {
  setPluginInit: (id, callback) => {
    initCallback = callback;
  },
  setPluginUnmount: (id, callback) => {
    unmountCallback = callback;
  }
};

// Require the plugin
const AgenticAIPlugin = require('./main.js');

async function runTests() {
  console.log("Running local tests for Acode Agentic AI plugin...");

  // Since we require it, let's verify if the script populated initCallback and unmountCallback
  // However, the module system wrapper in Node wraps the code, but our if block uses `typeof window` which is true here.
  // Wait, let's just trigger it directly or check the exports.

  assert.ok(initCallback, "setPluginInit should be called when window.acode is available");
  assert.ok(unmountCallback, "setPluginUnmount should be called when window.acode is available");

  // Simulate plugin init
  const mockBaseUrl = "https://mock.url/plugin/agentic_ai";
  await initCallback(mockBaseUrl, {}, {});

  // Check if stylesheet was added
  const styleLink = document.getElementById("agentic_ai-styles");
  assert.ok(styleLink, "Stylesheet should be added to the DOM with the correct ID");
  assert.strictEqual(styleLink.href, mockBaseUrl + "/style.css", "Stylesheet href should use the correct baseUrl");

  // Simulate unmount
  unmountCallback();

  // Check if stylesheet was removed
  const styleLinkAfterUnmount = document.getElementById("agentic_ai-styles");
  assert.ok(!styleLinkAfterUnmount, "Stylesheet should be removed from the DOM after unmount");

  console.log("All tests passed!");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
