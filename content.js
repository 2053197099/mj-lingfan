(() => {
  const ROOT_ID = "mj-flow-assistant-root";
  const STORE_KEY = "mjFlowState";
  const BUILD_LABEL = "1.0.12";
  const APP_NAME = "MJ 灵帆";

  const ASPECT_RATIOS = ["1:2", "9:16", "3:4", "1:1", "4:3", "16:9", "2:1"];
  const DEFAULT_SEND_INTERVAL_MIN = 10;
  const DEFAULT_SEND_INTERVAL_MAX = 30;
  const MAX_QUEUE_TASKS = 500;

  const SUFFIX_PRESETS = [
    { token: "@写实", label: "写实", value: "photorealistic, natural light, high detail --style raw" },
    { token: "@电影", label: "电影", value: "cinematic lighting, film still, rich color grading" },
    { token: "@产品", label: "产品", value: "studio product photography, clean background, premium details" },
    { token: "@人像", label: "人像", value: "portrait photography, soft key light, detailed skin texture" },
    { token: "@动漫", label: "动漫", value: "anime illustration, clean line art, expressive character design" },
    { token: "@插画", label: "插画", value: "editorial illustration, refined composition, textured details" },
    { token: "@建筑", label: "建筑", value: "architectural visualization, precise geometry, ambient light" },
    { token: "@高清", label: "高清", value: "ultra detailed, sharp focus, high quality" }
  ];

  const DEFAULT_VARIABLE_PRESET_VERSION = 1;
  const DEFAULT_VARIABLE_PRESETS = [
    {
      name: "中式场景 / 建筑空间",
      tag: "场景 / 建筑",
      values: [
        "floating chinese pavilion",
        "colossal eastern architecture",
        "cliffside temple",
        "suspended palace",
        "chinese corridor",
        "zen courtyard",
        "ancient chinese tower",
        "colossal pagoda",
        "temple in the mist",
        "eastern ruins",
        "ink-wash cityscape",
        "mountain chinese village",
        "oriental futuristic city"
      ]
    },
    {
      name: "东方自然风景",
      tag: "自然风景",
      values: [
        "golden ginkgo forest",
        "ink wash mountains",
        "eastern sea of clouds",
        "peach blossom sanctuary",
        "crimson maple valley",
        "deep bamboo forest",
        "misty mountains",
        "oriental lake",
        "sacred snowy mountain",
        "eastern wasteland"
      ]
    },
    {
      name: "东方动漫人物",
      tag: "人物 / 动漫",
      values: [
        "eastern girl",
        "ancient chinese boy",
        "uncanny beauty",
        "divine character",
        "white-haired girl",
        "eastern shrine maiden",
        "shan hai jing character",
        "eastern noble aura",
        "zen-inspired character",
        "cold aesthetic character"
      ]
    },
    {
      name: "东方怪诞 / 志怪",
      tag: "怪诞 / 志怪",
      values: [
        "eastern grotesque",
        "chinese folklore horror",
        "colossal creature horror",
        "shan hai jing beasts",
        "divine creature",
        "colossal eye creature",
        "eastern mythical beast",
        "distorted deity",
        "eldritch oriental creature",
        "uncanny buddhist aesthetic",
        "uncanny smile",
        "nightmare beast",
        "ancient creature",
        "colossal white deer",
        "divine black horse",
        "oriental cosmic horror"
      ]
    },
    {
      name: "宏观场景 / 世界观",
      tag: "宏观 / 世界观",
      values: [
        "colossal storytelling",
        "grand worldbuilding",
        "mega scale environment",
        "god-scale composition",
        "tiny human contrast",
        "end-of-world atmosphere",
        "epic composition",
        "giant creature and tiny humans",
        "eastern epic atmosphere",
        "ancient civilization ruins",
        "megastructure",
        "surreal scale"
      ]
    },
    {
      name: "氛围 / 高级感 / 封神词",
      tag: "氛围 / 高级感",
      values: [
        "visual poetry",
        "haunting beauty",
        "sacred loneliness",
        "cinematic melancholy",
        "museum-grade composition",
        "atmospheric perfection",
        "award-winning composition",
        "emotionally powerful",
        "iconic imagery",
        "cinematic fog",
        "epic scale",
        "environmental storytelling",
        "surreal atmosphere",
        "divine atmosphere",
        "transcendent atmosphere",
        "silent storytelling",
        "existential atmosphere",
        "dreamlike realism",
        "poetic surrealism",
        "atmospheric silence"
      ]
    }
  ];

  const DEFAULT_SETTINGS = {
    sendPreset: "slow",
    sendIntervalMin: DEFAULT_SEND_INTERVAL_MIN,
    sendIntervalMax: DEFAULT_SEND_INTERVAL_MAX,
    aspectRatio: "1:1",
    variablesText: "",
    variableTags: {},
    importedVariablePresetVersion: 0,
    autoDownload: false,
    restoreQueue: true
  };

  const STATUS_LABELS = {
    pending: "待发送",
    sending: "发送中",
    sent: "已发送",
    failed: "失败",
    paused: "已暂停"
  };

  const state = {
    collapsed: false,
    modal: null,
    activeVariableName: "",
    docked: false,
    dockSide: "right",
    panelPosition: { left: null, top: 88 },
    running: false,
    dragging: false,
    dragOffset: { x: 0, y: 0 },
    queue: [],
    queueRunnerId: "",
    activeTaskId: "",
    activeTaskStartedAt: 0,
    queueTabId: 0,
    nextSendAt: 0,
    logs: [],
    downloadedUrls: new Set(),
    drafts: {},
    settings: { ...DEFAULT_SETTINGS },
    status: "准备就绪",
    warning: ""
  };

  let root;
  let shadow;
  let dockTimer = null;
  let imageHoverOverlay = null;
  let imageHoverTarget = null;
  let countdownTimer = null;
  const handledSendTaskIds = new Set();

  init();

  async function init() {
    if (document.getElementById(ROOT_ID)) return;

    root = document.createElement("div");
    root.id = ROOT_ID;
    document.documentElement.appendChild(root);

    shadow = root.attachShadow({ mode: "open" });
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = chrome.runtime.getURL("content.css");
    shadow.appendChild(css);

    await loadState();
    render();
    bindGlobalDrag();
    bindImageHoverDownloads();
    bindBackgroundQueueEvents();
    bindLocalCountdownTicker();
  }

  async function loadState() {
    const saved = await chrome.storage.local.get(STORE_KEY);
    const data = saved[STORE_KEY] || {};
    const hadLegacyTimingSettings = hasLegacyTimingSettings(data.settings);

    state.settings = sanitizeSettings(data.settings);
    normalizeSendIntervalSettings();
    if (data.ui && typeof data.ui === "object") {
      state.docked = Boolean(data.ui.docked);
      state.dockSide = data.ui.dockSide === "left" ? "left" : "right";
      state.panelPosition = normalizePanelPosition(data.ui.panelPosition);
    }
    if (!state.settings.variableTags || typeof state.settings.variableTags !== "object" || Array.isArray(state.settings.variableTags)) {
      state.settings.variableTags = {};
    }
    const normalizedSendPreset = normalizeSendPreset();
    state.queue = normalizeStoredQueue(data.queue);
    state.logs = Array.isArray(data.logs) ? data.logs.slice(-80) : [];
    state.queueRunnerId = typeof data.queueRunnerId === "string" ? data.queueRunnerId : "";
    state.activeTaskId = typeof data.activeTaskId === "string" ? data.activeTaskId : "";
    state.activeTaskStartedAt = Number(data.activeTaskStartedAt) || 0;
    state.queueTabId = Number(data.queueTabId) || 0;
    state.nextSendAt = Number(data.nextSendAt) || 0;
    state.running = Boolean(data.running);
    state.status = typeof data.status === "string" ? data.status : state.status;
    state.warning = typeof data.warning === "string" ? data.warning : "";
    const mergedVariablePresets = mergeDefaultVariablePresets();
    if (normalizedSendPreset || mergedVariablePresets || hadLegacyTimingSettings) saveState();
  }

  function sanitizeSettings(input) {
    const allowed = new Set(Object.keys(DEFAULT_SETTINGS));
    const settings = { ...DEFAULT_SETTINGS };
    if (input && typeof input === "object") {
      for (const [key, value] of Object.entries(input)) {
        if (allowed.has(key)) settings[key] = value;
      }
    }
    return settings;
  }

  function hasLegacyTimingSettings(input) {
    if (!input || typeof input !== "object") return false;
    return ["delayMin", "delayMax", "roundCountMin", "roundCountMax", "roundWaitMin", "roundWaitMax"]
      .some((key) => Object.prototype.hasOwnProperty.call(input, key));
  }

  function normalizeSendIntervalSettings() {
    const min = Math.max(1, Number(state.settings.sendIntervalMin) || DEFAULT_SEND_INTERVAL_MIN);
    const max = Math.max(1, Number(state.settings.sendIntervalMax) || DEFAULT_SEND_INTERVAL_MAX);
    state.settings.sendIntervalMin = Math.min(min, max);
    state.settings.sendIntervalMax = Math.max(min, max);
  }

  function saveState() {
    chrome.storage.local.set({
      [STORE_KEY]: {
        settings: state.settings,
        queue: state.queue,
        queueRunnerId: state.queueRunnerId,
        activeTaskId: state.activeTaskId,
        activeTaskStartedAt: state.activeTaskStartedAt,
        queueTabId: state.queueTabId,
        nextSendAt: state.nextSendAt,
        logs: state.logs,
        running: state.running,
        status: state.status,
        warning: state.warning,
        ui: {
          docked: state.docked,
          dockSide: state.dockSide,
          panelPosition: state.panelPosition
        }
      }
    });
  }

  function normalizeStoredQueue(queue) {
    return Array.isArray(queue) && state.settings.restoreQueue
      ? queue
        .filter((task) => task.status !== "sent")
        .map((task) => ["sending", "paused"].includes(task.status)
          ? { ...task, status: "pending", error: "" }
          : task)
      : [];
  }

  function bindBackgroundQueueEvents() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== "perform-send-prompt") return false;
      if (message.taskId && handledSendTaskIds.has(message.taskId)) {
        sendResponse({ ok: true, duplicate: true });
        return false;
      }
      ensureActiveSendTask(message.taskId)
        .then(() => runPromptSend(message.prompt, message.taskId))
        .then(() => {
          if (message.taskId) rememberHandledSendTaskId(message.taskId);
        })
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
      return true;
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes[STORE_KEY]?.newValue) return;
      const data = changes[STORE_KEY].newValue;
      if (Array.isArray(data.queue)) state.queue = data.queue;
      if (Array.isArray(data.logs)) state.logs = data.logs.slice(-80);
      if (typeof data.queueRunnerId === "string") state.queueRunnerId = data.queueRunnerId;
      if (typeof data.activeTaskId === "string") state.activeTaskId = data.activeTaskId;
      state.activeTaskStartedAt = Number(data.activeTaskStartedAt) || 0;
      state.queueTabId = Number(data.queueTabId) || 0;
      state.nextSendAt = Number(data.nextSendAt) || 0;
      if (typeof data.running === "boolean") state.running = data.running;
      if (typeof data.status === "string") state.status = data.status;
      if (typeof data.warning === "string") state.warning = data.warning;
      if (data.settings && typeof data.settings === "object") {
        state.settings = sanitizeSettings(data.settings);
        normalizeSendIntervalSettings();
      }
      if (isEditingInput()) {
        updateLivePanels();
      } else {
        render({ captureDrafts: true });
      }
    });
  }

  function rememberHandledSendTaskId(taskId) {
    handledSendTaskIds.add(taskId);
    if (handledSendTaskIds.size <= 120) return;
    const first = handledSendTaskIds.values().next().value;
    handledSendTaskIds.delete(first);
  }

  async function ensureActiveSendTask(taskId) {
    if (!taskId) return;
    const saved = await chrome.storage.local.get(STORE_KEY);
    const data = saved[STORE_KEY] || {};
    if (data.activeTaskId !== taskId) {
      throw new Error("任务已过期，跳过发送。");
    }
  }

  function normalizePanelPosition(position) {
    const top = Number(position?.top);
    const left = position?.left === null || position?.left === undefined ? null : Number(position.left);
    return {
      left: Number.isFinite(left) ? left : null,
      top: Number.isFinite(top) ? top : 88
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function applyPanelPosition(shell) {
    const top = clamp(state.panelPosition.top, 8, Math.max(8, window.innerHeight - 56));
    state.panelPosition.top = top;
    shell.style.top = `${top}px`;
    if (state.docked) {
      shell.style.left = state.dockSide === "left" ? "0px" : "auto";
      shell.style.right = state.dockSide === "right" ? "0px" : "auto";
      return;
    }
    if (Number.isFinite(state.panelPosition.left)) {
      const maxLeft = Math.max(8, window.innerWidth - shell.offsetWidth - 8);
      const left = clamp(state.panelPosition.left, 8, maxLeft);
      state.panelPosition.left = left;
      shell.style.left = `${left}px`;
      shell.style.right = "auto";
    } else {
      shell.style.left = "auto";
      shell.style.right = "12px";
    }
  }

  function render(options = {}) {
    if (options.captureDrafts !== false) captureDrafts();
    const scrollState = options.preserveScroll === false ? [] : captureScrollState();
    const queueCount = state.queue.length;
    const pendingCount = state.queue.filter((task) => task.status === "pending").length;

    shadow.querySelector(".mj-flow-shell")?.remove();
    shadow.querySelector(".mj-flow-modal-backdrop")?.remove();
    const shell = document.createElement("div");
    shell.className = `mj-flow-shell${state.collapsed ? " is-collapsed" : ""}${state.docked ? ` is-docked is-dock-${state.dockSide}` : ""}`;
    shell.innerHTML = state.docked ? dockedPanel() : `
      <div class="mj-flow-header" data-drag-handle>
        <img class="mj-flow-mark" src="${chrome.runtime.getURL("icons/icon-32.png")}" alt="${APP_NAME}" />
        <div class="mj-flow-title">${APP_NAME} <span>v${BUILD_LABEL}</span></div>
        <button class="mj-flow-icon-button" data-action="open-help" title="使用说明">?</button>
        <button class="mj-flow-icon-button" data-action="toggle-panel-side" title="切换左右位置">${state.dockSide === "left" ? "→" : "←"}</button>
        <button class="mj-flow-icon-button" data-action="toggle-collapse" title="收起为图标">×</button>
      </div>

      <div class="mj-flow-body">
        ${conversationPanel()}

        ${commandBar()}

        ${inputPanel()}
        ${queuePanel(queueCount, pendingCount)}
      </div>
    `;
    shadow.appendChild(shell);
    applyPanelPosition(shell);
    const modal = modalPanel();
    if (modal && !state.docked) {
      const modalHost = document.createElement("div");
      modalHost.innerHTML = modal;
      shadow.appendChild(modalHost.firstElementChild);
    }
    bindEvents(shadow);
    if (scrollState.length) restoreScrollState(scrollState);
  }

  function dockedPanel() {
    return `
      <button class="mj-flow-dock-button" data-action="restore-panel" data-drag-handle title="打开 ${APP_NAME}">
        <img class="mj-flow-dock-mark" src="${chrome.runtime.getURL("icons/icon-32.png")}" alt="${APP_NAME}" />
        <span>打开</span>
      </button>
    `;
  }

  function captureDrafts() {
    if (!shadow) return;
    shadow.querySelectorAll("[data-field]").forEach((input) => {
      state.drafts[input.dataset.field] = input.value;
    });
  }

  function captureScrollState() {
    const selectors = [".mj-flow-body", ".mj-flow-conversation", ".mj-flow-queue"];
    return selectors.map((selector) => {
      const element = shadow?.querySelector(selector);
      return {
        selector,
        top: element?.scrollTop || 0,
        left: element?.scrollLeft || 0
      };
    });
  }

  function restoreScrollState(scrollState) {
    requestAnimationFrame(() => {
      scrollState.forEach((item) => {
        const element = shadow.querySelector(item.selector);
        if (!element) return;
        element.scrollTop = item.top;
        element.scrollLeft = item.left;
      });
    });
  }

  function inputPanel() {
    return textPanel();
  }

  function commandBar() {
    return `
      <div class="mj-flow-commandbar">
        <div class="mj-flow-command-left">
          <button class="mj-flow-button primary" data-action="start" ${state.running ? "disabled" : ""}>开始</button>
          <button class="mj-flow-button" data-action="pause" ${state.running ? "" : "disabled"}>暂停</button>
          <button class="mj-flow-button primary compact" data-action="enqueue">加入队列</button>
          <div class="mj-flow-segment compact" title="发送模式">
            ${sendModeButton("slow", "Relax")}
            ${sendModeButton("fast", "Fast")}
          </div>
        </div>
        <div class="mj-flow-command-tools">
          <button class="mj-flow-tool-button" data-action="open-variables" title="管理提示词变量">变量</button>
          <button class="mj-flow-square-button" data-action="reset-panel" title="重置面板设置为默认值">↻</button>
          <button class="mj-flow-square-button" data-action="clear-logs" title="清空日志，不会影响进行中的任务">🧹</button>
        </div>
        <div class="mj-flow-command-sub">
          <label class="mj-flow-toggle">
            <span>自动下载</span>
            <input data-setting="autoDownload" type="checkbox" ${state.settings.autoDownload ? "checked" : ""} />
            <i aria-hidden="true"></i>
          </label>
          <label class="mj-flow-command-repeat">
            <span>重复次数</span>
            <input class="mj-flow-input" data-field="repeat" type="number" min="1" max="99" value="${escapeHtml(state.drafts.repeat || "1")}" />
          </label>
          <label class="mj-flow-command-interval">
            <span>间隔</span>
            <input class="mj-flow-input" data-setting="sendIntervalMin" type="number" min="1" max="999" value="${escapeHtml(state.settings.sendIntervalMin)}" />
            <em>-</em>
            <input class="mj-flow-input" data-setting="sendIntervalMax" type="number" min="1" max="999" value="${escapeHtml(state.settings.sendIntervalMax)}" />
            <span>秒</span>
          </label>
          <span class="mj-flow-inline-status${state.warning ? " warn" : ""}">${escapeHtml(inlineStatusText())}</span>
        </div>
      </div>
    `;
  }

  function textPanel() {
    return `
      <div class="mj-flow-compose">
        <div class="mj-flow-label">
          <span class="mj-flow-label-head">
            <span>提示词</span>
            <span class="mj-flow-chip-row inline">${aspectRatioButtons()}</span>
            <button class="mj-flow-inline-tool" data-action="translate-prompts" title="翻译提示词为英文">文A</button>
          </span>
          <textarea class="mj-flow-textarea main" data-field="prompts" placeholder="每行一个提示词。按“加入队列”后，会自动组合前缀和后缀。">${escapeHtml(state.drafts.prompts || "")}</textarea>
        </div>
        <div class="mj-flow-helper">每行一个任务。支持输入 @预设 和 {变量}，按“开始”会自动加入队列并发送。</div>
        <div class="mj-flow-field-strip">
          <span>提示词前缀</span>
          <input class="mj-flow-inline-input" data-field="prefix" value="${escapeHtml(state.drafts.prefix || "")}" placeholder="如 cinematic lighting，也可输入 @电影" />
        </div>
        <div class="mj-flow-field-strip">
          <span>提示词后缀</span>
          <input class="mj-flow-inline-input" data-field="suffix" value="${escapeHtml(state.drafts.suffix || "")}" placeholder="填数字会自动变成 --sref 数字" />
        </div>
        <div class="mj-flow-export-line">
          <button class="mj-flow-link-button" data-action="copy-queue">复制队列</button>
          <button class="mj-flow-link-button" data-action="export-prompts">导出提示词</button>
          <button class="mj-flow-link-button" data-action="export-queue">导出完整队列</button>
          <button class="mj-flow-link-button danger" data-action="clear">清空</button>
        </div>
      </div>
    `;
  }

  function aspectRatioButtons() {
    return ASPECT_RATIOS.map((ratio) => `
      <button class="mj-flow-chip${state.settings.aspectRatio === ratio ? " is-active" : ""}" data-action="set-aspect" data-ratio="${ratio}" title="使用 --ar ${ratio}">
        ${ratio}
      </button>
    `).join("");
  }

  function sendModeButton(value, label) {
    const active = (state.settings.sendPreset || DEFAULT_SETTINGS.sendPreset) === value;
    const parameter = value === "slow" ? "--relax" : "--fast";
    return `<button class="${active ? "is-active" : ""}" data-action="set-send-mode" data-send-mode="${value}" title="使用 ${parameter}">${label}</button>`;
  }

  function conversationPanel() {
    return `
      <div class="mj-flow-conversation" aria-live="polite">
        ${logList()}
      </div>
    `;
  }

  function modalPanel() {
    if (state.modal === "help") return helpModal();
    if (state.modal === "variables") return variablesModal();
    return "";
  }

  function helpModal() {
    return `
      <div class="mj-flow-modal-backdrop">
        <div class="mj-flow-modal help">
          <div class="mj-flow-modal-head">
            <div>
              <strong>使用说明</strong>
            </div>
            <button class="mj-flow-icon-button" data-action="close-modal" title="关闭">×</button>
          </div>
          <div class="mj-flow-help">
            <section>
              <h3>快速发送</h3>
              <p>在“提示词”里每行写一个任务，插件会按行拆分成队列。点击“加入队列”只保存任务，点击“开始”会把当前输入自动加入队列并开始发送。</p>
              <ul>
                <li>“暂停”只暂停后续发送，不会清空队列。</li>
                <li>“重复次数”会为每条提示词重复生成指定次数。</li>
                <li>“清空”只清空当前输入框；扫把按钮只清理日志，不影响正在运行的任务。</li>
              </ul>
            </section>
            <section>
              <h3>参数规则</h3>
              <p>尺寸按钮会自动生成 Midjourney 可识别的 <b>--ar</b> 参数；Fast/Relax 对应 <b>--fast</b> 和 <b>--relax</b>。</p>
              <ul>
                <li>提示词输入纯数字时，会自动变成 <b>数字 --sref random</b>。</li>
                <li>后缀输入纯数字时，会自动变成 <b>--sref 数字</b>。</li>
                <li>如果你已经手动写了 <b>--ar</b>、<b>--fast</b> 或 <b>--relax</b>，插件会尽量避免重复追加同类参数。</li>
              </ul>
            </section>
            <section>
              <h3>变量</h3>
              <p>点击“变量”管理预设。变量值建议每行一个英文词组，最终发送时会展开成英文提示词，中文只用来帮助你识别分类。</p>
              <ul>
                <li>在提示词、前缀或后缀里输入 <b>@变量名</b>、<b>{变量名}</b> 或 <b>[变量名]</b> 都可以调用变量。</li>
                <li>输入 <b>@</b> 后会弹出变量候选，点击候选会插入变量名。</li>
                <li>一个变量有多行内容时，会拆成多条任务逐条发送。</li>
              </ul>
            </section>
            <section>
              <h3>翻译</h3>
              <p>“文A”会把当前中文提示词翻译成英文，并直接回填到提示词输入框。翻译只处理提示词文本，不会改动尺寸、速度、前缀和后缀。</p>
            </section>
            <section>
              <h3>下载图片</h3>
              <p>鼠标移到 Midjourney 生成图上会显示下载按钮。单张图可点“下载”，四宫格或同组图片可点“下载全部”。</p>
              <ul>
                <li>下载位置由浏览器决定，通常在 Edge/Chrome 的默认下载文件夹。</li>
                <li>“自动下载”开启后，插件会尝试在检测到新生成图片时自动保存。</li>
              </ul>
            </section>
            <section>
              <h3>面板操作</h3>
              <p>右上角箭头用于把面板切换到浏览器左侧或右侧；关闭按钮会把面板收起成侧边小图标，再次点击即可打开。</p>
              <ul>
                <li>刷新按钮会把提示词、前缀、后缀、尺寸、速度和重复次数恢复到默认值。</li>
                <li>如果你更新了插件但界面版本没变化，请在扩展管理页刷新扩展，并重新打开 Midjourney 页面。</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    `;
  }

  function variablesModal() {
    const entries = variableEntries();
    const active = entries.find((item) => item.name === state.activeVariableName);
    const placeholderCount = Math.max(0, Math.min(3, 3 - entries.length));
    return `
      <div class="mj-flow-modal-backdrop">
        <div class="mj-flow-modal variables">
          <div class="mj-flow-modal-head">
            <div>
              <strong>提示词变量</strong>
            </div>
            <button class="mj-flow-icon-button" data-action="close-modal" title="关闭">×</button>
          </div>
          <div class="mj-flow-note">把常用人物、风格、参数设成变量。提示词里输入 <b>@变量名</b>、<b>{变量名}</b> 或 <b>[变量名]</b> 会自动展开。</div>
          <div class="mj-flow-variable-toolbar">
            <input class="mj-flow-input" data-variable-search value="" placeholder="搜索变量" />
            <button class="mj-flow-button primary" data-action="new-variable">添加变量</button>
          </div>
          <div class="mj-flow-variable-layout">
            <div class="mj-flow-variable-list">
              ${entries.length ? entries.map((item) => `
                <article class="mj-flow-variable-card${item.name === state.activeVariableName ? " is-active" : ""}" data-variable-card data-variable-search-text="${escapeHtml(`${item.name} ${item.tag} ${item.values.join(" ")}`)}">
                  <button class="mj-flow-variable-card-main" data-action="edit-variable" data-variable-name="${escapeHtml(item.name)}">
                    <span>${escapeHtml(item.name)}</span>
                    <small>${escapeHtml(item.values.slice(0, 4).join(" / "))}</small>
                    ${item.tag ? `<em>${escapeHtml(item.tag)}</em>` : ""}
                  </button>
                  <div class="mj-flow-variable-card-actions">
                    <button class="mj-flow-mini" data-action="insert-variable-token" data-token="{${escapeHtml(item.name)}}" title="插入">＋</button>
                    <button class="mj-flow-mini danger" data-action="delete-variable" data-variable-name="${escapeHtml(item.name)}" title="删除">×</button>
                  </div>
                </article>
              `).join("") : `<div class="mj-flow-muted">暂无变量，右侧添加一个。</div>`}
              ${Array.from({ length: placeholderCount }).map(() => `<div class="mj-flow-variable-placeholder"></div>`).join("")}
            </div>
            <div class="mj-flow-form-card">
              <label class="mj-flow-label">
                变量名
                <input class="mj-flow-input" data-modal-field="variableName" value="${escapeHtml(active?.name || "")}" placeholder="例如 女生 / 镜头 / 光线" />
              </label>
              <label class="mj-flow-label">
                变量值
                <textarea class="mj-flow-textarea modal" data-modal-field="variableValue" placeholder="一行一个，或用 | 分隔。也可以输入 @ 使用已有变量">${escapeHtml(active?.values.join("\n") || "")}</textarea>
              </label>
              <label class="mj-flow-label">
                变量标签
                <input class="mj-flow-input" data-modal-field="variableTags" value="${escapeHtml(active?.tag || "")}" placeholder="可选：人物 / 风格 / 参数" />
              </label>
              <div class="mj-flow-modal-actions">
                <button class="mj-flow-button" data-action="new-variable">新增</button>
                <button class="mj-flow-button" data-action="close-modal">取消</button>
                <button class="mj-flow-button primary" data-action="save-variable">确定</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function queuePanel(queueCount, pendingCount) {
    const shouldShow = queueCount || state.running || state.warning;
    if (!shouldShow) return "";
    const failedCount = state.queue.filter((task) => task.status === "failed").length;
    const sentCount = state.queue.filter((task) => task.status === "sent").length;

    return `
      <div class="mj-flow-queue-panel">
        <div class="mj-flow-status-line">
          <span class="mj-flow-pill">总计 ${queueCount}</span>
          <span class="mj-flow-pill">待发 ${pendingCount}</span>
          <span class="mj-flow-pill">${state.running ? "运行中" : "未运行"}</span>
          <span class="mj-flow-status${state.warning ? " warn" : ""}">${escapeHtml(state.warning || state.status)}</span>
        </div>
        <div class="mj-flow-queue-actions">
          <button class="mj-flow-link-button" data-action="download-visible">下载可见图片</button>
          <button class="mj-flow-link-button" data-action="retry-failed" ${failedCount ? "" : "disabled"}>重试失败 ${failedCount}</button>
          <button class="mj-flow-link-button" data-action="clear-sent" ${sentCount ? "" : "disabled"}>清理已完成 ${sentCount}</button>
        </div>
        ${queueCount ? `<div class="mj-flow-queue">${queueList()}</div>` : ""}
      </div>
    `;
  }

  function inlineStatusText() {
    if (state.warning) return state.warning;
    const remaining = currentCountdownSeconds();
    if (remaining) return `发送间隔：${remaining} 秒`;
    if (/：\d+ 秒$/.test(state.status)) return state.status;
    if (state.running) return state.status || "运行中";
    return "等待开始";
  }

  function updateStatusDisplay() {
    const status = shadow.querySelector(".mj-flow-status");
    if (status) {
      status.textContent = inlineStatusText();
      status.classList.toggle("warn", Boolean(state.warning));
    }
    const inlineStatus = shadow.querySelector(".mj-flow-inline-status");
    if (inlineStatus) {
      inlineStatus.textContent = inlineStatusText();
      inlineStatus.classList.toggle("warn", Boolean(state.warning));
    }
  }

  function updateLivePanels() {
    updateStatusDisplay();
    const conversation = shadow.querySelector(".mj-flow-conversation");
    if (conversation) {
      conversation.innerHTML = logList();
      conversation.scrollTop = conversation.scrollHeight;
    }
    const statusLine = shadow.querySelector(".mj-flow-status-line");
    if (statusLine) {
      const queueCount = state.queue.length;
      const pendingCount = state.queue.filter((task) => task.status === "pending").length;
      statusLine.innerHTML = `
        <span class="mj-flow-pill">总计 ${queueCount}</span>
        <span class="mj-flow-pill">待发 ${pendingCount}</span>
        <span class="mj-flow-pill">${state.running ? "运行中" : "未运行"}</span>
        <span class="mj-flow-status${state.warning ? " warn" : ""}">${escapeHtml(state.warning || state.status)}</span>
      `;
    }
  }

  function isEditingInput() {
    const active = shadow?.activeElement;
    if (!active) return false;
    return active.matches("input, textarea, select, [contenteditable='true']");
  }

  function currentCountdownSeconds() {
    if (!state.running || !state.nextSendAt) return 0;
    return Math.max(0, Math.ceil((state.nextSendAt - Date.now()) / 1000));
  }

  function bindLocalCountdownTicker() {
    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      if (!state.running || !state.nextSendAt) return;
      updateStatusDisplay();
    }, 1000);
  }

  function queueList() {
    if (!state.queue.length) {
      return `<div class="mj-flow-muted">队列为空。先输入提示词并加入队列。</div>`;
    }

    return state.queue.map((task, index) => `
      <div class="mj-flow-task" data-task-id="${task.id}">
        <div class="mj-flow-task-top">
          <div class="mj-flow-task-status">${modeLabel(task.mode)} · ${STATUS_LABELS[task.status] || task.status}</div>
          <div class="mj-flow-task-prompt" title="${escapeHtml(task.prompt)}">${escapeHtml(task.prompt)}</div>
          <div class="mj-flow-task-actions">
            <button class="mj-flow-mini" data-action="move-up" data-index="${index}" title="上移">↑</button>
            <button class="mj-flow-mini" data-action="move-down" data-index="${index}" title="下移">↓</button>
            <button class="mj-flow-mini" data-action="retry" data-index="${index}" title="重试">↻</button>
            <button class="mj-flow-mini" data-action="delete-task" data-index="${index}" title="删除">×</button>
          </div>
        </div>
        ${task.error ? `<div class="mj-flow-muted">${escapeHtml(task.error)}</div>` : ""}
      </div>
    `).join("");
  }

  function logList() {
    if (!state.logs.length) {
      return `
        <div class="mj-flow-message-row assistant">
          <div class="mj-flow-bubble muted">等待输入提示词。</div>
        </div>
      `;
    }

    return state.logs.slice(-12).map((item) => `
      <div class="mj-flow-message-row ${item.type === "user" ? "user" : "assistant"}">
        <div class="mj-flow-bubble ${item.type || "info"}">${escapeHtml(item.message)}</div>
        <time>${formatTime(item.time)}</time>
      </div>
    `).join("");
  }

  function modeLabel(mode) {
    return mode === "text" ? "文生图" : "任务";
  }

  function bindEvents(shell) {
    shell.addEventListener("mouseenter", cancelAutoDock);
    shell.addEventListener("focusin", cancelAutoDock);
    shell.addEventListener("mouseleave", scheduleAutoDock);
    shell.addEventListener("focusout", () => setTimeout(scheduleAutoDock, 250));

    shell.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        handleAction(button.dataset.action, button);
      });
    });

    shell.querySelectorAll("[data-setting]").forEach((input) => {
      input.addEventListener("change", () => {
        const key = input.dataset.setting;
        const value = input.type === "checkbox" ? input.checked : input.value;
        updateSetting(key, value);
      });
    });

    shell.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("input", () => {
        state.drafts[input.dataset.field] = input.value;
        updateVariableSuggest(input);
      });
      input.addEventListener("keydown", (event) => handleVariableSuggestKeydown(event, input));
      input.addEventListener("blur", () => {
        setTimeout(() => closeVariableSuggest(), 140);
      });
    });

    shell.querySelectorAll("[data-variable-search]").forEach((input) => {
      input.addEventListener("input", () => {
        const query = input.value.trim().toLowerCase();
        shell.querySelectorAll("[data-variable-card]").forEach((card) => {
          card.hidden = query && !card.dataset.variableSearchText.toLowerCase().includes(query);
        });
      });
    });
    const handle = shell.querySelector("[data-drag-handle]");
    if (!handle) return;
    handle.addEventListener("mousedown", (event) => {
      if (!state.docked && event.target.closest("button")) return;
      cancelAutoDock();
      const rect = shell.getBoundingClientRect();
      state.dragging = true;
      if (state.docked) {
        state.docked = false;
        state.panelPosition = { left: rect.left, top: rect.top };
        shell.classList.remove("is-docked", "is-dock-left", "is-dock-right");
        shell.style.width = "42px";
        shell.style.height = "42px";
        shell.style.left = `${rect.left}px`;
        shell.style.right = "auto";
      }
      state.collapsed = false;
      state.dragOffset = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      event.preventDefault();
    });
  }

  function bindGlobalDrag() {
    document.addEventListener("mousemove", (event) => {
      if (!state.dragging) return;
      const shell = shadow.querySelector(".mj-flow-shell");
      if (!shell) return;
      const x = clamp(event.clientX - state.dragOffset.x, 8, Math.max(8, window.innerWidth - shell.offsetWidth - 8));
      const y = clamp(event.clientY - state.dragOffset.y, 8, Math.max(8, window.innerHeight - shell.offsetHeight - 8));
      state.panelPosition = { left: x, top: y };
      shell.style.left = `${x}px`;
      shell.style.right = "auto";
      shell.style.top = `${y}px`;
    });

    document.addEventListener("mouseup", () => {
      if (state.dragging) {
        const shell = shadow.querySelector(".mj-flow-shell");
        if (shell) {
          const rect = shell.getBoundingClientRect();
          state.dockSide = rect.left + rect.width / 2 < window.innerWidth / 2 ? "left" : "right";
        }
        saveState();
        scheduleAutoDock();
      }
      state.dragging = false;
    });

    window.addEventListener("resize", () => {
      const shell = shadow?.querySelector(".mj-flow-shell");
      if (!shell) return;
      applyPanelPosition(shell);
    });
  }

  function scheduleAutoDock() {
    cancelAutoDock();
    if (state.docked || state.dragging || state.running || state.modal) return;
    dockTimer = setTimeout(() => {
      const active = shadow?.activeElement;
      const shell = shadow?.querySelector(".mj-flow-shell");
      if (!shell || shell.matches(":hover") || (active && shell.contains(active))) return;
      dockPanel();
    }, 2200);
  }

  function cancelAutoDock() {
    if (!dockTimer) return;
    clearTimeout(dockTimer);
    dockTimer = null;
  }

  function dockPanel() {
    cancelAutoDock();
    const shell = shadow.querySelector(".mj-flow-shell");
    if (shell) {
      const rect = shell.getBoundingClientRect();
      state.panelPosition = {
        left: state.panelPosition.left,
        top: clamp(rect.top, 8, Math.max(8, window.innerHeight - 56))
      };
      state.dockSide = rect.left + rect.width / 2 < window.innerWidth / 2 ? "left" : "right";
    }
    state.docked = true;
    state.collapsed = false;
    state.modal = null;
    saveState();
    render();
  }

  function restorePanel() {
    cancelAutoDock();
    state.docked = false;
    state.collapsed = false;
    const width = Math.min(540, window.innerWidth - 24);
    if (state.dockSide === "right") {
      state.panelPosition.left = clamp(window.innerWidth - width - 12, 8, Math.max(8, window.innerWidth - width - 8));
    } else {
      state.panelPosition.left = 12;
    }
    state.panelPosition.top = clamp(state.panelPosition.top, 8, Math.max(8, window.innerHeight - 120));
    saveState();
    render();
  }

  function togglePanelSide() {
    cancelAutoDock();
    state.docked = false;
    state.collapsed = false;
    state.dockSide = state.dockSide === "left" ? "right" : "left";
    const width = Math.min(540, window.innerWidth - 24);
    state.panelPosition.left = state.dockSide === "right"
      ? clamp(window.innerWidth - width - 12, 8, Math.max(8, window.innerWidth - width - 8))
      : 12;
    state.panelPosition.top = clamp(state.panelPosition.top, 8, Math.max(8, window.innerHeight - 120));
    saveState();
    render();
  }

  async function handleAction(action, button) {
    if (action === "restore-panel") {
      restorePanel();
      return;
    }
    if (action === "toggle-panel-side") {
      togglePanelSide();
      return;
    }
    if (action === "open-help") {
      state.docked = false;
      state.modal = "help";
      render();
      return;
    }
    if (action === "open-variables") {
      state.docked = false;
      state.modal = "variables";
      render();
      return;
    }
    if (action === "translate-prompts") {
      await translatePromptField();
      return;
    }
    if (action === "close-modal") {
      state.modal = null;
      render();
      return;
    }
    if (action === "save-variable") {
      saveVariableFromModal();
      return;
    }
    if (action === "new-variable") {
      state.activeVariableName = "";
      render();
      return;
    }
    if (action === "edit-variable") {
      state.activeVariableName = button.dataset.variableName || "";
      render();
      return;
    }
    if (action === "delete-variable") {
      deleteVariable(button.dataset.variableName);
      return;
    }
    if (action === "insert-variable-token") {
      insertVariableToken(button.dataset.token);
      return;
    }
    if (action === "toggle-collapse") {
      if (state.docked) {
        restorePanel();
      } else {
        dockPanel();
      }
      return;
    }
    if (action === "reset-panel") {
      resetPanelSettings();
      return;
    }
    if (action === "clear-logs") {
      clearLogs();
      render();
      return;
    }
    if (action === "set-aspect") {
      setAspectRatio(button.dataset.ratio);
      return;
    }
    if (action === "set-send-mode") {
      setSendPreset(button.dataset.sendMode);
      return;
    }
    if (action === "enqueue") {
      enqueueFromForm();
      return;
    }
    if (action === "start") {
      startQueue();
      return;
    }
    if (action === "pause") {
      state.running = false;
      state.queueRunnerId = "";
      state.activeTaskId = "";
      state.activeTaskStartedAt = 0;
      state.queueTabId = 0;
      state.nextSendAt = 0;
      setStatus("已暂停，当前任务发送完成后停止。");
      addLog("已暂停，当前任务发送完成后停止。", "warn");
      saveState();
      sendRuntimeMessage({ type: "stop-queue-runner" });
      render();
      return;
    }
    if (action === "clear") {
      state.queue = [];
      state.logs = [];
      state.running = false;
      state.queueRunnerId = "";
      state.activeTaskId = "";
      state.activeTaskStartedAt = 0;
      state.queueTabId = 0;
      state.nextSendAt = 0;
      setStatus("队列已清空。");
      saveState();
      sendRuntimeMessage({ type: "stop-queue-runner" });
      render();
      return;
    }
    if (action === "download-visible") {
      downloadVisibleImages();
      return;
    }
    if (action === "export-queue") {
      exportQueue();
      return;
    }
    if (action === "export-prompts") {
      exportPrompts();
      return;
    }
    if (action === "copy-queue") {
      copyQueue();
      return;
    }
    if (action === "retry-failed") {
      retryFailedTasks();
      return;
    }
    if (action === "clear-sent") {
      clearSentTasks();
      return;
    }

    const index = Number(button.dataset.index);
    if (Number.isNaN(index)) return;
    if (action === "delete-task") state.queue.splice(index, 1);
    if (action === "retry" && state.queue[index]) {
      state.queue[index].status = "pending";
      state.queue[index].error = "";
    }
    if (action === "move-up" && index > 0) {
      [state.queue[index - 1], state.queue[index]] = [state.queue[index], state.queue[index - 1]];
    }
    if (action === "move-down" && index < state.queue.length - 1) {
      [state.queue[index + 1], state.queue[index]] = [state.queue[index], state.queue[index + 1]];
    }
    saveState();
    render();
  }

  function updateSetting(key, rawValue) {
    if (["sendIntervalMin", "sendIntervalMax"].includes(key)) {
      state.settings[key] = Math.max(1, Number(rawValue) || 1);
      normalizeSendIntervalSettings();
    } else {
      state.settings[key] = rawValue;
    }
    saveState();
    render();
  }

  function variableEntries() {
    const tags = state.settings.variableTags || {};
    return [...parseVariables(state.settings.variablesText).entries()]
      .map(([name, values]) => ({ name, values, tag: tags[name] || "" }));
  }

  function mergeDefaultVariablePresets() {
    if ((Number(state.settings.importedVariablePresetVersion) || 0) >= DEFAULT_VARIABLE_PRESET_VERSION) return false;

    const variables = parseVariables(state.settings.variablesText);
    const tags = { ...(state.settings.variableTags || {}) };

    for (const preset of DEFAULT_VARIABLE_PRESETS) {
      const current = variables.get(preset.name) || [];
      const next = [...current];
      const seen = new Set(current.map((value) => value.toLowerCase()));
      for (const value of preset.values) {
        if (seen.has(value.toLowerCase())) continue;
        seen.add(value.toLowerCase());
        next.push(value);
      }
      variables.set(preset.name, next.slice(0, 80));
      if (!tags[preset.name]) {
        tags[preset.name] = preset.tag;
      }
    }

    state.settings.variablesText = serializeVariables(variables);
    state.settings.variableTags = tags;
    state.settings.importedVariablePresetVersion = DEFAULT_VARIABLE_PRESET_VERSION;
    return true;
  }

  async function translatePromptField() {
    const target = shadow.querySelector("[data-field='prompts']");
    if (!target) return;
    const text = target.value.trim();
    if (!text) {
      setWarning("请先输入需要翻译的提示词。");
      render();
      return;
    }
    if (!containsChinese(text)) {
      setWarning("没有检测到中文内容，暂不翻译。");
      render();
      return;
    }

    setStatus("正在翻译提示词...");
    updateStatusDisplay();
    const lines = target.value.split(/\r?\n/);
    const response = await sendRuntimeMessage({
      type: "translate-prompts",
      lines
    });
    if (!response?.ok || !Array.isArray(response.lines)) {
      setWarning(response?.error || "翻译失败，请稍后重试。");
      render();
      return;
    }
    if (response.failedCount) {
      setWarning("翻译接口暂时不可用，请稍后重试。原始提示词已保留。");
      render();
      return;
    }
    target.value = response.lines.join("\n");
    state.drafts.prompts = target.value;
    setStatus("提示词已翻译为英文。");
    render();
  }

  function containsChinese(value) {
    return /[\u3400-\u9fff]/.test(String(value || ""));
  }

  function resetPanelSettings() {
    const preserved = {
      variablesText: state.settings.variablesText || "",
      variableTags: state.settings.variableTags || {},
      importedVariablePresetVersion: state.settings.importedVariablePresetVersion || 0,
    };
    state.settings = { ...DEFAULT_SETTINGS, ...preserved };
    state.drafts = {
      prompts: "",
      prefix: "",
      suffix: "",
      repeat: "1"
    };
    state.modal = null;
    state.queue = [];
    state.logs = [];
    state.running = false;
    state.queueRunnerId = "";
    state.activeTaskId = "";
    state.activeTaskStartedAt = 0;
    state.queueTabId = 0;
    state.nextSendAt = 0;
    state.warning = "";
    state.status = "已重置面板设置和输入框。";
    sendRuntimeMessage({ type: "stop-queue-runner" });
    saveState();
    render({ captureDrafts: false, preserveScroll: false });
  }

  function saveVariableFromModal() {
    const name = getModalFieldValue("variableName").replace(/^[{[\s]+|[\]}\s]+$/g, "");
    const rawValue = getModalFieldValue("variableValue");
    const tag = getModalFieldValue("variableTags").trim();
    const values = rawValue
      .split(/\r?\n|[|｜]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 80);
    if (!name || !values.length) {
      setWarning("请填写变量名和变量值。");
      render();
      return;
    }

    const lines = String(state.settings.variablesText || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => {
        const match = line.match(/^([^=:：]+)\s*[:=：]/);
        const lineName = match ? match[1].trim().replace(/^[{[＠@]+|[\]}]+$/g, "") : "";
        return !match || (lineName !== name && lineName !== state.activeVariableName);
      });
    lines.push(`${name}=${values.join("|")}`);
    state.settings.variablesText = lines.join("\n");
    const tags = { ...(state.settings.variableTags || {}) };
    if (state.activeVariableName && state.activeVariableName !== name) delete tags[state.activeVariableName];
    if (tag) {
      tags[name] = tag;
    } else {
      delete tags[name];
    }
    state.settings.variableTags = tags;
    state.activeVariableName = name;
    saveState();
    setStatus(`已保存变量 ${name}`);
    addLog(`已保存变量：${name}`, "success");
    state.modal = "variables";
    render();
  }

  function deleteVariable(name) {
    const target = String(name || "").trim();
    if (!target) return;
    const lines = String(state.settings.variablesText || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => {
        const match = line.match(/^([^=:：]+)\s*[:=：]/);
        const lineName = match ? match[1].trim().replace(/^[{[＠@]+|[\]}]+$/g, "") : "";
        return lineName !== target;
      });
    state.settings.variablesText = lines.join("\n");
    if (state.settings.variableTags?.[target]) {
      const tags = { ...state.settings.variableTags };
      delete tags[target];
      state.settings.variableTags = tags;
    }
    if (state.activeVariableName === target) state.activeVariableName = "";
    saveState();
    setStatus(`已删除变量 ${target}`);
    render();
  }

  function insertVariableToken(token) {
    const active = shadow.activeElement;
    const target = active?.matches?.("input, textarea")
      ? active
      : shadow.querySelector("[data-field='prompts']");
    if (!target || !token) return;
    insertTextAtCursor(target, token);
    target.focus();
  }

  function getModalFieldValue(name) {
    const element = shadow.querySelector(`[data-modal-field="${name}"]`);
    return element ? element.value.trim() : "";
  }

  function normalizeSendPreset() {
    if (["fast", "slow"].includes(state.settings.sendPreset)) return false;
    state.settings.sendPreset = DEFAULT_SETTINGS.sendPreset;
    return true;
  }

  function enqueueFromForm(options = {}) {
    const shouldRender = options.render !== false;
    const prompts = expandPresetTokens(getFieldValue("prompts"));
    const prefix = expandPresetTokens(getFieldValue("prefix"));
    const suffix = buildSuffix(expandPresetTokens(getFieldValue("suffix")));
    const repeat = Math.max(1, Number(getFieldValue("repeat")) || 1);
    const parsed = parsePromptLines(prompts);

    if (!parsed.length) {
      setWarning("请先输入至少一条提示词。");
      addLog("没有匹配到提示词，请先输入内容。", "warn");
      if (shouldRender) render();
      return 0;
    }
    const availableSlots = Math.max(0, MAX_QUEUE_TASKS - state.queue.length);
    if (!availableSlots) {
      setWarning(`队列最多保留 ${MAX_QUEUE_TASKS} 条任务，请先清理后再添加。`);
      addLog(`队列已达到 ${MAX_QUEUE_TASKS} 条上限，未继续添加。`, "warn");
      if (shouldRender) render();
      return 0;
    }

    const taskInputs = buildTextTasks({ prompts: parsed, prefix, suffix, repeat, limit: availableSlots });
    if (!taskInputs.length) {
      if (shouldRender) render();
      return 0;
    }

    const tasks = [];
    for (const input of taskInputs) {
      const expandedPrompts = expandVariableCombinations(input.prompt);
      for (const expandedPrompt of expandedPrompts) {
        if (tasks.length >= availableSlots) break;
        tasks.push({
          id: crypto.randomUUID(),
          mode: input.mode,
          prompt: expandedPrompt,
          sourcePrompt: input.sourcePrompt,
          status: "pending",
          createdAt: Date.now(),
          error: ""
        });
      }
      if (tasks.length >= availableSlots) break;
    }

    state.queue.push(...tasks);
    setStatus(`已加入 ${tasks.length} 条任务。`);
    addLog(`匹配到 ${tasks.length} 个提示词，已加入队列。`, "success");
    if (tasks.length >= availableSlots) {
      setWarning(`队列最多 ${MAX_QUEUE_TASKS} 条，已添加到上限。`);
      addLog(`队列最多 ${MAX_QUEUE_TASKS} 条，超出部分未加入。`, "warn");
    }
    saveState();
    if (shouldRender) render();
    return tasks.length;
  }

  function getFieldValue(name) {
    const element = shadow.querySelector(`[data-field="${name}"]`);
    return element ? element.value.trim() : "";
  }

  function buildTextTasks({ prompts, prefix, suffix, repeat, limit = MAX_QUEUE_TASKS }) {
    const sourcePrompts = prompts.length ? prompts : [""];
    const tasks = [];
    for (const prompt of sourcePrompts) {
      const sourcePrompt = prompt;
      const composed = composePrompt(sourcePrompt, prefix, suffix);
      pushRepeatedTask(tasks, "text", composed, sourcePrompt, repeat, limit);
      if (tasks.length >= limit) break;
    }
    return tasks;
  }

  function pushRepeatedTask(tasks, mode, prompt, sourcePrompt, repeat, limit = MAX_QUEUE_TASKS) {
    const normalized = dedupeParameters(prompt).trim();
    if (!normalized) return;
    for (let index = 0; index < repeat; index += 1) {
      tasks.push({ mode, prompt: normalized, sourcePrompt });
      if (tasks.length >= limit) return;
    }
  }

  function setAspectRatio(ratio) {
    if (!ASPECT_RATIOS.includes(ratio)) return;
    state.settings.aspectRatio = ratio;
    saveState();
    shadow.querySelectorAll("[data-action='set-aspect']").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.ratio === ratio);
    });
    setStatus(`尺寸已设为 --ar ${ratio}`);
  }

  function setSendPreset(value) {
    if (!["fast", "slow"].includes(value)) return;
    state.settings.sendPreset = value;
    saveState();
    shadow.querySelectorAll("[data-action='set-send-mode']").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.sendMode === value);
    });
    setStatus(`发送模式已设为 ${value === "slow" ? "慢速 --relax" : "快速 --fast"}`);
  }

  function insertTextAtCursor(element, text) {
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? element.value.length;
    element.value = `${element.value.slice(0, start)}${text}${element.value.slice(end)}`;
    const cursor = start + text.length;
    element.setSelectionRange?.(cursor, cursor);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function updateVariableSuggest(input) {
    if (!input.matches("[data-field='prompts'], [data-field='prefix'], [data-field='suffix']")) {
      closeVariableSuggest();
      return;
    }

    const match = variableTriggerAtCursor(input);
    if (!match) {
      closeVariableSuggest();
      return;
    }

    const query = match.query.toLowerCase();
    const entries = variableEntries()
      .filter((item) => {
        const haystack = `${item.name} ${item.tag} ${item.values.slice(0, 3).join(" ")}`.toLowerCase();
        return !query || haystack.includes(query);
      })
      .slice(0, 8);
    if (!entries.length) {
      closeVariableSuggest();
      return;
    }

    showVariableSuggest(input, match, entries);
  }

  function handleVariableSuggestKeydown(event, input) {
    const menu = shadow.querySelector("[data-variable-suggest-menu]");
    if (!menu) return;
    if (event.key === "Escape") {
      closeVariableSuggest();
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      const first = menu.querySelector("[data-variable-suggest-name]");
      if (!first) return;
      event.preventDefault();
      applyVariableSuggest(input, first.dataset.variableSuggestName);
    }
  }

  function showVariableSuggest(input, match, entries) {
    let menu = shadow.querySelector("[data-variable-suggest-menu]");
    if (!menu) {
      menu = document.createElement("div");
      menu.className = "mj-flow-variable-suggest";
      menu.dataset.variableSuggestMenu = "true";
      (shadow.querySelector(".mj-flow-shell") || shadow).appendChild(menu);
    }

    menu.innerHTML = entries.map((item) => `
      <button type="button" data-variable-suggest-name="${escapeHtml(item.name)}">
        <span>${escapeHtml(item.name)}</span>
        ${item.tag ? `<small>${escapeHtml(item.tag)}</small>` : ""}
      </button>
    `).join("");
    menu.querySelectorAll("[data-variable-suggest-name]").forEach((button) => {
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        applyVariableSuggest(input, button.dataset.variableSuggestName);
      });
    });

    menu.dataset.targetField = input.dataset.field || "";
    menu.dataset.replaceStart = String(match.start);
    menu.dataset.replaceEnd = String(match.end);
    const shellRect = shadow.querySelector(".mj-flow-shell")?.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    const left = shellRect ? inputRect.left - shellRect.left : 16;
    const top = shellRect ? inputRect.bottom - shellRect.top + 4 : 80;
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;
    menu.style.minWidth = `${Math.min(Math.max(inputRect.width, 180), 320)}px`;
  }

  function applyVariableSuggest(input, name) {
    const menu = shadow.querySelector("[data-variable-suggest-menu]");
    const start = Number(menu?.dataset.replaceStart ?? input.selectionStart ?? input.value.length);
    const end = Number(menu?.dataset.replaceEnd ?? input.selectionStart ?? input.value.length);
    const token = `@${name}`;
    input.value = `${input.value.slice(0, start)}${token}${input.value.slice(end)}`;
    const cursor = start + token.length;
    input.setSelectionRange?.(cursor, cursor);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
    closeVariableSuggest();
  }

  function closeVariableSuggest() {
    shadow?.querySelector("[data-variable-suggest-menu]")?.remove();
  }

  function variableTriggerAtCursor(input) {
    const cursor = input.selectionStart ?? input.value.length;
    const before = input.value.slice(0, cursor);
    const at = before.lastIndexOf("@");
    if (at < 0) return null;
    const previous = at > 0 ? before[at - 1] : " ";
    if (/\S/.test(previous)) return null;
    const query = before.slice(at + 1);
    if (/[\n,，;；{}[\]]/.test(query)) return null;
    return { start: at, end: cursor, query: query.trim() };
  }

  function expandPresetTokens(input) {
    let output = String(input || "");
    for (const preset of allPresets()) {
      output = output.replaceAll(preset.token, preset.value);
    }
    return output;
  }

  function allPresets() {
    return SUFFIX_PRESETS;
  }

  function parseVariables(input) {
    const variables = new Map();
    String(input || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const match = line.match(/^([^=:：]+)\s*[:=：]\s*(.+)$/);
        if (!match) return;
        const key = match[1].trim().replace(/^[{[＠@]+|[\]}]+$/g, "");
        const values = match[2]
          .split(/[|｜]/)
          .map((item) => item.trim())
          .filter(Boolean);
        if (key && values.length) variables.set(key, values.slice(0, 80));
      });
    return variables;
  }

  function serializeVariables(variables) {
    return [...variables.entries()]
      .filter(([, values]) => Array.isArray(values) && values.length)
      .map(([name, values]) => `${name}=${values.join("|")}`)
      .join("\n");
  }

  function expandVariableCombinations(input) {
    const variables = parseVariables(state.settings.variablesText);
    const inlineExpanded = expandInlineOptions(input);
    if (!variables.size) return inlineExpanded;

    const keys = [
      ...input.matchAll(/\{([^{}]+)\}/g),
      ...input.matchAll(/\[([^\]|]+)\]/g),
      ...variableAtMatches(input, variables)
    ]
      .map((match) => match[1].trim())
      .filter((key, index, list) => variables.has(key) && list.indexOf(key) === index);
    if (!keys.length) return inlineExpanded;

    let results = inlineExpanded;
    for (const key of keys) {
      const values = variables.get(key) || [];
      const next = [];
      const tokenPattern = new RegExp(`(?:\\{\\s*${escapeRegExp(key)}\\s*\\}|\\[\\s*${escapeRegExp(key)}\\s*\\]|@${escapeRegExp(key)}(?=\\s|,|，|$))`, "g");
      for (const item of results) {
        for (const value of values) {
          next.push(item.replace(tokenPattern, value));
          if (next.length >= 200) break;
        }
        if (next.length >= 200) break;
      }
      results = next;
      if (results.length >= 200) break;
    }
    return results
      .map((item) => dedupeParameters(item.replace(/\s+/g, " ").trim()))
      .filter(Boolean);
  }

  function variableAtMatches(input, variables) {
    return [...variables.keys()]
      .sort((a, b) => b.length - a.length)
      .flatMap((name) => {
        const pattern = new RegExp(`@${escapeRegExp(name)}(?=\\s|,|，|$)`, "g");
        return [...String(input || "").matchAll(pattern)].map(() => [null, name]);
      });
  }

  function inlineFields(body) {
    const fields = [];
    const addField = (name, options = []) => {
      const normalized = String(name || "").trim();
      if (!normalized || fields.some((item) => item.name === normalized)) return;
      fields.push({ name: normalized, options });
    };

    for (const match of String(body || "").matchAll(/\[([^\]|]+)(?:\|([^\]]+))?\]/g)) {
      addField(match[1], splitInlineOptions(match[2] || ""));
    }
    for (const match of String(body || "").matchAll(/\{([^{}]+)\}/g)) {
      addField(match[1], []);
    }
    return fields;
  }

  function expandInlineCombinations(body, values) {
    const fields = inlineFields(body);
    let results = [String(body || "")];
    for (const field of fields) {
      const fieldValues = Array.isArray(values[field.name]) && values[field.name].length
        ? values[field.name]
        : field.options.length ? field.options : ["N/A"];
      const tokenPattern = new RegExp(`(?:\\[\\s*${escapeRegExp(field.name)}(?:\\|[^\\]]+)?\\s*\\]|\\{\\s*${escapeRegExp(field.name)}\\s*\\})`, "g");
      const next = [];
      for (const item of results) {
        for (const value of fieldValues) {
          next.push(item.replace(tokenPattern, value));
          if (next.length >= 200) break;
        }
        if (next.length >= 200) break;
      }
      results = next;
      if (results.length >= 200) break;
    }
    return results
      .map((item) => item.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  function expandInlineOptions(input) {
    const fields = inlineFields(input).filter((field) => field.options.length);
    if (!fields.length) return [input];
    const values = {};
    fields.forEach((field) => {
      values[field.name] = field.options;
    });
    return expandInlineCombinations(input, values);
  }

  function splitInlineOptions(input) {
    return String(input || "")
      .split(/[|｜,，、]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 30);
  }

  function buildSuffix(rawSuffix) {
    let suffix = normalizeSrefShortcut(rawSuffix);
    suffix = normalizeParameterSpacing(suffix);
    suffix = stripAspectParameters(suffix);
    suffix = stripResolutionParameters(suffix);
    suffix = applyMidjourneySpeed(suffix);
    const aspect = state.settings.aspectRatio || DEFAULT_SETTINGS.aspectRatio;
    if (aspect) {
      suffix = [suffix, `--ar ${aspect}`].filter(Boolean).join(" ");
    }
    return suffix.replace(/\s+/g, " ").trim();
  }

  function applyMidjourneySpeed(suffix) {
    const value = String(suffix || "").trim();
    if (hasAnySpeedParameter(value)) return value;
    if (state.settings.sendPreset === "fast") return [value, "--fast"].filter(Boolean).join(" ");
    if (state.settings.sendPreset === "slow") return [value, "--relax"].filter(Boolean).join(" ");
    return value;
  }

  function normalizeSrefShortcut(value) {
    const suffix = String(value || "").trim();
    if (!suffix) return "";
    const normalized = normalizeParameterSpacing(suffix.replace(/，/g, ","));
    const simpleReference = normalized.match(/^(?:sref\s*)?([a-z0-9:_-]+|随机)$/i);
    if (simpleReference && !normalized.startsWith("--")) {
      const token = simpleReference[1].toLowerCase() === "随机" ? "random" : simpleReference[1];
      return `--sref ${token}`;
    }
    const leadingReference = normalized.match(/^(?:sref\s*)?([a-z0-9:_-]+|随机)(?=\s+--)/i);
    if (leadingReference && !normalized.startsWith("--")) {
      const token = leadingReference[1].toLowerCase() === "随机" ? "random" : leadingReference[1];
      return `--sref ${token}${normalized.slice(leadingReference[0].length)}`;
    }
    return suffix
      .replace(/--sref\s+随机/gi, "--sref random")
      .replace(/--style-reference\s+随机/gi, "--style-reference random");
  }

  function normalizeParameterSpacing(value) {
    return String(value || "").replace(/--\s+([a-z][\w-]*)/gi, "--$1").replace(/\s+/g, " ").trim();
  }

  function stripAspectParameters(value) {
    return String(value || "").replace(/(^|\s)--ar\s+\S+/gi, " ").replace(/\s+/g, " ").trim();
  }

  function stripResolutionParameters(value) {
    return String(value || "").replace(/(^|\s)--(?:sd|hd)\d*(?=\s|$)/gi, " ").replace(/\s+/g, " ").trim();
  }

  function hasAnySpeedParameter(value) {
    return /--(?:fast|relax|turbo)(?:\s|$)/i.test(String(value || ""));
  }

  function parsePromptLines(input) {
    return input
      .split(/\r?\n/)
      .map((line) => normalizePromptLine(line))
      .filter(Boolean);
  }

  function normalizePromptLine(line) {
    const normalized = line
      .replace(/^\s*\d+[\).\、]\s+/, "")
      .replace(/^\/?imagine\s+prompt:\s*/i, "")
      .replace(/^prompt:\s*/i, "")
      .replace(/--sref\s+随机/gi, "--sref random")
      .replace(/--style-reference\s+随机/gi, "--style-reference random")
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return /^\d+$/.test(normalized) ? `${normalized} --sref random` : normalized;
  }

  function composePrompt(prompt, prefix, suffix) {
    const parts = [prefix, prompt, suffix].map((item) => item.trim()).filter(Boolean);
    return dedupeParameters(parts.join(" "));
  }

  function dedupeParameters(prompt) {
    const cleanPrompt = stripResolutionParameters(normalizeCommandSeparators(prompt));
    const parameterPattern = /--([a-zA-Z][\w-]*)(?:\s+((?:(?!--[a-zA-Z][\w-]*).)*))?/g;
    const seen = new Map();
    const order = [];
    let body = cleanPrompt.replace(parameterPattern, (match, key) => {
      const normalized = key.toLowerCase();
      if (!seen.has(normalized)) order.push(normalized);
      seen.set(normalized, match.trim().replace(/[，,]\s*$/g, ""));
      return "";
    }).replace(/\s*[，,]\s*$/g, "").trim();

    const params = order.map((key) => seen.get(key)).filter(Boolean);
    return [body, ...params].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  function normalizeCommandSeparators(value) {
    return String(value || "")
      .replace(/[，,]\s*(--[a-zA-Z][\w-]*)/g, " $1")
      .replace(/\s+/g, " ")
      .trim();
  }

  function startQueue() {
    if (state.running) return;
    saveState();
    if (!state.queue.some((item) => item.status === "pending")) {
      const added = enqueueFromForm({ render: false });
      if (!added) {
        render();
        return;
      }
    }
    state.running = true;
    state.queueRunnerId = crypto.randomUUID();
    state.activeTaskId = "";
    state.activeTaskStartedAt = 0;
    state.queueTabId = 0;
    state.nextSendAt = 0;
    state.warning = "";
    setStatus("队列开始运行。");
    addLog("开始发送。", "success");
    saveState();
    render();
    sendRuntimeMessage({ type: "start-queue-runner", runnerId: state.queueRunnerId }).then((response) => {
      if (response?.ok) return;
      setWarning(`后台队列启动失败：${response?.error || "未知错误"}`);
      addLog(`后台队列启动失败：${response?.error || "未知错误"}`, "error");
      saveState();
      render();
    });
  }

  async function sendPromptToMidjourney(prompt) {
    return runPromptSend(prompt);
  }

  async function runPromptSend(prompt, taskId = "") {
    await ensureActiveSendTask(taskId);
    await sleep(350);
    const target = findComposer();
    if (!target) {
      throw new Error("没有找到 Midjourney 输入框，请确认当前页面可以创作。");
    }

    target.scrollIntoView({ block: "center", behavior: "auto" });
    await sleep(250);
    await ensureActiveSendTask(taskId);
    focusAndSetText(target, prompt);
    await sleep(300);
    await ensureActiveSendTask(taskId);

    const sendButton = findSendButton(target);
    if (sendButton) {
      clickElement(sendButton);
    } else {
      dispatchEnter(target);
    }
    await sleep(650);
  }

  function dispatchEnter(target) {
    target.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      cancelable: true
    }));
    target.dispatchEvent(new KeyboardEvent("keyup", {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      cancelable: true
    }));
  }

  function clickElement(element) {
    const rect = element.getBoundingClientRect();
    const options = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    };
    element.dispatchEvent(new PointerEvent("pointerdown", options));
    element.dispatchEvent(new MouseEvent("mousedown", options));
    element.dispatchEvent(new PointerEvent("pointerup", options));
    element.dispatchEvent(new MouseEvent("mouseup", options));
    element.dispatchEvent(new MouseEvent("click", options));
    element.click();
  }

  function findComposer() {
    const candidates = [
      ...document.querySelectorAll("textarea, input[type='text'], [contenteditable='true']")
    ].filter((element) => isVisible(element) && isEditableComposer(element));

    const preferred = candidates.find((element) => {
      const label = [
        element.getAttribute("placeholder"),
        element.getAttribute("aria-label"),
        element.getAttribute("data-testid"),
        element.id,
        element.className,
        element.textContent
      ].join(" ").toLowerCase();
      return /imagine|prompt|describe|what|想象|提示词|创作/.test(label);
    });

    if (preferred) return preferred;

    const bottomComposer = candidates
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width >= 180 && rect.height >= 24)
      .sort((a, b) => {
        const aScore = a.rect.top + a.rect.width / 100;
        const bScore = b.rect.top + b.rect.width / 100;
        return bScore - aScore;
      })[0]?.element;

    return bottomComposer || candidates[candidates.length - 1] || null;
  }

  function isEditableComposer(element) {
    if (!element || element.disabled || element.readOnly) return false;
    const role = element.getAttribute("role") || "";
    const ariaHidden = element.getAttribute("aria-hidden") === "true";
    if (ariaHidden || /button|checkbox|switch|menuitem/i.test(role)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 18) return false;
    return true;
  }

  function findSendButton(target) {
    const rootNode = target.closest("form") || target.parentElement || document;
    const localButtons = [...rootNode.querySelectorAll("button")].filter(isVisible);
    const buttons = [...localButtons, ...document.querySelectorAll("button")].filter(isVisible);
    const explicitButton = buttons.find((button) => {
      const label = [
        button.getAttribute("aria-label"),
        button.title,
        button.getAttribute("data-testid"),
        button.textContent
      ].join(" ").toLowerCase();
      return /send|submit|create|imagine|generate|发送|创建|生成/.test(label);
    });
    if (explicitButton) return explicitButton;

    const targetRect = target.getBoundingClientRect();
    const positionalButton = localButtons
      .map((button) => ({ button, rect: button.getBoundingClientRect() }))
      .filter(({ rect }) => {
        const overlapsInput = rect.bottom >= targetRect.top && rect.top <= targetRect.bottom;
        const isRightSide = rect.left >= targetRect.right - 120;
        const isIconSized = rect.width <= 64 && rect.height <= 64;
        return overlapsInput && isRightSide && isIconSized;
      })
      .sort((a, b) => b.rect.left - a.rect.left)[0]?.button;
    if (positionalButton) return positionalButton;

    return buttons
      .map((button) => ({ button, rect: button.getBoundingClientRect() }))
      .filter(({ rect }) => {
        const closeVertically = Math.abs((rect.top + rect.bottom) / 2 - (targetRect.top + targetRect.bottom) / 2) <= 80;
        const nearRightEdge = rect.left >= targetRect.left && rect.left <= targetRect.right + 120;
        const clickableSize = rect.width >= 24 && rect.width <= 96 && rect.height >= 24 && rect.height <= 96;
        return closeVertically && nearRightEdge && clickableSize;
      })
      .sort((a, b) => {
        const aDistance = Math.abs(a.rect.left - targetRect.right);
        const bDistance = Math.abs(b.rect.left - targetRect.right);
        return aDistance - bDistance;
      })[0]?.button || null;
  }

  function focusAndSetText(target, text) {
    target.focus({ preventScroll: true });

    if (target.isContentEditable) {
      writeContentEditable(target, text);
      return;
    }

    const prototype = target.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(target, text);
    else target.value = text;

    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function writeContentEditable(target, text) {
    const selection = window.getSelection();
    const range = document.createRange();

    try {
      range.selectNodeContents(target);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("insertText", false, text);
    } catch (_) {
      // Background tabs can reject selection/edit commands. The direct write
      // below keeps queued sending working while the user is on another tab.
    }

    if (!target.textContent || target.textContent.trim() !== text.trim()) {
      target.textContent = text;
      const endRange = document.createRange();
      endRange.selectNodeContents(target);
      endRange.collapse(false);
      selection.removeAllRanges();
      selection.addRange(endRange);
    }

    target.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: text
    }));
    target.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: text
    }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function downloadVisibleImages(options = {}) {
    const onlyNew = options.onlyNew === true;
    const silent = options.silent === true;
    const waitForNew = options.waitForNew === true;
    const images = waitForNew
      ? await waitForVisibleImages({ onlyNew, timeoutSeconds: 45 })
      : visibleImageUrls();

    const unique = [...new Set(images)]
      .filter((src) => !onlyNew || !state.downloadedUrls.has(src))
      .slice(0, 200);
    if (!unique.length) {
      if (!silent) {
        setWarning("当前页面没有找到可下载图片。");
        render();
      }
      return;
    }

    for (let index = 0; index < unique.length; index += 1) {
      const url = unique[index];
      state.downloadedUrls.add(url);
      chrome.runtime.sendMessage({
        type: "download-url",
        url,
        filename: `midjourney-visible/mj-${Date.now()}-${index + 1}${guessExtension(url)}`
      });
      await sleep(120);
    }

    setStatus(`已提交 ${unique.length} 张可见图片到浏览器下载。`);
    addLog(`已提交 ${unique.length} 张可见图片到浏览器下载。`, "success");
    if (!silent) render();
  }

  function bindImageHoverDownloads() {
    ensureImageHoverOverlay();
    document.addEventListener("pointermove", handleImageHoverMove, true);
    document.addEventListener("scroll", () => repositionImageHoverOverlay(), true);
    window.addEventListener("resize", () => repositionImageHoverOverlay(), { passive: true });
  }

  function ensureImageHoverOverlay() {
    if (imageHoverOverlay || !shadow) return;
    imageHoverOverlay = document.createElement("div");
    imageHoverOverlay.className = "mj-flow-image-hover";
    imageHoverOverlay.innerHTML = `
      <button type="button" data-hover-download="all">下载全部</button>
      <button type="button" data-hover-download="one">下载</button>
    `;
    imageHoverOverlay.addEventListener("pointermove", (event) => event.stopPropagation());
    imageHoverOverlay.addEventListener("mouseleave", hideImageHoverOverlay);
    imageHoverOverlay.querySelectorAll("[data-hover-download]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const image = imageHoverTarget;
        if (!image) return;
        const urls = button.dataset.hoverDownload === "all"
          ? imageGroupUrls(image)
          : [imageUrl(image)];
        await downloadImageUrls(urls.filter(Boolean), {
          label: button.dataset.hoverDownload === "all" ? "当前图片组" : "当前图片",
          silent: true
        });
      });
    });
    shadow.appendChild(imageHoverOverlay);
  }

  function handleImageHoverMove(event) {
    if (!imageHoverOverlay) return;
    if (root && event.composedPath?.().includes(root)) return;
    const image = findDownloadableImage(event.target, event.clientX, event.clientY);
    if (!image) {
      if (!imageHoverOverlay.matches(":hover")) hideImageHoverOverlay();
      return;
    }
    imageHoverTarget = image;
    repositionImageHoverOverlay();
  }

  function findDownloadableImage(target, x, y) {
    const fromTarget = target?.closest?.("img");
    if (isDownloadableImage(fromTarget)) return fromTarget;
    const fromPoint = document.elementFromPoint(x, y);
    const image = fromPoint?.closest?.("img");
    return isDownloadableImage(image) ? image : null;
  }

  function isDownloadableImage(image) {
    if (!(image instanceof HTMLImageElement)) return false;
    const src = imageUrl(image);
    if (!/^https?:\/\//.test(src)) return false;
    if (/avatar|logo|icon|sprite|favicon|emoji/i.test(src)) return false;
    const rect = image.getBoundingClientRect();
    return rect.width >= 120 && rect.height >= 120 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
  }

  function repositionImageHoverOverlay() {
    if (!imageHoverOverlay || !isDownloadableImage(imageHoverTarget)) {
      hideImageHoverOverlay();
      return;
    }
    const rect = imageHoverTarget.getBoundingClientRect();
    const groupCount = imageGroupUrls(imageHoverTarget).length;
    imageHoverOverlay.classList.toggle("has-group", groupCount > 1);
    imageHoverOverlay.style.display = "flex";
    const overlayWidth = Math.max(58, Math.min(rect.width - 20, window.innerWidth - 16));
    const left = Math.max(8, Math.min(window.innerWidth - overlayWidth - 8, rect.left + 10));
    const top = Math.max(8, rect.top + 10);
    imageHoverOverlay.style.left = `${left}px`;
    imageHoverOverlay.style.top = `${top}px`;
    imageHoverOverlay.style.width = `${overlayWidth}px`;
  }

  function hideImageHoverOverlay() {
    if (!imageHoverOverlay) return;
    imageHoverTarget = null;
    imageHoverOverlay.style.display = "none";
  }

  async function downloadImageUrls(urls, options = {}) {
    const unique = [...new Set(urls)].filter(Boolean).slice(0, 20);
    if (!unique.length) return;
    for (let index = 0; index < unique.length; index += 1) {
      const url = unique[index];
      state.downloadedUrls.add(url);
      chrome.runtime.sendMessage({
        type: "download-url",
        url,
        filename: `midjourney-visible/mj-${Date.now()}-${index + 1}${guessExtension(url)}`
      });
      await sleep(80);
    }
    setStatus(`已提交 ${unique.length} 张${options.label || "图片"}到浏览器下载。`);
    if (!options.silent) render();
  }

  function imageGroupUrls(image) {
    const current = imageUrl(image);
    let node = image.parentElement;
    for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
      const urls = [...node.querySelectorAll("img")]
        .filter(isDownloadableImage)
        .map(imageUrl)
        .filter(Boolean);
      const unique = [...new Set(urls)];
      if (unique.length > 1 && unique.length <= 8 && unique.includes(current)) return unique;
    }
    return current ? [current] : [];
  }

  function imageUrl(image) {
    return image?.currentSrc || image?.src || "";
  }

  async function waitForVisibleImages(options = {}) {
    const onlyNew = options.onlyNew === true;
    const timeoutSeconds = Math.max(5, Number(options.timeoutSeconds) || 30);
    for (let elapsed = 0; elapsed <= timeoutSeconds; elapsed += 3) {
      const images = visibleImageUrls();
      const candidates = onlyNew
        ? images.filter((src) => !state.downloadedUrls.has(src))
        : images;
      if (candidates.length) return images;
      if (!state.running) return images;
      state.status = `等待新图片出现：${timeoutSeconds - elapsed} 秒`;
      updateStatusDisplay();
      await sleep(3000);
    }
    return visibleImageUrls();
  }

  function markVisibleImagesAsSeen() {
    visibleImageUrls().forEach((url) => state.downloadedUrls.add(url));
  }

  function exportQueue() {
    const payload = JSON.stringify(state.queue, null, 2);
    const url = `data:application/json;charset=utf-8,${encodeURIComponent(payload)}`;
    chrome.runtime.sendMessage({
      type: "download-url",
      url,
      filename: `mj-flow-queue-${new Date().toISOString().slice(0, 10)}.json`
    });
    setStatus("已导出完整队列。");
    addLog("已导出完整队列。", "success");
    render();
  }

  function exportPrompts() {
    const text = queuePromptsText();
    if (!text) {
      setWarning("队列为空，暂无可导出的提示词。");
      render();
      return;
    }
    const url = `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
    chrome.runtime.sendMessage({
      type: "download-url",
      url,
      filename: `mj-flow-prompts-${new Date().toISOString().slice(0, 10)}.txt`
    });
    setStatus("已导出纯提示词。");
    addLog("已导出纯提示词。", "success");
    render();
  }

  async function copyQueue() {
    const text = queuePromptsText();
    if (!text) {
      setWarning("队列为空，暂无可复制内容。");
      render();
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      fallbackCopyText(text);
    }
    setStatus("已复制队列提示词。");
    addLog("已复制队列提示词。", "success");
    render();
  }

  function retryFailedTasks() {
    let count = 0;
    state.queue.forEach((task) => {
      if (task.status !== "failed") return;
      task.status = "pending";
      task.error = "";
      count += 1;
    });
    setStatus(count ? `已重试 ${count} 条失败任务。` : "没有失败任务需要重试。");
    saveState();
    render();
  }

  function clearSentTasks() {
    const before = state.queue.length;
    state.queue = state.queue.filter((task) => task.status !== "sent");
    const count = before - state.queue.length;
    setStatus(count ? `已清理 ${count} 条已完成任务。` : "没有已完成任务需要清理。");
    saveState();
    render();
  }

  function queuePromptsText() {
    return state.queue.map((task) => task.prompt).filter(Boolean).join("\n");
  }

  function fallbackCopyText(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.documentElement.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function visibleImageUrls() {
    return [...document.images]
      .filter((image) => {
        const rect = image.getBoundingClientRect();
        return rect.width >= 80 && rect.height >= 80;
      })
      .map((image) => image.currentSrc || image.src)
      .filter(Boolean)
      .filter((src) => /^https?:\/\//.test(src))
      .filter((src) => !/avatar|logo|icon|sprite|favicon|emoji/i.test(src));
  }

  function guessExtension(url) {
    try {
      const pathname = new URL(url).pathname;
      const match = pathname.match(/\.(png|jpe?g|webp|gif)(?:$|\?)/i);
      return match ? `.${match[1].toLowerCase().replace("jpeg", "jpg")}` : ".jpg";
    } catch {
      return ".jpg";
    }
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        resolve(error ? { ok: false, error: error.message } : response);
      });
    });
  }

  function setStatus(message) {
    state.status = message;
    state.warning = "";
  }

  function setWarning(message) {
    state.warning = message;
  }

  function addLog(message, type = "info") {
    state.logs.push({
      message,
      type,
      time: Date.now()
    });
    if (state.logs.length > 80) state.logs = state.logs.slice(-80);
  }

  function clearLogs() {
    state.logs = [];
    setStatus("日志已清空。");
    saveState();
  }

  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString("zh-CN", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function shorten(value) {
    const text = String(value);
    return text.length > 72 ? `${text.slice(0, 72)}...` : text;
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
