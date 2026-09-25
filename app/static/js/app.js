/**
 * Laya — System 1 Decision Engine (Web Client)
 * Handles interactive decision playground, visual question builder, offline path validation,
 * probability meter rendering, and code generation.
 * Minimalist, sleek, professional UI with zero emojis.
 */

// Application State
const state = {
    currentPresetId: null,
    presets: [],
    stateMode: 'json', // 'json' or 'text'
    questionsMode: 'visual', // 'visual' or 'raw'
    questions: {},
    localPath: './models/openvino',
    forceOffline: false,
    hardware: null,
    lastResult: null,
    activeSnippetTab: 'py', // 'py', 'curl', 'json'
    cachedSnippets: null
};

// DOM Elements
const elements = {
    html: document.documentElement,
    btnTheme: document.getElementById('btnTheme'),
    btnSettings: document.getElementById('btnSettings'),
    btnHelp: document.getElementById('btnHelp'),
    latencyBadge: document.getElementById('latencyBadge'),
    sourceBadge: document.getElementById('sourceBadge'),
    hwBadge: document.getElementById('hwBadge'),
    presetsList: document.getElementById('presetsList'),
    
    // State Inputs
    btnStateJson: document.getElementById('btnStateJson'),
    btnStateText: document.getElementById('btnStateText'),
    stateInput: document.getElementById('stateInput'),
    stateStats: document.getElementById('stateStats'),
    btnFormatJson: document.getElementById('btnFormatJson'),

    // Question Views
    btnModeVisual: document.getElementById('btnModeVisual'),
    btnModeRawJson: document.getElementById('btnModeRawJson'),
    visualBuilderView: document.getElementById('visualBuilderView'),
    rawJsonView: document.getElementById('rawJsonView'),
    questionsList: document.getElementById('questionsList'),
    btnAddQuestion: document.getElementById('btnAddQuestion'),
    rawQuestionsInput: document.getElementById('rawQuestionsInput'),
    btnSyncVisual: document.getElementById('btnSyncVisual'),
    rawJsonStatus: document.getElementById('rawJsonStatus'),

    // Controls
    modelSelect: document.getElementById('modelSelect'),
    backendSelect: document.getElementById('backendSelect'),
    precisionSelect: document.getElementById('precisionSelect'),
    precisionField: document.getElementById('precisionField'),
    contextLenSelect: document.getElementById('contextLenSelect'),
    chkForceOffline: document.getElementById('chkForceOffline'),
    activePathText: document.getElementById('activePathText'),
    btnExecute: document.getElementById('btnExecute'),

    // Metrics & Results
    metricsBar: document.getElementById('metricsBar'),
    metricLatency: document.getElementById('metricLatency'),
    metricModel: document.getElementById('metricModel'),
    metricCount: document.getElementById('metricCount'),
    metricWeights: document.getElementById('metricWeights'),
    emptyState: document.getElementById('emptyState'),
    decisionsList: document.getElementById('decisionsList'),

    // Snippets
    tabSnippetPy: document.getElementById('tabSnippetPy'),
    tabSnippetCurl: document.getElementById('tabSnippetCurl'),
    tabSnippetJson: document.getElementById('tabSnippetJson'),
    snippetCode: document.getElementById('snippetCode'),
    btnCopySnippet: document.getElementById('btnCopySnippet'),

    // Settings Modal
    settingsModal: document.getElementById('settingsModal'),
    btnCloseSettings: document.getElementById('btnCloseSettings'),
    btnCancelSettings: document.getElementById('btnCancelSettings'),
    btnSaveSettings: document.getElementById('btnSaveSettings'),
    inputLocalPath: document.getElementById('inputLocalPath'),
    btnValidateLocalPath: document.getElementById('btnValidateLocalPath'),
    chkModalOffline: document.getElementById('chkModalOffline'),
    stFolderExists: document.getElementById('stFolderExists'),
    stCkptEnglish: document.getElementById('stCkptEnglish'),
    stCkptMulti: document.getElementById('stCkptMulti'),
    stCkptTyped: document.getElementById('stCkptTyped'),
    stTotalSize: document.getElementById('stTotalSize'),
    missingFilesAlert: document.getElementById('missingFilesAlert'),

    // Help Modal
    helpModal: document.getElementById('helpModal'),
    btnCloseHelp: document.getElementById('btnCloseHelp'),
    btnCloseHelpFooter: document.getElementById('btnCloseHelpFooter'),

    toastContainer: document.getElementById('toastContainer')
};

// ==============================================================================
// Utility Functions
// ==============================================================================
function showToast(message, type = 'info') {
    if (!elements.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(6px)';
        toast.style.transition = 'all 0.18s ease-out';
        setTimeout(() => toast.remove(), 200);
    }, 3200);
}

function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ==============================================================================
// Initialization
// ==============================================================================
async function initApp() {
    setupTheme();
    loadPersistedSettings();
    await fetchSystemStatus();
    await fetchPresets();
    setupEventListeners();
    updateStateStats();
}

function applyTheme(theme) {
    const isDark = theme === 'dark';
    elements.html.classList.toggle('dark', isDark);
    elements.html.classList.toggle('light', !isDark);
    
    const iconDark = elements.btnTheme?.querySelector('.theme-icon-dark');
    const iconLight = elements.btnTheme?.querySelector('.theme-icon-light');
    if (iconDark && iconLight) {
        iconDark.classList.toggle('hidden', !isDark);
        iconLight.classList.toggle('hidden', isDark);
    }
}

function setupTheme() {
    const savedTheme = localStorage.getItem('laya_theme') || 'dark';
    applyTheme(savedTheme);
}

function toggleTheme() {
    const isCurrentlyDark = elements.html.classList.contains('dark');
    const nextTheme = isCurrentlyDark ? 'light' : 'dark';
    applyTheme(nextTheme);
    localStorage.setItem('laya_theme', nextTheme);
}

function loadPersistedSettings() {
    const savedPath = localStorage.getItem('laya_local_path') || './models/openvino';
    state.localPath = savedPath;
    if (elements.inputLocalPath) elements.inputLocalPath.value = savedPath;
    if (elements.activePathText) elements.activePathText.textContent = savedPath;

    const savedOffline = localStorage.getItem('laya_force_offline') === 'true';
    state.forceOffline = savedOffline;
    if (elements.chkForceOffline) elements.chkForceOffline.checked = savedOffline;
    if (elements.chkModalOffline) elements.chkModalOffline.checked = savedOffline;
}

// ==============================================================================
// System Status & Presets
// ==============================================================================
async function fetchSystemStatus() {
    try {
        const res = await fetch('/api/status');
        if (!res.ok) throw new Error('API status connection failed');
        const data = await res.json();
        
        state.hardware = data.hardware;
        
        // Update hardware badge
        const devName = data.hardware.cuda_available ? (data.hardware.device_name || 'CUDA') : 'CPU';
        const hwVal = elements.hwBadge?.querySelector('.chip-value');
        if (hwVal) hwVal.textContent = devName;
        else if (elements.hwBadge) elements.hwBadge.textContent = devName;

        // Update local models status
        const local = data.local_model_status;
        const sourceVal = elements.sourceBadge?.querySelector('.chip-value');
        if (local && local.exists && (local.checkpoints.english || local.checkpoints.multilingual)) {
            const label = `LOCAL (${local.total_size_mb} MB)`;
            if (sourceVal) sourceVal.textContent = label;
            else if (elements.sourceBadge) elements.sourceBadge.textContent = label;
        } else {
            const label = `HF HUB (${data.default_hub_repo})`;
            if (sourceVal) sourceVal.textContent = label;
            else if (elements.sourceBadge) elements.sourceBadge.textContent = label;
        }
    } catch (err) {
        const sourceVal = elements.sourceBadge?.querySelector('.chip-value');
        if (sourceVal) sourceVal.textContent = 'UNAVAILABLE';
        else if (elements.sourceBadge) elements.sourceBadge.textContent = 'UNAVAILABLE';
        console.error('System status fetch failed:', err);
    }
}

async function fetchPresets() {
    try {
        const res = await fetch('/api/presets');
        if (!res.ok) throw new Error('Failed to load presets');
        state.presets = await res.json();
        renderPresetsBar();
        if (state.presets.length > 0) {
            applyPreset(state.presets[0].id);
        }
    } catch (err) {
        showToast('Failed to load presets: ' + err.message, 'error');
    }
}

function renderPresetsBar() {
    if (!elements.presetsList) return;
    elements.presetsList.innerHTML = '';
    state.presets.forEach(p => {
        const btn = document.createElement('button');
        btn.className = `preset-pill ${p.id === state.currentPresetId ? 'active' : ''}`;
        btn.dataset.presetId = p.id;
        btn.innerHTML = `
            <span>${escapeHtml(p.name)}</span>
            <span class="preset-tag">${escapeHtml(p.badge)}</span>
        `;
        btn.addEventListener('click', () => applyPreset(p.id));
        elements.presetsList.appendChild(btn);
    });
}

function applyPreset(presetId) {
    const preset = state.presets.find(p => p.id === presetId);
    if (!preset) return;

    state.currentPresetId = presetId;
    renderPresetsBar();

    // Set state
    if (preset.state_type === 'json') {
        setStateMode('json');
        elements.stateInput.value = JSON.stringify(preset.state, null, 2);
    } else {
        setStateMode('text');
        elements.stateInput.value = typeof preset.state === 'string' ? preset.state : JSON.stringify(preset.state);
    }
    updateStateStats();

    // Set questions
    state.questions = JSON.parse(JSON.stringify(preset.questions));
    elements.rawQuestionsInput.value = JSON.stringify(state.questions, null, 2);
    renderVisualQuestions();
}

// ==============================================================================
// State Editor Handling
// ==============================================================================
function setStateMode(mode) {
    state.stateMode = mode;
    if (mode === 'json') {
        elements.btnStateJson.classList.add('active');
        elements.btnStateText.classList.remove('active');
        elements.btnFormatJson.style.display = 'inline-block';
    } else {
        elements.btnStateText.classList.add('active');
        elements.btnStateJson.classList.remove('active');
        elements.btnFormatJson.style.display = 'none';
    }
}

function updateStateStats() {
    const text = elements.stateInput.value || '';
    const chars = text.length;
    const lines = text.split('\n').length;
    elements.stateStats.textContent = `${chars.toLocaleString()} chars · ${lines} lines`;
}

function formatJsonState() {
    try {
        const parsed = JSON.parse(elements.stateInput.value);
        elements.stateInput.value = JSON.stringify(parsed, null, 2);
        updateStateStats();
        showToast('JSON formatted', 'success');
    } catch (e) {
        showToast('Invalid JSON: ' + e.message, 'error');
    }
}

// ==============================================================================
// Visual Question Builder & Raw JSON Sync
// ==============================================================================
function setQuestionsMode(mode) {
    state.questionsMode = mode;
    if (mode === 'visual') {
        elements.btnModeVisual.classList.add('active');
        elements.btnModeRawJson.classList.remove('active');
        elements.visualBuilderView.classList.remove('hidden');
        elements.rawJsonView.classList.add('hidden');
    } else {
        elements.btnModeRawJson.classList.add('active');
        elements.btnModeVisual.classList.remove('active');
        elements.rawJsonView.classList.remove('hidden');
        elements.visualBuilderView.classList.add('hidden');
        elements.rawQuestionsInput.value = JSON.stringify(state.questions, null, 2);
    }
}

function renderVisualQuestions() {
    elements.questionsList.innerHTML = '';
    const qIds = Object.keys(state.questions);

    if (qIds.length === 0) {
        elements.questionsList.innerHTML = `
            <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px;">
                No questions defined. Click "Add Decision Question" below.
            </div>
        `;
        return;
    }

    qIds.forEach(qid => {
        const q = state.questions[qid];
        const card = createQuestionCardElement(qid, q);
        elements.questionsList.appendChild(card);
    });
}

function createQuestionCardElement(qid, q) {
    const card = document.createElement('div');
    card.className = 'q-card';
    card.dataset.qid = qid;

    const header = document.createElement('div');
    header.className = 'q-card-header';
    header.innerHTML = `
        <input type="text" class="q-key-input" value="${escapeHtml(qid)}" title="Question identifier key">
        <select class="select-input q-type-select" style="width: auto; padding: 3px 6px; font-size: 11px;">
            <option value="choice" ${q.type === 'choice' ? 'selected' : ''}>Choice</option>
            <option value="score" ${q.type === 'score' ? 'selected' : ''}>Score</option>
            <option value="noul" ${q.type === 'noul' ? 'selected' : ''}>Boolean</option>
        </select>
        <button class="btn-icon-del" title="Delete question">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;

    const instructionInput = document.createElement('input');
    instructionInput.type = 'text';
    instructionInput.className = 'q-inst-input';
    instructionInput.value = q.instructions || '';
    instructionInput.placeholder = 'Enter evaluation prompt or instruction...';

    const criteriaBox = document.createElement('div');
    criteriaBox.className = 'criteria-box';
    renderCriteriaBoxContent(criteriaBox, qid, q);

    card.appendChild(header);
    card.appendChild(instructionInput);
    card.appendChild(criteriaBox);

    const keyInput = header.querySelector('.q-key-input');
    keyInput.addEventListener('change', (e) => {
        const newKey = e.target.value.trim().replace(/\s+/g, '_');
        if (!newKey || newKey === qid) return;
        if (state.questions[newKey]) {
            showToast(`Key "${newKey}" already exists`, 'error');
            e.target.value = qid;
            return;
        }
        state.questions[newKey] = state.questions[qid];
        delete state.questions[qid];
        renderVisualQuestions();
    });

    const typeSelect = header.querySelector('.q-type-select');
    typeSelect.addEventListener('change', (e) => {
        const newType = e.target.value;
        q.type = newType;
        if (newType === 'choice' && (!q.criteria || Array.isArray(q.criteria))) {
            q.criteria = { "option_a": "Description for option A", "option_b": "Description for option B" };
        } else if (newType === 'score' && (!q.criteria || !Array.isArray(q.criteria))) {
            q.criteria = ["low", "medium", "high"];
        } else if (newType === 'noul') {
            delete q.criteria;
        }
        renderCriteriaBoxContent(criteriaBox, qid, q);
    });

    instructionInput.addEventListener('input', (e) => {
        q.instructions = e.target.value;
    });

    const btnRemove = header.querySelector('.btn-icon-del');
    btnRemove.addEventListener('click', () => {
        delete state.questions[qid];
        renderVisualQuestions();
    });

    return card;
}

function renderCriteriaBoxContent(box, qid, q) {
    box.innerHTML = '';

    if (q.type === 'choice') {
        const title = document.createElement('div');
        title.className = 'dist-heading';
        title.style.marginBottom = '6px';
        title.textContent = 'CATEGORICAL CANDIDATES';
        box.appendChild(title);

        const crit = q.criteria || {};
        Object.entries(crit).forEach(([optKey, optDesc]) => {
            const row = document.createElement('div');
            row.className = 'crit-row';
            row.innerHTML = `
                <input type="text" class="crit-key" value="${escapeHtml(optKey)}" placeholder="Key">
                <input type="text" class="crit-desc" value="${escapeHtml(optDesc)}" placeholder="Description / criteria">
                <button class="btn-crit-del" title="Remove candidate">&times;</button>
            `;

            const kInput = row.querySelector('.crit-key');
            kInput.addEventListener('change', (e) => {
                const newK = e.target.value.trim();
                if (!newK || newK === optKey) return;
                crit[newK] = crit[optKey];
                delete crit[optKey];
                renderCriteriaBoxContent(box, qid, q);
            });

            const dInput = row.querySelector('.crit-desc');
            dInput.addEventListener('input', (e) => {
                crit[optKey] = e.target.value;
            });

            row.querySelector('.btn-crit-del').addEventListener('click', () => {
                delete crit[optKey];
                renderCriteriaBoxContent(box, qid, q);
            });

            box.appendChild(row);
        });

        const btnAdd = document.createElement('button');
        btnAdd.className = 'btn-add-crit';
        btnAdd.textContent = '+ Add Candidate';
        btnAdd.addEventListener('click', () => {
            const newIndex = Object.keys(crit).length + 1;
            crit[`option_${newIndex}`] = `Option ${newIndex} definition`;
            renderCriteriaBoxContent(box, qid, q);
        });

        box.appendChild(btnAdd);

    } else if (q.type === 'score') {
        const title = document.createElement('div');
        title.className = 'dist-heading';
        title.style.marginBottom = '6px';
        title.textContent = 'ORDERED RUBRIC LEVELS';
        box.appendChild(title);

        const crit = Array.isArray(q.criteria) ? q.criteria : [];
        crit.forEach((lvl, idx) => {
            const row = document.createElement('div');
            row.className = 'crit-row';
            row.innerHTML = `
                <span style="font-family: var(--font-mono); font-size: 11px; width: 20px; color: var(--text-muted);">${idx}:</span>
                <input type="text" class="crit-desc" value="${escapeHtml(lvl)}" placeholder="Level ${idx} rubric">
                <button class="btn-crit-del" title="Remove level">&times;</button>
            `;

            row.querySelector('.crit-desc').addEventListener('input', (e) => {
                crit[idx] = e.target.value;
            });

            row.querySelector('.btn-crit-del').addEventListener('click', () => {
                crit.splice(idx, 1);
                renderCriteriaBoxContent(box, qid, q);
            });

            box.appendChild(row);
        });

        const btnAdd = document.createElement('button');
        btnAdd.className = 'btn-add-crit';
        btnAdd.textContent = '+ Add Score Level';
        btnAdd.addEventListener('click', () => {
            crit.push(`Level ${crit.length} description`);
            renderCriteriaBoxContent(box, qid, q);
        });

        box.appendChild(btnAdd);

    } else if (q.type === 'noul') {
        const hint = document.createElement('div');
        hint.style.fontSize = '11.5px';
        hint.style.color = 'var(--text-muted)';
        hint.innerHTML = '<strong>Boolean Primitive:</strong> Evaluates condition probability (0.0 to 1.0). No criteria definition required.';
        box.appendChild(hint);
    }
}

function addNewQuestion() {
    const baseName = "decision_eval";
    let counter = 1;
    let key = `${baseName}_${counter}`;
    while (state.questions[key]) {
        counter++;
        key = `${baseName}_${counter}`;
    }

    state.questions[key] = {
        type: "choice",
        instructions: "Evaluate the optimal choice for the given input state",
        criteria: {
            "yes": "Applicable / Optimal",
            "no": "Inapplicable / Reject"
        }
    };

    renderVisualQuestions();
    showToast(`Added question: ${key}`, 'info');
}

function syncFromRawJson() {
    try {
        const parsed = JSON.parse(elements.rawQuestionsInput.value);
        if (typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Questions must be a JSON object (dictionary)');
        }
        state.questions = parsed;
        renderVisualQuestions();
        setQuestionsMode('visual');
        showToast('Synced to Visual Builder', 'success');
    } catch (e) {
        showToast('JSON Error: ' + e.message, 'error');
    }
}

// ==============================================================================
// Execution & Prediction Logic
// ==============================================================================
async function executeDecision() {
    let statePayload = elements.stateInput.value.trim();
    if (state.stateMode === 'json') {
        try {
            statePayload = JSON.parse(statePayload);
        } catch (e) {
            showToast('Invalid input state JSON format', 'error');
            return;
        }
    }

    if (state.questionsMode === 'raw') {
        try {
            state.questions = JSON.parse(elements.rawQuestionsInput.value);
        } catch (e) {
            showToast('Invalid questions JSON schema', 'error');
            return;
        }
    }

    if (Object.keys(state.questions).length === 0) {
        showToast('Please specify at least one decision question', 'error');
        return;
    }

    elements.btnExecute.disabled = true;
    elements.btnExecute.innerHTML = `
        <span class="pulse-dot"></span>
        <span>EVALUATING FORWARD PASS...</span>
    `;
    elements.metricLatency.textContent = '...';

    const maxLenVal = elements.contextLenSelect.value ? parseInt(elements.contextLenSelect.value) : null;

    const payload = {
        state: statePayload,
        questions: state.questions,
        model_mode: elements.modelSelect.value,
        backend: elements.backendSelect.value,
        precision: elements.precisionSelect.value,
        local_path: state.localPath,
        force_offline: elements.chkForceOffline.checked,
        max_len: maxLenVal
    };

    try {
        const response = await fetch('/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || 'Server execution error');
        }

        const result = await response.json();
        state.lastResult = result;

        renderDecisionResults(result);
        updateCodeSnippets(payload, result);
        showToast(`Inference completed in ${result.elapsed_ms} ms`, 'success');

    } catch (err) {
        showToast(`Execution failed: ${err.message}`, 'error');
        console.error(err);
    } finally {
        elements.btnExecute.disabled = false;
        elements.btnExecute.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span>RUN DECISION PASS</span>
            <span class="key-shortcut">Ctrl+Enter</span>
        `;
    }
}

function renderDecisionResults(res) {
    elements.emptyState.classList.add('hidden');
    elements.decisionsList.classList.remove('hidden');

    elements.metricLatency.textContent = `${res.elapsed_ms} ms`;
    elements.metricModel.textContent = res.model_used || res.model_mode;
    elements.metricCount.textContent = `${res.questions_count} / pass`;
    elements.metricWeights.textContent = res.is_local_weights ? 'Local (Air-Gapped)' : 'Hugging Face Hub';

    elements.decisionsList.innerHTML = '';
    const answers = res.answers || {};

    Object.entries(answers).forEach(([qid, ans]) => {
        const card = createDecisionResultCard(qid, ans);
        elements.decisionsList.appendChild(card);
    });
}

function createDecisionResultCard(qid, ans) {
    const card = document.createElement('div');
    card.className = 'decision-card';

    const qDef = state.questions[qid] || {};
    const qType = ans.type || qDef.type || 'unknown';
    const instructions = qDef.instructions || 'Decision assessment';

    const confVal = ans.answer_confidence !== undefined ? ans.answer_confidence : (ans.confidence || 0);
    const confPct = Math.round(confVal * 1000) / 10;
    const confClass = confPct >= 80 ? 'conf-high' : (confPct >= 50 ? 'conf-mid' : 'conf-low');

    let verdictHtml = '';
    let probBarsHtml = '';

    if (qType === 'choice') {
        const choice = ans.choice || 'N/A';
        const probs = ans.probabilities || {};

        verdictHtml = `
            <div class="verdict-info">
                <span class="verdict-heading">OPTIMAL CHOICE</span>
                <span class="verdict-tag">${escapeHtml(choice)}</span>
            </div>
            <div class="conf-indicator">
                <span class="conf-meta">CONFIDENCE</span>
                <span class="conf-score ${confClass}">${confPct}%</span>
            </div>
        `;

        probBarsHtml = Object.entries(probs).map(([k, p]) => {
            const isWinner = k === choice;
            const pct = Math.round(p * 1000) / 10;
            return `
                <div class="meter-row">
                    <div class="meter-labels">
                        <span class="meter-name ${isWinner ? 'winner' : ''}">${escapeHtml(k)}</span>
                        <span class="meter-percent">${pct}%</span>
                    </div>
                    <div class="meter-bar">
                        <div class="meter-progress ${isWinner ? 'winner' : ''}" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
        }).join('');

    } else if (qType === 'score') {
        const expScore = ans.score !== undefined ? ans.score : 0;
        const legend = ans.legend || {};
        const probs = ans.probabilities || {};

        const roundLevel = Math.round(expScore).toString();
        const levelLabel = legend[roundLevel] || `Level ${expScore}`;

        verdictHtml = `
            <div class="verdict-info">
                <span class="verdict-heading">EXPECTED SCORE</span>
                <span class="verdict-tag">${expScore} <small style="font-size: 11.5px; font-weight: normal; color: var(--text-muted);">(${escapeHtml(levelLabel)})</small></span>
            </div>
            <div class="conf-indicator">
                <span class="conf-meta">CONFIDENCE</span>
                <span class="conf-score ${confClass}">${confPct}%</span>
            </div>
        `;

        probBarsHtml = Object.entries(probs).map(([lvl, p]) => {
            const label = legend[lvl] || `Level ${lvl}`;
            const pct = Math.round(p * 1000) / 10;
            const isMax = p === Math.max(...Object.values(probs));
            return `
                <div class="meter-row">
                    <div class="meter-labels">
                        <span class="meter-name ${isMax ? 'winner' : ''}">[${lvl}] ${escapeHtml(label)}</span>
                        <span class="meter-percent">${pct}%</span>
                    </div>
                    <div class="meter-bar">
                        <div class="meter-progress ${isMax ? 'winner' : ''}" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
        }).join('');

    } else if (qType === 'noul') {
        const pTrue = ans.noul !== undefined ? ans.noul : 0;
        const isTrue = pTrue >= 0.5;
        const pTruePct = Math.round(pTrue * 1000) / 10;
        const pFalsePct = Math.round((1 - pTrue) * 1000) / 10;

        verdictHtml = `
            <div class="verdict-info">
                <span class="verdict-heading">CONDITION VERDICT (P ≥ 0.5)</span>
                <span class="verdict-tag ${isTrue ? 'positive' : 'negative'}">
                    ${isTrue ? 'TRUE' : 'FALSE'}
                    <small style="font-size: 11.5px; font-weight: normal; color: var(--text-muted); margin-left: 6px;">(P = ${pTrue})</small>
                </span>
            </div>
            <div class="conf-indicator">
                <span class="conf-meta">CALIBRATED PROB</span>
                <span class="conf-score ${confClass}">${confPct}%</span>
            </div>
        `;

        probBarsHtml = `
            <div class="meter-row">
                <div class="meter-labels">
                    <span class="meter-name ${isTrue ? 'winner' : ''}">True</span>
                    <span class="meter-percent">${pTruePct}%</span>
                </div>
                <div class="meter-bar">
                    <div class="meter-progress ${isTrue ? 'winner' : ''}" style="width: ${pTruePct}%"></div>
                </div>
            </div>
            <div class="meter-row">
                <div class="meter-labels">
                    <span class="meter-name ${!isTrue ? 'winner' : ''}">False</span>
                    <span class="meter-percent">${pFalsePct}%</span>
                </div>
                <div class="meter-bar">
                    <div class="meter-progress ${!isTrue ? 'winner' : ''}" style="width: ${pFalsePct}%"></div>
                </div>
            </div>
        `;
    }

    card.innerHTML = `
        <div class="decision-card-head">
            <span class="qid-text">${escapeHtml(qid)}</span>
            <span class="qtype-pill ${qType}">${qType}</span>
        </div>
        <div class="decision-prompt">${escapeHtml(instructions)}</div>
        <div class="verdict-box">
            ${verdictHtml}
        </div>
        <div class="distribution-box">
            <span class="dist-heading">PROBABILITY DISTRIBUTION</span>
            ${probBarsHtml}
        </div>
    `;

    return card;
}

// ==============================================================================
// Code Snippets Generator
// ==============================================================================
async function updateCodeSnippets(reqPayload, result) {
    try {
        const res = await fetch('/api/code-snippet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqPayload)
        });
        if (res.ok) {
            const data = await res.json();
            state.cachedSnippets = {
                py: data.python_sdk,
                curl: data.curl,
                json: JSON.stringify(result, null, 2)
            };
            renderSnippetTab();
        }
    } catch (e) {
        console.error('Code snippet generation failed:', e);
    }
}

function renderSnippetTab() {
    if (!state.cachedSnippets || !elements.snippetCode) return;
    elements.snippetCode.textContent = state.cachedSnippets[state.activeSnippetTab] || '';
}

function setSnippetTab(tab) {
    state.activeSnippetTab = tab;
    elements.tabSnippetPy?.classList.toggle('active', tab === 'py');
    elements.tabSnippetCurl?.classList.toggle('active', tab === 'curl');
    elements.tabSnippetJson?.classList.toggle('active', tab === 'json');
    renderSnippetTab();
}

function copyCodeSnippet() {
    const text = elements.snippetCode?.textContent;
    if (!text || text.startsWith('//')) return;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied code snippet to clipboard', 'success');
    }).catch(e => {
        showToast('Clipboard copy failed: ' + e.message, 'error');
    });
}

// ==============================================================================
// Settings & Offline Path Inspection
// ==============================================================================
function openSettingsModal() {
    elements.settingsModal.classList.remove('hidden');
    elements.inputLocalPath.value = state.localPath;
    elements.chkModalOffline.checked = state.forceOffline;
    inspectCurrentPath(state.localPath);
}

function closeSettingsModal() {
    elements.settingsModal.classList.add('hidden');
}

async function inspectCurrentPath(path) {
    elements.btnValidateLocalPath.disabled = true;
    elements.btnValidateLocalPath.textContent = 'Inspecting...';

    try {
        const res = await fetch('/api/inspect-path', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: path })
        });
        const data = await res.json();

        elements.stFolderExists.className = `badge-status ${data.exists ? 'success' : 'fail'}`;
        elements.stFolderExists.textContent = data.exists ? 'Available' : 'Missing';

        elements.stCkptEnglish.className = `badge-status ${data.checkpoints.english ? 'success' : 'fail'}`;
        elements.stCkptEnglish.textContent = data.checkpoints.english ? 'Ready' : 'Not Found';

        elements.stCkptMulti.className = `badge-status ${data.checkpoints.multilingual ? 'success' : 'fail'}`;
        elements.stCkptMulti.textContent = data.checkpoints.multilingual ? 'Ready' : 'Not Found';

        elements.stCkptTyped.className = `badge-status ${data.checkpoints['typed-decisions'] ? 'success' : 'fail'}`;
        elements.stCkptTyped.textContent = data.checkpoints['typed-decisions'] ? 'Ready' : 'Not Found';

        elements.stTotalSize.textContent = `${data.total_size_mb} MB`;

        if (!data.exists || !data.checkpoints.english) {
            elements.missingFilesAlert.classList.remove('hidden');
            elements.missingFilesAlert.innerHTML = `
                <strong>Offline weights incomplete:</strong><br>
                Run download script: <code>python download_models.py --output-dir "${escapeHtml(path)}" --checkpoint all</code>
            `;
        } else {
            elements.missingFilesAlert.classList.add('hidden');
        }

    } catch (e) {
        showToast('Path inspection failed: ' + e.message, 'error');
    } finally {
        elements.btnValidateLocalPath.disabled = false;
        elements.btnValidateLocalPath.textContent = 'Inspect Path';
    }
}

function saveSettings() {
    const newPath = elements.inputLocalPath.value.trim() || './models/openvino';
    const newOffline = elements.chkModalOffline.checked;

    state.localPath = newPath;
    state.forceOffline = newOffline;

    localStorage.setItem('laya_local_path', newPath);
    localStorage.setItem('laya_force_offline', newOffline.toString());

    elements.activePathText.textContent = newPath;
    elements.chkForceOffline.checked = newOffline;

    closeSettingsModal();
    showToast('Saved local configuration', 'success');
    fetchSystemStatus();
}

// ==============================================================================
// Event Listeners Setup
// ==============================================================================
function setupEventListeners() {
    // Theme
    elements.btnTheme?.addEventListener('click', toggleTheme);

    // State Input Tabs
    elements.btnStateJson?.addEventListener('click', () => setStateMode('json'));
    elements.btnStateText?.addEventListener('click', () => setStateMode('text'));
    elements.stateInput?.addEventListener('input', updateStateStats);
    elements.btnFormatJson?.addEventListener('click', formatJsonState);

    // Questions Tabs
    elements.btnModeVisual?.addEventListener('click', () => setQuestionsMode('visual'));
    elements.btnModeRawJson?.addEventListener('click', () => setQuestionsMode('raw'));
    elements.btnAddQuestion?.addEventListener('click', addNewQuestion);
    elements.btnSyncVisual?.addEventListener('click', syncFromRawJson);

    // Execution
    elements.btnExecute?.addEventListener('click', executeDecision);
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            executeDecision();
        }
    });

    // Backend toggle
    elements.backendSelect?.addEventListener('change', (e) => {
        const isOv = e.target.value === 'openvino';
        if (elements.precisionField) {
            elements.precisionField.style.display = isOv ? 'flex' : 'none';
        }
        showToast(isOv ? 'Intel OpenVINO Runtime active (AMX/VNNI)' : 'PyTorch CPU Engine active', 'info');
    });

    // Snippet tabs
    elements.tabSnippetPy?.addEventListener('click', () => setSnippetTab('py'));
    elements.tabSnippetCurl?.addEventListener('click', () => setSnippetTab('curl'));
    elements.tabSnippetJson?.addEventListener('click', () => setSnippetTab('json'));
    elements.btnCopySnippet?.addEventListener('click', copyCodeSnippet);

    // Settings Modal
    elements.btnSettings?.addEventListener('click', openSettingsModal);
    elements.btnCloseSettings?.addEventListener('click', closeSettingsModal);
    elements.btnCancelSettings?.addEventListener('click', closeSettingsModal);
    elements.btnSaveSettings?.addEventListener('click', saveSettings);
    elements.btnValidateLocalPath?.addEventListener('click', () => inspectCurrentPath(elements.inputLocalPath.value.trim()));

    elements.chkForceOffline?.addEventListener('change', (e) => {
        state.forceOffline = e.target.checked;
        localStorage.setItem('laya_force_offline', state.forceOffline.toString());
        showToast(state.forceOffline ? 'Air-gapped mode active' : 'Air-gapped mode disabled', 'info');
    });

    // Help Modal
    elements.btnHelp?.addEventListener('click', () => elements.helpModal?.classList.remove('hidden'));
    elements.btnCloseHelp?.addEventListener('click', () => elements.helpModal?.classList.add('hidden'));
    elements.btnCloseHelpFooter?.addEventListener('click', () => elements.helpModal?.classList.add('hidden'));

    // Modal click-outside
    window.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) closeSettingsModal();
        if (e.target === elements.helpModal) elements.helpModal.classList.add('hidden');
    });
}

// Start
document.addEventListener('DOMContentLoaded', initApp);
