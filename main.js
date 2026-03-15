// ==========================================
// AGENTIC AI - MULTI-PROVIDER CODING AGENT
// ==========================================

// ==========================================
// PROVIDER CONFIGURATIONS
// ==========================================

const PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    models: ['gemini-2.0-flash', 'gemini-2.0-pro-exp', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    defaultModel: 'gemini-2.0-flash',
    supportsStreaming: true,
    maxTokens: 8192,
    // Gemini gratis: 15 RPM, 1500 req/hari untuk 1.5 flash
  },
  
  glm: {
    name: 'Zhipu GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4', 'glm-4-flash', 'glm-3-turbo'],
    defaultModel: 'glm-4-flash',
    supportsStreaming: false,
    maxTokens: 4096,
    // GLM gratis: limited tier available
  },
  
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['google/gemma-3-27b-it', 'meta-llama/llama-3.1-70b', 'anthropic/claude-3.5-sonnet'],
    defaultModel: 'google/gemma-3-27b-it',
    supportsStreaming: true,
    maxTokens: 4096,
    // OpenRouter: akses ke banyak model gratis/berbayar
  },
  
  custom: {
    name: 'Custom OpenAI-compatible',
    baseUrl: '', // User isi sendiri
    models: [],
    defaultModel: '',
    supportsStreaming: false,
    maxTokens: 4096
  }
};

// ==========================================
// MAIN AGENT CLASS
// ==========================================

class AgenticAI {
  constructor() {
    this.config = {
      provider: 'gemini', // default
      apiKey: '',
      model: '',
      temperature: 0.2,
      maxContextFiles: 8,
      approvalMode: 'step-by-step', // 'step-by-step' | 'review-each' | 'full-auto'
      backupBeforeEdit: true,
      autoContext: true,
      language: 'id' // responses in Indonesian
    };
    
    this.state = {
      conversation: [],
      currentPlan: null,
      currentStep: 0,
      checkpoints: [],
      isProcessing: false,
      waitingApproval: false,
      pendingAction: null,
      fileGraph: null,
      workingMemory: {} // temp data antar step
    };
    
    this.ui = null;
  }

  async init() {
    // Load config
    const saved = await this.getSetting('config');
    if (saved) {
      this.config = {...this.config, ...saved};
    }
    
    // Setup UI
    this.createUI();
    this.attachEvents();
    
    // Check API key
    if (!this.config.apiKey) {
      this.showSetupWizard();
    } else {
      this.addMessage('system', `🚀 Agentic AI ready. Provider: ${PROVIDERS[this.config.provider].name}`);
    }
    
    console.log('Agentic AI initialized');
  }

  // ==========================================
  // API PROVIDER HANDLERS
  // ==========================================

  async callAI(messages, options = {}) {
    const provider = PROVIDERS[this.config.provider];
    const model = this.config.model || provider.defaultModel;
    
    switch(this.config.provider) {
      case 'gemini':
        return await this.callGemini(messages, model, options);
      case 'glm':
        return await this.callGLM(messages, model, options);
      case 'openrouter':
      case 'custom':
        return await this.callOpenAICompatible(messages, model, options);
      default:
        throw new Error('Unknown provider');
    }
  }

  async callGemini(messages, model, options) {
    const url = `${provider.baseUrl}/${model}:generateContent?key=${this.config.apiKey}`;
    
    // Convert messages ke format Gemini
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{text: m.content}]
    }));
    
    // System instruction dipisah
    const systemMsg = messages.find(m => m.role === 'system');
    
    const body = {
      contents: contents.filter(m => m.role !== 'system'),
      systemInstruction: systemMsg ? {parts: [{text: systemMsg.content}]} : undefined,
      generationConfig: {
        temperature: options.temperature ?? this.config.temperature,
        maxOutputTokens: options.maxTokens ?? provider.maxTokens,
        responseMimeType: options.jsonMode ? 'application/json' : 'text/plain'
      }
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || `Gemini error: ${response.status}`);
    }
    
    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text;
    
    // Bersihin JSON kalo ada markdown block
    if (options.jsonMode) {
      return this.extractJSON(text);
    }
    return text;
  }

  async callGLM(messages, model, options) {
    const url = `${provider.baseUrl}/chat/completions`;
    
    const body = {
      model: model,
      messages: messages,
      temperature: options.temperature ?? this.config.temperature,
      max_tokens: options.maxTokens ?? provider.maxTokens
    };
    
    if (options.jsonMode) {
      body.response_format = {type: 'json_object'};
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || `GLM error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
  }

  async callOpenAICompatible(messages, model, options) {
    const provider = PROVIDERS[this.config.provider];
    const url = `${provider.baseUrl}/chat/completions`;
    
    const body = {
      model: model,
      messages: messages,
      temperature: options.temperature ?? this.config.temperature,
      max_tokens: options.maxTokens ?? provider.maxTokens
    };
    
    if (options.jsonMode) {
      body.response_format = {type: 'json_object'};
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'HTTP-Referer': 'https://acode.app', // OpenRouter butuh ini
        'X-Title': 'Agentic AI'
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || `API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
  }

  extractJSON(text) {
    // Bersihin markdown code blocks
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    // Cari JSON object
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON found in response');
    return match[0];
  }

  // ==========================================
  // CORE AGENT LOGIC
  // ==========================================

  async processRequest(userInput) {
    if (this.state.waitingApproval) {
      return await this.handleApprovalResponse(userInput);
    }
    
    this.setProcessing(true);
    this.addMessage('user', userInput);
    this.state.conversation.push({role: 'user', content: userInput});
    
    try {
      // Detect intent
      const intent = await this.detectIntent(userInput);
      
      switch(intent.type) {
        case 'implement':
          await this.handleImplement(userInput, intent);
          break;
        case 'edit':
          await this.handleEdit(userInput, intent);
          break;
        case 'explain':
          await this.handleExplain(userInput);
          break;
        case 'debug':
          await this.handleDebug(userInput);
          break;
        case 'chat':
        default:
          await this.handleChat(userInput);
      }
    } catch (err) {
      this.addMessage('error', err.message);
      console.error(err);
    } finally {
      this.setProcessing(false);
    }
  }

  async detectIntent(input) {
    const systemPrompt = `Kamu adalah intent classifier. Analisis request user dan klasifikasikan.

Respond HANYA dengan JSON:
{
  "type": "implement|edit|explain|debug|chat",
  "confidence": 0.0-1.0,
  "complexity": "simple|medium|complex",
  "files_mentioned": ["extracted filenames"],
  "requires_plan": true|false,
  "urgency": "low|medium|high"
}

Contoh:
- "buat login page" → implement, medium, ["login"], true
- "fix error di line 25" → debug, simple, [], false  
- "jelasin fungsi ini" → explain, simple, [], false
- "tambahin dark mode" → edit, medium, [], true`;

    const response = await this.callAI([
      {role: 'system', content: systemPrompt},
      {role: 'user', content: input}
    ], {jsonMode: true});
    
    return JSON.parse(response);
  }

  // ==========================================
  // IMPLEMENTATION WORKFLOW
  // ==========================================

  async handleImplement(request, intent) {
    this.setStatus('Analyzing workspace & creating plan...');
    
    // 1. Build context
    const context = await this.buildWorkspaceContext(intent.files_mentioned);
    
    // 2. Create plan
    const plan = await this.createImplementationPlan(request, context);
    this.state.currentPlan = plan;
    this.state.currentStep = 0;
    
    // 3. Show for approval
    this.renderPlanApproval(plan);
  }

  async buildWorkspaceContext(hints) {
    const files = [];
    const activeFile = editorManager.activeFile;
    
    // Active file (full content)
    if (activeFile) {
      files.push({
        path: this.normalizePath(activeFile.uri || activeFile.location),
        name: activeFile.name,
        content: activeFile.session?.getValue() || '',
        type: 'active',
        language: activeFile.mode
      });
    }
    
    // Open files (truncated)
    editorManager.files.forEach(file => {
      if (file !== activeFile) {
        const content = file.session?.getValue() || '';
        files.push({
          path: this.normalizePath(file.uri || file.location),
          name: file.name,
          content: content.length > 3000 ? content.substring(0, 3000) + '\n...' : content,
          type: 'open',
          language: file.mode
        });
      }
    });
    
    // Find related files dari hints
    if (hints?.length > 0 && this.config.autoContext) {
      const related = await this.findRelatedFiles(hints, files);
      files.push(...related);
    }
    
    // Build dependency graph
    this.state.fileGraph = this.buildFileGraph(files);
    
    return {
      files: files.slice(0, this.config.maxContextFiles),
      rootPath: this.getProjectRoot(),
      graph: this.state.fileGraph
    };
  }

  async createImplementationPlan(request, context) {
    const systemPrompt = `Kamu adalah expert software architect. Buat implementation plan yang detail.

ATURAN PENTING:
1. Analisis existing files dulu, jangan duplikat fungsi
2. Prefer modifikasi minimal vs rewrite total
3. Pertimbangkan consistency dengan codebase existing
4. Setiap step harus ada verification criteria

Respond dengan JSON:
{
  "plan_id": "uuid",
  "title": "Judul fitur",
  "description": "Deskripsi singkat",
  "estimated_duration": "X menit",
  "context_summary": "Analisis file yang ada",
  
  "file_analysis": {
    "existing": [{"path": "...", "relevance": "high|medium|low", "suggested_action": "modify|reference|ignore"}],
    "to_create": [{"path": "...", "purpose": "...", "template": "..."}]
  },
  
  "steps": [
    {
      "id": 1,
      "phase": "setup|core|ui|integration|test",
      "action": "create|modify|delete|command",
      "file": "path",
      "description": "Apa yang dikerjakan",
      "acceptance_criteria": ["Kriteria sukses"],
      "dependencies": [0],
      "can_parallel": false,
      "rollback_strategy": "delete_file|git_reset|backup_restore"
    }
  ],
  
  "risks": [
    {"description": "...", "mitigation": "..."}
  ],
  
  "verification": {
    "manual_tests": ["Cara test manual"],
    "automated_suggestions": ["Unit test ideas"]
  }
}`;

    const userPrompt = `Request: ${request}

Workspace Context:
${JSON.stringify(context, null, 2)}

Buat plan yang realistis untuk codebase ini.`;

    const response = await this.callAI([
      {role: 'system', content: systemPrompt},
      {role: 'user', content: userPrompt}
    ], {jsonMode: true, maxTokens: 4096});
    
    return JSON.parse(response);
  }

  // ==========================================
  // SUPERVISED EXECUTION
  // ==========================================

  renderPlanApproval(plan) {
    const html = `
      <div class="ag-plan">
        <div class="ag-plan-header">
          <h3>${plan.title}</h3>
          <span class="ag-badge">⏱️ ${plan.estimated_duration}</span>
        </div>
        
        <p class="ag-plan-desc">${plan.description}</p>
        
        <div class="ag-plan-context">
          <strong>📊 Context Analysis:</strong>
          <p>${plan.context_summary}</p>
        </div>

        <div class="ag-files-section">
          <div class="ag-files-col">
            <h4>📁 Existing Files (${plan.file_analysis.existing.length})</h4>
            ${plan.file_analysis.existing.map(f => `
              <div class="ag-file-tag ${f.suggested_action}">
                ${f.suggested_action === 'modify' ? '✏️' : '📄'} ${f.path}
                <small>${f.relevance}</small>
              </div>
            `).join('')}
          </div>
          
          <div class="ag-files-col">
            <h4>✨ New Files (${plan.file_analysis.to_create.length})</h4>
            ${plan.file_analysis.to_create.map(f => `
              <div class="ag-file-tag create">
                ➕ ${f.path}
              </div>
            `).join('')}
          </div>
        </div>

        <div class="ag-steps-preview">
          <h4>📝 ${plan.steps.length} Steps</h4>
          ${plan.steps.map((s, i) => `
            <div class="ag-step-row">
              <span class="ag-step-num">${i+1}</span>
              <div class="ag-step-info">
                <strong>[${s.phase}]</strong> ${s.description}
                <small>${s.file}</small>
              </div>
            </div>
          `).join('')}
        </div>

        ${plan.risks.length ? `
          <div class="ag-risks">
            <h4>⚠️ Risks</h4>
            ${plan.risks.map(r => `<p>• ${r.description}</p>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
    
    this.addMessage('ai', html);
    
    // Show approval UI
    this.showApproval('plan', {
      approve: () => this.startExecution('sequential'),
      stepByStep: () => this.startExecution('step'),
      modify: () => this.askPlanModification(),
      cancel: () => this.cancelOperation()
    });
  }

  async startExecution(mode) {
    this.hideApproval();
    this.state.executionMode = mode;
    
    if (mode === 'step') {
      await this.executeSingleStep(0);
    } else {
      await this.executeAllSteps();
    }
  }

  async executeSingleStep(index) {
    if (index >= this.state.currentPlan.steps.length) {
      return this.finishExecution();
    }
    
    this.state.currentStep = index;
    const step = this.state.currentPlan.steps[index];
    
    this.setStatus(`Step ${index + 1}: ${step.description}`);
    
    // Generate content
    const generated = await this.generateStepContent(step);
    
    // Show for review
    await this.showStepReview(step, generated);
  }

  async generateStepContent(step) {
    const context = await this.getStepContext(step);
    
    const systemPrompt = `Kamu adalah expert developer. Generate code untuk step ini.

ATURAN:
- Match style codebase yang ada
- Include imports yang diperlukan
- Tambahin error handling
- JSDoc untuk public functions
- Jangan include explaination, hanya code

Respond JSON:
{
  "code": "full code content",
  "is_complete_file": true|false,
  "line_count": 0,
  "imports_added": ["..."],
  "exports_added": ["..."],
  "notes": "catatan penting untuk reviewer"
}`;

    const userPrompt = `Step: ${step.description}
File: ${step.file}
Action: ${step.action}

Context:
${JSON.stringify(context, null, 2)}

Generate code:`;

    const response = await this.callAI([
      {role: 'system', content: systemPrompt},
      {role: 'user', content: userPrompt}
    ], {jsonMode: true});
    
    return JSON.parse(response);
  }

  async showStepReview(step, generated) {
    this.state.waitingApproval = true;
    this.state.pendingAction = {step, generated};
    
    // Render diff/preview
    let previewHtml = '';
    
    if (step.action === 'create') {
      previewHtml = `
        <div class="ag-preview-create">
          <div class="ag-preview-header">
            <span>🆕 ${step.file}</span>
            <span>${generated.line_count} lines</span>
          </div>
          <pre class="ag-code-block"><code>${this.escapeHtml(generated.code)}</code></pre>
        </div>
      `;
    } else if (step.action === 'modify') {
      const existing = await this.readFile(step.file);
      const diff = this.generateDiff(existing, generated.code);
      previewHtml = `
        <div class="ag-preview-modify">
          <div class="ag-diff-view">${diff}</div>
        </div>
      `;
    }
    
    const html = `
      <div class="ag-step-review">
        <div class="ag-review-header">
          <h4>Step ${step.id}: ${step.phase}</h4>
          <p>${step.description}</p>
        </div>
        
        ${previewHtml}
        
        <div class="ag-review-notes">
          <strong>💡 Notes:</strong> ${generated.notes}
        </div>
        
        <div class="ag-acceptance">
          <strong>✅ Acceptance Criteria:</strong>
          <ul>${step.acceptance_criteria.map(c => `<li>${c}</li>`).join('')}</ul>
        </div>
      </div>
    `;
    
    this.addMessage('ai', html);
    
    this.showApproval('step', {
      accept: () => this.confirmStep(true),
      reject: () => this.confirmStep(false),
      edit: () => this.manualEditStep(),
      explain: () => this.explainStep(),
      skip: () => this.skipStep()
    });
  }

  async confirmStep(accepted) {
    this.hideApproval();
    this.state.waitingApproval = false;
    
    const {step, generated} = this.state.pendingAction;
    
    if (accepted) {
      // Apply changes
      await this.applyChanges(step, generated);
      this.addMessage('success', `✅ Step ${step.id} applied successfully`);
      
      // Continue
      if (this.state.executionMode === 'step') {
        if (this.state.currentStep + 1 < this.state.currentPlan.steps.length) {
          const next = this.state.currentStep + 1;
          this.addMessage('system', `Ready for Step ${next + 1}. Type "go" or click Continue.`);
          this.showContinueButton(next);
        } else {
          this.finishExecution();
        }
      }
    } else {
      // Rejected - ask why
      this.addMessage('system', 'Step rejected. Apa yang perlu diubah? (retry/modify/skip/cancel)');
      this.state.waitingApproval = true;
      this.state.pendingAction = {...this.state.pendingAction, rejected: true};
    }
  }

  // ==========================================
  // CHANGE APPLICATION
  // ==========================================

  async applyChanges(step, generated) {
    const filePath = this.resolvePath(step.file);
    
    // Create checkpoint
    if (this.config.backupBeforeEdit) {
      await this.createCheckpoint(filePath);
    }
    
    switch(step.action) {
      case 'create':
        await this.writeFile(filePath, generated.code);
        break;
        
      case 'modify':
        await this.modifyFile(filePath, generated.code, generated.is_complete_file);
        break;
        
      case 'delete':
        await this.deleteFile(filePath);
        break;
    }
    
    // Update working memory
    this.state.workingMemory[step.file] = {
      lastModified: Date.now(),
      action: step.action
    };
  }

  async writeFile(path, content) {
    try {
      await acode.createFile(path, content);
      await acode.openFile(path);
    } catch (e) {
      // Fallback: buat file baru via editor
      const newFile = {
        uri: path,
        name: path.split('/').pop(),
        session: ace.createEditSession(content, this.detectMode(path))
      };
      editorManager.addNewFile(newFile.uri, newFile.session);
    }
  }

  async modifyFile(path, newContent, isComplete) {
    let file = editorManager.files.find(f => 
      (f.uri || f.location) === path
    );
    
    if (!file) {
      await acode.openFile(path);
      file = editorManager.activeFile;
    }
    
    const editor = editorManager.editor;
    
    if (isComplete) {
      editor.session.setValue(newContent);
    } else {
      // Smart merge (simplified)
      editor.session.setValue(newContent);
    }
    
    await acode.saveFile(path);
  }

  // ==========================================
  // CONVERSATION LOOP HANDLING
  // ==========================================

  async handleApprovalResponse(input) {
    const lower = input.toLowerCase().trim();
    const {step, generated, rejected} = this.state.pendingAction;
    
    if (rejected) {
      // Handle rejection response
      if (lower === 'retry' || lower === 'coba lagi') {
        this.addMessage('user', 'Retrying with same parameters...');
        await this.executeSingleStep(this.state.currentStep);
        
      } else if (lower === 'modify' || lower === 'ubah') {
        this.addMessage('system', 'Ok, describe the modification needed:');
        this.state.pendingAction = {
          ...this.state.pendingAction, 
          awaitingModification: true
        };
        
      } else if (lower === 'skip' || lower === 'lewati') {
        this.skipStep();
        
      } else if (lower === 'cancel' || lower === 'batal') {
        this.cancelOperation();
        
      } else if (this.state.pendingAction.awaitingModification) {
        // User kasih instruksi modifikasi
        const modifiedStep = {
          ...step,
          description: `${step.description}. Additional: ${input}`
        };
        this.state.pendingAction.step = modifiedStep;
        this.state.pendingAction.awaitingModification = false;
        await this.executeSingleStep(this.state.currentStep);
      }
      
    } else {
      // Normal conversation during execution
      if (lower === 'go' || lower === 'lanjut' || lower === 'next') {
        this.continueToNextStep();
      } else {
        // General question about current step
        await this.answerContextualQuestion(input);
      }
    }
  }

  async answerContextualQuestion(question) {
    const context = {
      currentPlan: this.state.currentPlan?.title,
      currentStep: this.state.currentStep,
      pendingAction: this.state.pendingAction?.step?.description
    };
    
    const response = await this.callAI([
      {role: 'system', content: `Jawab pertanyaan user tentang step yang sedang dikerjakan. Context: ${JSON.stringify(context)}`},
      {role: 'user', content: question}
    ]);
    
    this.addMessage('ai', response);
    this.state.waitingApproval = true; // Still waiting for action
  }

  // ==========================================
  // UI COMPONENTS
  // ==========================================

  createUI() {
    this.ui = document.createElement('div');
    this.ui.id = 'agentic_ai';
    this.ui.innerHTML = `
      <div class="ag-container">
        <header class="ag-header">
          <div class="ag-brand">
            <span class="ag-icon">◈</span>
            <div>
              <h1>AGENTIC AI</h1>
              <span class="ag-subtitle">Supervised Coding Agent</span>
            </div>
          </div>
          <div class="ag-controls">
            <button id="ag-config-btn" title="Config">⚙</button>
            <button id="ag-close-btn" title="Close">✕</button>
          </div>
        </header>

        <div class="ag-config-panel hidden" id="ag-config">
          <div class="ag-config-section">
            <label>Provider</label>
            <select id="ag-provider">
              ${Object.entries(PROVIDERS).map(([key, p]) => 
                `<option value="${key}" ${key === this.config.provider ? 'selected' : ''}>${p.name}</option>`
              ).join('')}
            </select>
          </div>
          
          <div class="ag-config-section">
            <label>API Key</label>
            <input type="password" id="ag-api-key" value="${this.config.apiKey}" placeholder="Enter API key...">
          </div>
          
          <div class="ag-config-section">
            <label>Model</label>
            <select id="ag-model">
              <option value="">Default (${PROVIDERS[this.config.provider].defaultModel})</option>
            </select>
          </div>
          
          <div class="ag-config-section">
            <label>Approval Mode</label>
            <select id="ag-approval-mode">
              <option value="step-by-step" ${this.config.approvalMode === 'step-by-step' ? 'selected' : ''}>Step by Step</option>
              <option value="review-each" ${this.config.approvalMode === 'review-each' ? 'selected' : ''}>Review Each Change</option>
              <option value="full-auto" ${this.config.approvalMode === 'full-auto' ? 'selected' : ''}>Full Auto</option>
            </select>
          </div>
          
          <button class="ag-save-config" id="ag-save-config">Save Configuration</button>
        </div>

        <div class="ag-context-bar">
          <span class="ag-context-label">CONTEXT</span>
          <div class="ag-context-files" id="ag-context-files">
            <span class="ag-empty">No files</span>
          </div>
          <button id="ag-refresh-context">↻</button>
        </div>

        <div class="ag-chat" id="ag-chat"></div>

        <div class="ag-approval-area hidden" id="ag-approval">
          <div class="ag-approval-content" id="ag-approval-content"></div>
          <div class="ag-approval-actions" id="ag-approval-actions"></div>
        </div>

        <div class="ag-input-area">
          <div class="ag-input-wrap">
            <textarea id="ag-input" placeholder="What should we build? (e.g., 'Create auth system with JWT')..." rows="1"></textarea>
            <button id="ag-send">➤</button>
          </div>
          <div class="ag-input-hints">
            <span>Shift+Enter new line</span>
            <span id="ag-status">Ready</span>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(this.ui);
  }

  attachEvents() {
    // Close
    this.ui.querySelector('#ag-close-btn').onclick = () => {
      this.ui.classList.add('hidden');
    };
    
    // Config toggle
    this.ui.querySelector('#ag-config-btn').onclick = () => {
      this.ui.querySelector('#ag-config').classList.toggle('hidden');
    };
    
    // Save config
    this.ui.querySelector('#ag-save-config').onclick = () => this.saveConfig();
    
    // Provider change update models
    this.ui.querySelector('#ag-provider').onchange = (e) => {
      this.updateModelOptions(e.target.value);
    };
    
    // Send
    const sendBtn = this.ui.querySelector('#ag-send');
    const input = this.ui.querySelector('#ag-input');
    
    sendBtn.onclick = () => {
      const text = input.value.trim();
      if (text) {
        this.processRequest(text);
        input.value = '';
        input.style.height = 'auto';
      }
    };
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });
    
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 200) + 'px';
    });
    
    // Refresh context
    this.ui.querySelector('#ag-refresh-context').onclick = () => {
      this.updateContextBar();
    };
  }

  updateModelOptions(providerKey) {
    const provider = PROVIDERS[providerKey];
    const select = this.ui.querySelector('#ag-model');
    select.innerHTML = `
      <option value="">Default (${provider.defaultModel})</option>
      ${provider.models.map(m => `<option value="${m}">${m}</option>`).join('')}
    `;
  }

  async saveConfig() {
    this.config.provider = this.ui.querySelector('#ag-provider').value;
    this.config.apiKey = this.ui.querySelector('#ag-api-key').value;
    this.config.model = this.ui.querySelector('#ag-model').value;
    this.config.approvalMode = this.ui.querySelector('#ag-approval-mode').value;
    
    await this.setSetting('config', this.config);
    this.ui.querySelector('#ag-config').classList.add('hidden');
    this.addMessage('success', 'Configuration saved!');
  }

  showApproval(type, actions) {
    const area = this.ui.querySelector('#ag-approval');
    const content = this.ui.querySelector('#ag-approval-content');
    const buttons = this.ui.querySelector('#ag-approval-actions');
    
    area.classList.remove('hidden');
    
    if (type === 'plan') {
      content.innerHTML = '<p>Choose execution mode for this plan:</p>';
      buttons.innerHTML = `
        <button class="ag-btn ag-btn-primary" id="ag-approve-all">▶ Run All</button>
        <button class="ag-btn ag-btn-secondary" id="ag-step-by-step">→ Step by Step</button>
        <button class="ag-btn ag-btn-info" id="ag-modify-plan">✎ Modify</button>
        <button class="ag-btn ag-btn-danger" id="ag-cancel-plan">✕ Cancel</button>
      `;
      
      buttons.querySelector('#ag-approve-all').onclick = actions.approve;
      buttons.querySelector('#ag-step-by-step').onclick = actions.stepByStep;
      buttons.querySelector('#ag-modify-plan').onclick = actions.modify;
      buttons.querySelector('#ag-cancel-plan').onclick = actions.cancel;
      
    } else if (type === 'step') {
      content.innerHTML = '<p>Review this change:</p>';
      buttons.innerHTML = `
        <button class="ag-btn ag-btn-success" id="ag-accept">✓ Accept</button>
        <button class="ag-btn ag-btn-danger" id="ag-reject">✕ Reject</button>
        <button class="ag-btn ag-btn-secondary" id="ag-edit">✎ Edit</button>
        <button class="ag-btn ag-btn-info" id="ag-explain">? Explain</button>
        <button class="ag-btn ag-btn-warning" id="ag-skip">⏭ Skip</button>
      `;
      
      buttons.querySelector('#ag-accept').onclick = actions.accept;
      buttons.querySelector('#ag-reject').onclick = actions.reject;
      buttons.querySelector('#ag-edit').onclick = actions.edit;
      buttons.querySelector('#ag-explain').onclick = actions.explain;
      buttons.querySelector('#ag-skip').onclick = actions.skip;
    }
  }

  hideApproval() {
    this.ui.querySelector('#ag-approval').classList.add('hidden');
  }

  addMessage(type, content) {
    const chat = this.ui.querySelector('#ag-chat');
    const msg = document.createElement('div');
    msg.className = `ag-message ag-${type}`;
    
    // Simple markdown
    let html = content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
    
    msg.innerHTML = html;
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
  }

  setProcessing(isProcessing) {
    this.state.isProcessing = isProcessing;
    this.ui.querySelector('#ag-send').disabled = isProcessing;
    this.ui.querySelector('#ag-input').disabled = isProcessing;
    this.setStatus(isProcessing ? 'Processing...' : 'Ready');
  }

  setStatus(text) {
    this.ui.querySelector('#ag-status').textContent = text;
  }

  updateContextBar() {
    const container = this.ui.querySelector('#ag-context-files');
    const files = editorManager.files.slice(0, 3).map(f => f.name);
    
    if (files.length === 0) {
      container.innerHTML = '<span class="ag-empty">No files</span>';
    } else {
      container.innerHTML = files.map(f => `<span class="ag-file-chip">${f}</span>`).join('');
    }
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  normalizePath(path) {
    return path?.replace('file://', '') || '';
  }

  getProjectRoot() {
    const active = editorManager.activeFile;
    if (!active) return '/';
    const path = active.uri || active.location;
    return path.substring(0, path.lastIndexOf('/')) || '/';
  }

  resolvePath(relative) {
    if (relative.startsWith('/')) return relative;
    return `${this.getProjectRoot()}/${relative}`;
  }

  detectMode(filename) {
    const ext = filename.split('.').pop();
    const modes = {
      js: 'ace/mode/javascript',
      ts: 'ace/mode/typescript',
      jsx: 'ace/mode/javascript',
      tsx: 'ace/mode/typescript',
      py: 'ace/mode/python',
      html: 'ace/mode/html',
      css: 'ace/mode/css',
      json: 'ace/mode/json'
    };
    return modes[ext] || 'ace/mode/text';
  }

  async getSetting(key) {
    try {
      const settings = await acode.getPluginSettings('agentic_ai');
      return settings?.[key];
    } catch(e) { return null; }
  }

  async setSetting(key, value) {
    const settings = await acode.getPluginSettings('agentic_ai') || {};
    settings[key] = value;
    await acode.setPluginSettings('agentic_ai', settings);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy() {
    this.ui?.remove();
  }
}

// Initialize
const agent = new AgenticAI();
window.agentic = agent;

acode.setPluginInit('agentic_ai', () => agent.init());
acode.setPluginUnmount('agentic_ai', () => agent.destroy());
