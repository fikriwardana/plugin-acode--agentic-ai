/* ====================================================
 * AGENTIC AI - OPTIMIZED MULTI-PROVIDER GENT
 * ==================================================== */

class AgenticAIPlugin {
  constructor() {
    this.id = "agentic_ai";
    this.baseUrl = "";
  }

  async init() {
    console.log("Initializing Agentic AI Plugin...");
    this.loadStyles();
    this.setupSettings();
    this.setupCommands();
    return true;
  }

  setupSettings() {
    if (!acode || !acode.require) return;
    const settings = acode.require("settings");
    if (settings) {
      if (!settings.value[this.id]) {
        settings.value[this.id] = {
          provider: "OpenRouter",
          apiKey: ""
        };
        settings.update();
      }
    }
  }

  get settings() {
    if (!acode || !acode.require) return { provider: "OpenRouter", apiKey: "" };
    const settings = acode.require("settings");
    return settings.value[this.id] || { provider: "OpenRouter", apiKey: "" };
  }

  loadStyles() {
    const styleLink = document.createElement("link");
    styleLink.rel = "stylesheet";
    styleLink.href = this.baseUrl + "style.css";
    styleLink.id = "agentic-ai-style";
    document.head.appendChild(styleLink);
  }

  setupCommands() {
    if (!acode || !acode.addCommand) return;

    acode.addCommand({
      name: "agentic-ai:generate",
      description: "Agentic AI: Generate Code",
      exec: this.generateCode.bind(this),
    });

    acode.addCommand({
      name: "agentic-ai:explain",
      description: "Agentic AI: Explain Code",
      exec: this.explainCode.bind(this),
    });

    acode.addCommand({
      name: "agentic-ai:optimize",
      description: "Agentic AI: Optimize Code",
      exec: this.optimizeCode.bind(this),
    });
  }

  async callAI(promptText, apiKey, provider) {
    let url = "https://openrouter.ai/api/v1/chat/completions";
    let headers = {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    };

    // Default model if provider is OpenRouter, adjust as needed.
    let model = "google/gemini-2.5-flash";

    if (provider.toLowerCase() === "gemini") {
      url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      headers = { "Content-Type": "application/json" };
    }

    if (provider.toLowerCase() === "gemini") {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }]
        })
      });
      if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    } else {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: promptText }]
        })
      });
      if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
      const data = await response.json();
      return data.choices[0].message.content;
    }
  }

  async generateCode() {
    try {
      if (!acode || !acode.require) return;
      const editorManager = acode.require("editorManager");
      const editor = editorManager.editor;

      const prompt = acode.require("prompt");
      const userInput = await prompt("Describe the code to generate:");

      if (!userInput) return;

      const apiKey = this.settings.apiKey;
      const provider = this.settings.provider;
      if (!apiKey) {
        window.toast("Please set your API key in Agentic AI settings.", 3000);
        return;
      }

      window.toast("Agentic AI: Generating code...", 3000);

      const promptText = `You are an expert programmer. Write code based on the following request. Return ONLY the code, no markdown formatting blocks (\`\`\`), no explanations.\n\nRequest: ${userInput}`;
      let aiResponse = await this.callAI(promptText, apiKey, provider);

      // Clean up markdown code blocks if the AI still included them
      aiResponse = aiResponse.replace(/^```[a-z]*\n/gm, '').replace(/```$/g, '').trim();

      editor.insert(aiResponse);
      window.toast("Agentic AI: Code generated successfully!", 3000);

    } catch (error) {
      console.error("Error generating code:", error);
      if (window.toast) window.toast(`Agentic AI Error: ${error.message}`, 3000);
    }
  }

  async explainCode() {
    try {
      if (!acode || !acode.require) return;
      const editorManager = acode.require("editorManager");
      const editor = editorManager.editor;

      const selectedText = editor.getSelectedText();
      if (!selectedText) {
        window.toast("Agentic AI: Please select some code to explain.", 3000);
        return;
      }

      const apiKey = this.settings.apiKey;
      const provider = this.settings.provider;
      if (!apiKey) {
        window.toast("Please set your API key in Agentic AI settings.", 3000);
        return;
      }

      window.toast("Agentic AI: Explaining code...", 3000);

      const promptText = `You are an expert programmer. Explain the following code clearly and concisely.\n\nCode:\n${selectedText}`;
      const aiResponse = await this.callAI(promptText, apiKey, provider);

      const alert = acode.require("alert");
      await alert("Agentic AI: Explanation", aiResponse);

    } catch (error) {
      console.error("Error explaining code:", error);
      if (window.toast) window.toast(`Agentic AI Error: ${error.message}`, 3000);
    }
  }

  async optimizeCode() {
    try {
      if (!acode || !acode.require) return;
      const editorManager = acode.require("editorManager");
      const editor = editorManager.editor;

      const selectedText = editor.getSelectedText();
      if (!selectedText) {
        window.toast("Agentic AI: Please select some code to optimize.", 3000);
        return;
      }

      const apiKey = this.settings.apiKey;
      const provider = this.settings.provider;
      if (!apiKey) {
        window.toast("Please set your API key in Agentic AI settings.", 3000);
        return;
      }

      window.toast("Agentic AI: Optimizing code...", 3000);

      const promptText = `You are an expert programmer. Optimize the following code for better performance and readability. Return ONLY the optimized code, no markdown formatting blocks (\`\`\`), no explanations.\n\nCode:\n${selectedText}`;
      let aiResponse = await this.callAI(promptText, apiKey, provider);

      // Clean up markdown code blocks if the AI still included them
      aiResponse = aiResponse.replace(/^```[a-z]*\n/gm, '').replace(/```$/g, '').trim();

      editor.insert(aiResponse);
      window.toast("Agentic AI: Code optimized successfully!", 3000);

    } catch (error) {
      console.error("Error optimizing code:", error);
      if (window.toast) window.toast(`Agentic AI Error: ${error.message}`, 3000);
    }
  }

  async destroy() {
    console.log("Destroying Agentic AI Plugin...");
    const styleLink = document.getElementById("agentic-ai-style");
    if (styleLink) {
      styleLink.remove();
    }

    if (acode && acode.removeCommand) {
      acode.removeCommand("agentic-ai:generate");
      acode.removeCommand("agentic-ai:explain");
      acode.removeCommand("agentic-ai:optimize");
    }
  }
}

if (window.acode) {
  const acodePlugin = new AgenticAIPlugin();
  acode.setPluginInit("agentic_ai", async (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
    if (!baseUrl.endsWith('/')) {
      baseUrl += '/';
    }
    acodePlugin.baseUrl = baseUrl;
    await acodePlugin.init($page, cacheFile, cacheFileUrl);
  });
  acode.setPluginUnmount("agentic_ai", () => {
    acodePlugin.destroy();
  });
}
