const test = require('node:test');
const assert = require('node:assert');
const AgenticAIPlugin = require('../main.js');

test('AgenticAIPlugin.generateCode', async (t) => {
  const plugin = new AgenticAIPlugin({}, {});

  await t.test('returns expected string for standard input', async () => {
    const result = await plugin.generateCode('test input');
    assert.strictEqual(result, 'Code generation feature coming soon...');
  });

  await t.test('returns expected string for null input', async () => {
    const result = await plugin.generateCode(null);
    assert.strictEqual(result, 'Code generation feature coming soon...');
  });

  await t.test('returns expected string for empty string input', async () => {
    const result = await plugin.generateCode('');
    assert.strictEqual(result, 'Code generation feature coming soon...');
  });

  await t.test('handles errors correctly', async () => {
    // Save original console.log and console.error
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;

    // Stub console.error to avoid noise in test output
    console.error = () => {};
    // Mock console.log to throw an error to trigger catch block in generateCode
    console.log = () => { throw new Error('Test error'); };

    try {
      const result = await plugin.generateCode('test input');
      assert.ok(result.startsWith('Error: '));
      assert.ok(result.includes('Test error'));
    } finally {
      // Revert console methods
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
    }
  });
});
