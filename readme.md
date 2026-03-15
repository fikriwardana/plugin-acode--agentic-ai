# Agentic AI ◈

**A multi-provider AI coding agent with supervised execution, purpose-built for the Acode editor.**

Agentic AI is more than just a chatbot; it is an autonomous coding assistant designed for the mobile development environment. By utilizing a "Plan-First" workflow, the agent analyzes your workspace, proposes a structured implementation path, and executes code changes under your direct supervision.

---

### ✨ Key Features

* **Multi-Provider Support:** Connect to your preferred AI models via Google Gemini, Zhipu GLM, or OpenRouter.
* **Supervised Execution:** Security is paramount. The agent provides proposal diffs, allowing you to approve, edit, or reject every change before it hits your file system.
* **Context-Aware Intelligence:** Automatically analyzes active files and related dependencies to ensure solutions stay synchronized with your existing codebase.
* **Step-by-Step Workflow:** Breaks down complex tasks (e.g., "Build an auth system") into manageable phases like Setup, Core, and UI for better verification.
* **Vibe Coding Interface:** A minimal, modern UI designed for high-focus development on mobile devices.

### 🚀 Getting Started

1.  **Installation:** Upload the plugin `.zip` to Acode or install it via the Acode Store.
2.  **Configuration:** Open the Agentic AI settings via the gear icon (⚙). Enter your API Key for your chosen provider (Gemini, OpenRouter, etc.).
3.  **Start Building:** Type your request in the input area, such as: *"Create a login page with JWT"* or *"Refactor this fetch function to be more modular"*.
4.  **Review & Execute:** Review the generated Implementation Plan, then choose to run all steps or execute them one by one.

### 🛠 Technical Configuration

Customize the agent's behavior through the settings panel:
* **Approval Mode:** Choose between `Step-by-Step` for total control or `Full Auto` for speed.
* **Max Context Files:** Define how many files the AI can reference simultaneously (Default: 8).
* **Backup Before Edit:** Automatically secures your original code before the AI performs any modifications.

---

### 📄 License
Distributed under the **MIT License**.

link plugin:https://acode.app/plugin/agentic_ai/description
---
*Developed with ❤️ for the mobile coding community by **Fikri Wardana***
