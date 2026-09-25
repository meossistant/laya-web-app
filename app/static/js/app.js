/**
 * Laya — System 1 Decision Engine (Jev-Style Web Client)
 * Handles interactive decision playground, visual question builder, offline path validation,
 * probability meter rendering, and code generation.
 */

// Application State
const state = {
    currentPresetId: null,
    presets: [],
    stateMode: 'json', // 'json' or 'text'
    questionsMode: 'visual', // 'visual' or 'raw'
    questions: {},
    localPath: './models/laya',
    forceOffline: false,
    hardware: null,
    lastResult: null,
    activeSnippetTab: 'py' // 'py', 'curl', 'json'
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
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.2s';
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

function setupTheme() {
    const savedTheme = localStorage.getItem('laya_theme') || 'dark';
    if (savedTheme === 'light') {
        elements.html.classList.remove('dark');
        elements.html.classList.add('light');
    } else {
        elements.html.classList.remove('light');
        elements.html.classList.add('dark');
    }
}

function toggleTheme() {
    if (elements.html.classList.contains('dark')) {
        elements.html.classList.remove('dark');
        elements.html.classList.add('light');
        localStorage.setItem('laya_theme', 'light');
    } else {
        elements.html.classList.remove('light');
        elements.html.classList.add('dark');
        localStorage.setItem('laya_theme', 'dark');
    }
}

function loadPersistedSettings() {
    const savedPath = localStorage.getItem('laya_local_path') || './models/laya';
    state.localPath = savedPath;
    elements.inputLocalPath.value = savedPath;
    elements.activePathText.textContent = savedPath;

    const savedOffline = localStorage.getItem('laya_force_offline') === 'true';
    state.forceOffline = savedOffline;
    elements.chkForceOffline.checked = savedOffline;
    elements.chkModalOffline.checked = savedOffline;
}

// ==============================================================================
// System Status & Presets
// ==============================================================================
async function fetchSystemStatus() {
    try {
        const res = await fetch('/api/status');
        if (!res.ok) throw new Error('Không thể kết nối API status');
        const data = await res.json();
        
        state.hardware = data.hardware;
        
        // Update hardware badge
        const devName = data.hardware.cuda_available ? (data.hardware.device_name || 'CUDA') : 'CPU';
        elements.hwBadge.textContent = `💻 Hardware: ${devName}`;

        // Update local models status
        const local = data.local_model_status;
        if (local && local.exists && (local.checkpoints.english || local.checkpoints.multilingual)) {
            elements.sourceBadge.textContent = `🔒 Local Offline (${local.total_size_mb} MB)`;
            elements.sourceBadge.classList.add('badge-pulse');
        } else {
            elements.sourceBadge.textContent = `🌐 HF Hub (${data.default_hub_repo})`;
        }
    } catch (err) {
        elements.sourceBadge.textContent = `⚠️ Lỗi kết nối API`;
        console.error('Lỗi khi fetch status:', err);
    }
}

async function fetchPresets() {
    try {
        const res = await fetch('/api/presets');
        if (!res.ok) throw new Error('Lỗi tải presets');
        state.presets = await res.json();
        renderPresetsBar();
        // Load the first preset by default
        if (state.presets.length > 0) {
            applyPreset(state.presets[0].id);
        }
    } catch (err) {
        showToast('Không thể tải danh sách mẫu tác vụ: ' + err.message, 'error');
    }
}

function renderPresetsBar() {
    elements.presetsList.innerHTML = '';
    state.presets.forEach(p => {
        const btn = document.createElement('button');
        btn.className = `preset-chip ${p.id === state.currentPresetId ? 'active' : ''}`;
        btn.dataset.presetId = p.id;
        btn.innerHTML = `
            <span>${p.name}</span>
            <span class="chip-badge">${p.badge}</span>
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
    showToast(`Đã nạp mẫu tác vụ: "${preset.name}"`, 'info');
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
    elements.stateStats.textContent = `${chars.toLocaleString()} ký tự · ${lines} dòng`;
}

function formatJsonState() {
    try {
        const parsed = JSON.parse(elements.stateInput.value);
        elements.stateInput.value = JSON.stringify(parsed, null, 2);
        updateStateStats();
        showToast('Đã định dạng JSON chuẩn!', 'success');
    } catch (e) {
        showToast('Văn bản không phải JSON hợp lệ: ' + e.message, 'error');
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
        // Update raw JSON from current state
        elements.rawQuestionsInput.value = JSON.stringify(state.questions, null, 2);
    }
}

function renderVisualQuestions() {
    elements.questionsList.innerHTML = '';
    const qIds = Object.keys(state.questions);

    if (qIds.length === 0) {
        elements.questionsList.innerHTML = `
            <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">
                Chưa có câu hỏi nào. Nhấn "+ Thêm câu hỏi mới" bên dưới.
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
    card.className = 'question-card';
    card.dataset.qid = qid;

    // Header with key, type selector and delete
    const header = document.createElement('div');
    header.className = 'q-header';
    header.innerHTML = `
        <div class="q-id-group">
            <input type="text" class="q-key-input" value="${escapeHtml(qid)}" title="Tên định danh câu hỏi">
            <select class="q-type-select">
                <option value="choice" ${q.type === 'choice' ? 'selected' : ''}>Choice (Phân loại)</option>
                <option value="score" ${q.type === 'score' ? 'selected' : ''}>Score (Chấm điểm)</option>
                <option value="noul" ${q.type === 'noul' ? 'selected' : ''}>Noul (Xác suất Đúng/Sai)</option>
            </select>
        </div>
        <button class="btn-remove-q" title="Xóa câu hỏi này">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;

    // Instruction field
    const instructionInput = document.createElement('input');
    instructionInput.type = 'text';
    instructionInput.className = 'q-instruction-input';
    instructionInput.value = q.instructions || '';
    instructionInput.placeholder = 'Nhập câu hỏi hoặc chỉ dẫn đánh giá (instructions)...';

    // Criteria Container
    const criteriaBox = document.createElement('div');
    criteriaBox.className = 'q-criteria-box';
    renderCriteriaBoxContent(criteriaBox, qid, q);

    card.appendChild(header);
    card.appendChild(instructionInput);
    card.appendChild(criteriaBox);

    // Event Listeners for this card
    const keyInput = header.querySelector('.q-key-input');
    keyInput.addEventListener('change', (e) => {
        const newKey = e.target.value.trim().replace(/\s+/g, '_');
        if (!newKey || newKey === qid) return;
        if (state.questions[newKey]) {
            showToast(`Key "${newKey}" đã tồn tại!`, 'error');
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
            q.criteria = { "option_a": "Mô tả lựa chọn A", "option_b": "Mô tả lựa chọn B" };
        } else if (newType === 'score' && (!q.criteria || !Array.isArray(q.criteria))) {
            q.criteria = ["thấp (low)", "trung bình (medium)", "cao (high)"];
        } else if (newType === 'noul') {
            delete q.criteria;
        }
        renderCriteriaBoxContent(criteriaBox, qid, q);
    });

    instructionInput.addEventListener('input', (e) => {
        q.instructions = e.target.value;
    });

    const btnRemove = header.querySelector('.btn-remove-q');
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
        title.className = 'criteria-title';
        title.textContent = 'Danh sách các lựa chọn (Options):';
        box.appendChild(title);

        const list = document.createElement('div');
        list.className = 'criteria-list';

        const crit = q.criteria || {};
        Object.entries(crit).forEach(([optKey, optDesc]) => {
            const row = document.createElement('div');
            row.className = 'criteria-row';
            row.innerHTML = `
                <input type="text" class="crit-key" value="${escapeHtml(optKey)}" placeholder="Mã lựa chọn">
                <input type="text" class="crit-desc" value="${escapeHtml(optDesc)}" placeholder="Mô tả / tiêu chí lựa chọn">
                <button class="btn-crit-del" title="Xóa lựa chọn">&times;</button>
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

            list.appendChild(row);
        });

        const btnAdd = document.createElement('button');
        btnAdd.className = 'btn-add-crit';
        btnAdd.textContent = '+ Thêm Option';
        btnAdd.addEventListener('click', () => {
            const newIndex = Object.keys(crit).length + 1;
            crit[`option_${newIndex}`] = `Mô tả lựa chọn ${newIndex}`;
            renderCriteriaBoxContent(box, qid, q);
        });

        box.appendChild(list);
        box.appendChild(btnAdd);

    } else if (q.type === 'score') {
        const title = document.createElement('div');
        title.className = 'criteria-title';
        title.textContent = 'Thang bậc điểm (Ordered Rubric):';
        box.appendChild(title);

        const list = document.createElement('div');
        list.className = 'criteria-list';

        const crit = Array.isArray(q.criteria) ? q.criteria : [];
        crit.forEach((lvl, idx) => {
            const row = document.createElement('div');
            row.className = 'criteria-row';
            row.innerHTML = `
                <span style="font-family: var(--font-mono); font-size: 11px; width: 24px; color: var(--text-muted);">${idx}:</span>
                <input type="text" class="crit-desc" value="${escapeHtml(lvl)}" placeholder="Mô tả mức điểm ${idx}">
                <button class="btn-crit-del" title="Xóa mức này">&times;</button>
            `;

            row.querySelector('.crit-desc').addEventListener('input', (e) => {
                crit[idx] = e.target.value;
            });

            row.querySelector('.btn-crit-del').addEventListener('click', () => {
                crit.splice(idx, 1);
                renderCriteriaBoxContent(box, qid, q);
            });

            list.appendChild(row);
        });

        const btnAdd = document.createElement('button');
        btnAdd.className = 'btn-add-crit';
        btnAdd.textContent = '+ Thêm mức điểm';
        btnAdd.addEventListener('click', () => {
            crit.push(`mức điểm ${crit.length}`);
            renderCriteriaBoxContent(box, qid, q);
        });

        box.appendChild(list);
        box.appendChild(btnAdd);

    } else if (q.type === 'noul') {
        const hint = document.createElement('div');
        hint.style.fontSize = '11.5px';
        hint.style.color = 'var(--text-muted)';
        hint.innerHTML = '⚖️ <strong>Noul Primitive:</strong> Đánh giá xác suất mệnh đề là Đúng (Yes/True: <code>0.0 → 1.0</code>). Không cần khai báo criteria.';
        box.appendChild(hint);
    }
}

function addNewQuestion() {
    const baseName = "new_question";
    let counter = 1;
    let key = `${baseName}_${counter}`;
    while (state.questions[key]) {
        counter++;
        key = `${baseName}_${counter}`;
    }

    state.questions[key] = {
        type: "choice",
        instructions: "Đánh giá lựa chọn phù hợp nhất?",
        criteria: {
            "yes": "Đồng ý / Phù hợp",
            "no": "Không đồng ý / Không phù hợp"
        }
    };

    renderVisualQuestions();
    showToast(`Đã thêm câu hỏi: ${key}`, 'info');
}

function syncFromRawJson() {
    try {
        const parsed = JSON.parse(elements.rawQuestionsInput.value);
        if (typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Questions phải là một JSON Object (Dictionary).');
        }
        state.questions = parsed;
        renderVisualQuestions();
        setQuestionsMode('visual');
        showToast('Đã đồng bộ sang Visual Builder thành công!', 'success');
    } catch (e) {
        showToast('Lỗi JSON: ' + e.message, 'error');
    }
}

// ==============================================================================
// Execution & Prediction Logic
// ==============================================================================
async function executeDecision() {
    // Parse state
    let statePayload = elements.stateInput.value.trim();
    if (state.stateMode === 'json') {
        try {
            statePayload = JSON.parse(statePayload);
        } catch (e) {
            showToast('Lỗi: Định dạng Input State JSON không hợp lệ!', 'error');
            return;
        }
    }

    // Sync questions
    if (state.questionsMode === 'raw') {
        try {
            state.questions = JSON.parse(elements.rawQuestionsInput.value);
        } catch (e) {
            showToast('Lỗi: Định dạng Questions JSON không hợp lệ!', 'error');
            return;
        }
    }

    if (Object.keys(state.questions).length === 0) {
        showToast('Vui lòng thêm ít nhất một câu hỏi!', 'error');
        return;
    }

    // Prepare UI for loading
    elements.btnExecute.disabled = true;
    elements.btnExecute.innerHTML = `
        <span class="pulse-dot"></span>
        <span>ĐANG TÍNH TOÁN FORWARD PASS...</span>
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
            throw new Error(errData.detail || 'Lỗi server khi thực thi');
        }

        const result = await response.json();
        state.lastResult = result;

        // Render Results
        renderDecisionResults(result);
        updateCodeSnippets(payload, result);
        showToast(`Hoàn tất trong ${result.elapsed_ms} ms!`, 'success');

    } catch (err) {
        showToast(`Thất bại: ${err.message}`, 'error');
        console.error(err);
    } finally {
        elements.btnExecute.disabled = false;
        elements.btnExecute.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            <span>THỰC THI QUYẾT ĐỊNH (SINGLE PASS)</span>
            <kbd class="kbd-shortcut">Ctrl+Enter</kbd>
        `;
    }
}

function renderDecisionResults(res) {
    elements.emptyState.classList.add('hidden');
    elements.decisionsList.classList.remove('hidden');

    // Update Metrics Strip
    elements.metricLatency.textContent = `⚡ ${res.elapsed_ms} ms`;
    elements.metricModel.textContent = res.model_used || res.model_mode;
    elements.metricCount.textContent = `${res.questions_count} quyết định / 1 pass`;
    elements.metricWeights.textContent = res.is_local_weights ? '🔒 Local Weights' : '🌐 Hugging Face Hub';

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
    const instructions = qDef.instructions || 'Quyết định đánh giá';

    // Format Confidence
    const confVal = ans.answer_confidence !== undefined ? ans.answer_confidence : (ans.confidence || 0);
    const confPct = Math.round(confVal * 1000) / 10;
    const confClass = confPct >= 80 ? 'conf-high' : (confPct >= 50 ? 'conf-mid' : 'conf-low');

    // Winner Verdict & Details
    let verdictHtml = '';
    let probBarsHtml = '';

    if (qType === 'choice') {
        const choice = ans.choice || 'N/A';
        const probs = ans.probabilities || {};

        verdictHtml = `
            <div class="verdict-main">
                <span class="verdict-title">Lựa chọn tối ưu (Choice)</span>
                <span class="verdict-pill is-choice">🎯 ${escapeHtml(choice)}</span>
            </div>
            <div class="conf-box">
                <span class="conf-label">Độ tin cậy chuẩn hóa (ECE)</span>
                <span class="conf-score ${confClass}">${confPct}%</span>
            </div>
        `;

        // Build probability bars for all options
        probBarsHtml = Object.entries(probs).map(([k, p]) => {
            const isWinner = k === choice;
            const pct = Math.round(p * 1000) / 10;
            return `
                <div class="prob-meter-row">
                    <div class="meter-meta">
                        <span class="meter-key ${isWinner ? 'winner' : ''}">${isWinner ? '✓ ' : ''}${escapeHtml(k)}</span>
                        <span class="meter-pct">${pct}%</span>
                    </div>
                    <div class="meter-track">
                        <div class="meter-fill ${isWinner ? 'winner' : ''}" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
        }).join('');

    } else if (qType === 'score') {
        const expScore = ans.score !== undefined ? ans.score : 0;
        const legend = ans.legend || {};
        const probs = ans.probabilities || {};

        // Find nearest integer level for legend description
        const roundLevel = Math.round(expScore).toString();
        const levelLabel = legend[roundLevel] || `Mức ${expScore}`;

        verdictHtml = `
            <div class="verdict-main">
                <span class="verdict-title">Điểm số kỳ vọng (Expected Score)</span>
                <span class="verdict-pill is-score">📊 ${expScore} <small style="font-size: 12px; font-weight: normal; opacity: 0.85;">(${escapeHtml(levelLabel)})</small></span>
            </div>
            <div class="conf-box">
                <span class="conf-label">Độ tin cậy</span>
                <span class="conf-score ${confClass}">${confPct}%</span>
            </div>
        `;

        probBarsHtml = Object.entries(probs).map(([lvl, p]) => {
            const label = legend[lvl] || `Level ${lvl}`;
            const pct = Math.round(p * 1000) / 10;
            const isMax = p === Math.max(...Object.values(probs));
            return `
                <div class="prob-meter-row">
                    <div class="meter-meta">
                        <span class="meter-key ${isMax ? 'winner' : ''}">[${lvl}] ${escapeHtml(label)}</span>
                        <span class="meter-pct">${pct}%</span>
                    </div>
                    <div class="meter-track">
                        <div class="meter-fill ${isMax ? 'winner' : ''}" style="width: ${pct}%"></div>
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
            <div class="verdict-main">
                <span class="verdict-title">Xác suất điều kiện (P(True))</span>
                <span class="verdict-pill ${isTrue ? 'is-positive' : 'is-negative'}">
                    ${isTrue ? '✅ ĐÚNG (YES)' : '❌ SAI (NO)'}
                    <small style="font-size: 13px; font-weight: normal; margin-left: 6px;">P = ${pTrue}</small>
                </span>
            </div>
            <div class="conf-box">
                <span class="conf-label">Calibrated Confidence</span>
                <span class="conf-score ${confClass}">${confPct}%</span>
            </div>
        `;

        probBarsHtml = `
            <div class="prob-meter-row">
                <div class="meter-meta">
                    <span class="meter-key ${isTrue ? 'winner' : ''}">Đúng (True / Yes)</span>
                    <span class="meter-pct">${pTruePct}%</span>
                </div>
                <div class="meter-track">
                    <div class="meter-fill ${isTrue ? 'winner' : ''}" style="width: ${pTruePct}%"></div>
                </div>
            </div>
            <div class="prob-meter-row">
                <div class="meter-meta">
                    <span class="meter-key ${!isTrue ? 'winner' : ''}">Sai (False / No)</span>
                    <span class="meter-pct">${pFalsePct}%</span>
                </div>
                <div class="meter-track">
                    <div class="meter-fill ${!isTrue ? 'winner' : ''}" style="width: ${pFalsePct}%"></div>
                </div>
            </div>
        `;
    }

    card.innerHTML = `
        <div class="card-top">
            <span class="card-qid">${escapeHtml(qid)}</span>
            <div class="card-badges">
                <span class="qtype-pill qtype-${qType}">${qType}</span>
            </div>
        </div>
        <div class="card-instruction">"${escapeHtml(instructions)}"</div>
        <div class="verdict-row">
            ${verdictHtml}
        </div>
        <div class="prob-section">
            <div class="prob-header">Phân bố xác suất chuẩn hóa (Probability Distribution)</div>
            <div class="prob-meters">
                ${probBarsHtml}
            </div>
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
        console.error('Lỗi sinh code snippet:', e);
    }
}

function renderSnippetTab() {
    if (!state.cachedSnippets) return;
    elements.snippetCode.textContent = state.cachedSnippets[state.activeSnippetTab] || '';
}

function setSnippetTab(tab) {
    state.activeSnippetTab = tab;
    elements.tabSnippetPy.classList.toggle('active', tab === 'py');
    elements.tabSnippetCurl.classList.toggle('active', tab === 'curl');
    elements.tabSnippetJson.classList.toggle('active', tab === 'json');
    renderSnippetTab();
}

function copyCodeSnippet() {
    const text = elements.snippetCode.textContent;
    if (!text || text.startsWith('//')) return;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Đã copy đoạn mã vào Clipboard!', 'success');
    }).catch(e => {
        showToast('Không thể copy: ' + e.message, 'error');
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
    elements.btnValidateLocalPath.textContent = 'Đang kiểm tra...';

    try {
        const res = await fetch('/api/inspect-path', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: path })
        });
        const data = await res.json();

        // Update UI
        elements.stFolderExists.className = `status-badge ${data.exists ? 'badge-ok' : 'badge-missing'}`;
        elements.stFolderExists.textContent = data.exists ? 'Tồn tại' : 'Không tìm thấy';

        elements.stCkptEnglish.className = `status-badge ${data.checkpoints.english ? 'badge-ok' : 'badge-missing'}`;
        elements.stCkptEnglish.textContent = data.checkpoints.english ? 'Sẵn sàng' : 'Chưa có';

        elements.stCkptMulti.className = `status-badge ${data.checkpoints.multilingual ? 'badge-ok' : 'badge-missing'}`;
        elements.stCkptMulti.textContent = data.checkpoints.multilingual ? 'Sẵn sàng' : 'Chưa có';

        elements.stCkptTyped.className = `status-badge ${data.checkpoints['typed-decisions'] ? 'badge-ok' : 'badge-missing'}`;
        elements.stCkptTyped.textContent = data.checkpoints['typed-decisions'] ? 'Sẵn sàng' : 'Chưa có';

        elements.stTotalSize.textContent = `${data.total_size_mb} MB`;

        if (!data.exists || !data.checkpoints.english) {
            elements.missingFilesAlert.classList.remove('hidden');
            elements.missingFilesAlert.innerHTML = `
                ⚠️ <strong>Chưa có đủ tệp model offline:</strong><br>
                Hãy chạy lệnh: <code>python download_models.py --output-dir "${path}" --checkpoint all</code>
            `;
        } else {
            elements.missingFilesAlert.classList.add('hidden');
        }

    } catch (e) {
        showToast('Lỗi khi kiểm tra đường dẫn: ' + e.message, 'error');
    } finally {
        elements.btnValidateLocalPath.disabled = false;
        elements.btnValidateLocalPath.textContent = 'Kiểm tra đường dẫn';
    }
}

function saveSettings() {
    const newPath = elements.inputLocalPath.value.trim() || './models/laya';
    const newOffline = elements.chkModalOffline.checked;

    state.localPath = newPath;
    state.forceOffline = newOffline;

    localStorage.setItem('laya_local_path', newPath);
    localStorage.setItem('laya_force_offline', newOffline.toString());

    elements.activePathText.textContent = newPath;
    elements.chkForceOffline.checked = newOffline;

    closeSettingsModal();
    showToast('Đã lưu cấu hình Local & Offline!', 'success');
    fetchSystemStatus();
}

// ==============================================================================
// Event Listeners Setup
// ==============================================================================
function setupEventListeners() {
    // Theme
    elements.btnTheme.addEventListener('click', toggleTheme);

    // State Input Tabs
    elements.btnStateJson.addEventListener('click', () => setStateMode('json'));
    elements.btnStateText.addEventListener('click', () => setStateMode('text'));
    elements.stateInput.addEventListener('input', updateStateStats);
    elements.btnFormatJson.addEventListener('click', formatJsonState);

    // Questions Tabs
    elements.btnModeVisual.addEventListener('click', () => setQuestionsMode('visual'));
    elements.btnModeRawJson.addEventListener('click', () => setQuestionsMode('raw'));
    elements.btnAddQuestion.addEventListener('click', addNewQuestion);
    elements.btnSyncVisual.addEventListener('click', syncFromRawJson);

    // Execution
    elements.btnExecute.addEventListener('click', executeDecision);
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            executeDecision();
        }
    });

    // Backend toggle
    elements.backendSelect.addEventListener('change', (e) => {
        const isOv = e.target.value === 'openvino';
        elements.precisionField.style.display = isOv ? 'flex' : 'none';
        showToast(isOv ? 'Đã kích hoạt OpenVINO Runtime (Intel AMX/VNNI)' : 'Đã chuyển sang PyTorch Engine', 'info');
    });

    // Snippet tabs
    elements.tabSnippetPy.addEventListener('click', () => setSnippetTab('py'));
    elements.tabSnippetCurl.addEventListener('click', () => setSnippetTab('curl'));
    elements.tabSnippetJson.addEventListener('click', () => setSnippetTab('json'));
    elements.btnCopySnippet.addEventListener('click', copyCodeSnippet);

    // Settings Modal
    elements.btnSettings.addEventListener('click', openSettingsModal);
    elements.btnCloseSettings.addEventListener('click', closeSettingsModal);
    elements.btnCancelSettings.addEventListener('click', closeSettingsModal);
    elements.btnSaveSettings.addEventListener('click', saveSettings);
    elements.btnValidateLocalPath.addEventListener('click', () => inspectCurrentPath(elements.inputLocalPath.value.trim()));

    elements.chkForceOffline.addEventListener('change', (e) => {
        state.forceOffline = e.target.checked;
        localStorage.setItem('laya_force_offline', state.forceOffline.toString());
        showToast(state.forceOffline ? 'Đã BẬT chế độ bắt buộc Offline' : 'Đã TẮT chế độ bắt buộc Offline', 'info');
    });

    // Help Modal
    elements.btnHelp.addEventListener('click', () => elements.helpModal.classList.remove('hidden'));
    elements.btnCloseHelp.addEventListener('click', () => elements.helpModal.classList.add('hidden'));
    elements.btnCloseHelpFooter.addEventListener('click', () => elements.helpModal.classList.add('hidden'));

    // Modal click-outside
    window.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) closeSettingsModal();
        if (e.target === elements.helpModal) elements.helpModal.classList.add('hidden');
    });
}

// Start
document.addEventListener('DOMContentLoaded', initApp);
