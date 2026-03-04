const fs = require('fs');
const path = require('path');

const zhPath = 'd:/Projects/Geni/src/common/i18n/locales/zh.json';
const enPath = 'd:/Projects/Geni/src/common/i18n/locales/en.json';

const zhData = JSON.parse(fs.readFileSync(zhPath, 'utf8'));
const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));

zhData.generalSettings = {
    language: "语言",
    zh: "中文",
    en: "English",
    autoStart: "开机自启动",
    autoStartDesc: "系统启动时自动运行应用"
};

enData.generalSettings = {
    language: "Language",
    zh: "中文",
    en: "English",
    autoStart: "Auto Start",
    autoStartDesc: "Run application automatically on system startup"
};

zhData.modelSettings = {
    search: "搜索...",
    addProvider: "添加自定义提供商",
    namePlaceholder: "提供商名称 (如 My-LLM)",
    add: "添加",
    cancel: "取消",
    deleteConfirm: "确认删除 \"{{key}}\" 配置吗?",
    customProvider: "自定义提供商",
    on: "ON",
    deleteProvider: "删除提供商",
    officialDocs: "官方文档",
    currentlyEnabled: "当前已启用",
    clickToEnable: "点击启用此模型",
    apiKey: "API 密钥",
    localOnly: "仅存储于本地",
    apiUrl: "API 地址 (Base URL)",
    modelName: "模型名称 (Model)",
    modelDesc: "手动输入要使用的模型 ID，例如: gpt-4o",
    testConnection: "测试连接",
    testing: "连接中...",
    connected: "已连接"
};

enData.modelSettings = {
    search: "Search...",
    addProvider: "Add Custom Provider",
    namePlaceholder: "Provider Name (e.g. My-LLM)",
    add: "Add",
    cancel: "Cancel",
    deleteConfirm: "Are you sure to delete \"{{key}}\" config?",
    customProvider: "Custom Provider",
    on: "ON",
    deleteProvider: "Delete Provider",
    officialDocs: "Official Docs",
    currentlyEnabled: "Currently Enabled",
    clickToEnable: "Click to enable this model",
    apiKey: "API Key",
    localOnly: "Stored locally only",
    apiUrl: "API URL (Base URL)",
    modelName: "Model Name (Model)",
    modelDesc: "Manually enter the model ID to use, e.g.: gpt-4o",
    testConnection: "Test Connection",
    testing: "Testing...",
    connected: "Connected"
};

zhData.personaSettings = {
    title: "个性化提示词 (Persona)",
    desc: "定义 Agent 的身份、行为准则和回复风格",
    reset: "恢复默认",
    save: "保存修改",
    promptPlaceholder: "输入系统提示词以自定义 Agent 的行为...",
    expertTip: "专家提示",
    expertDesc: "系统提示词是 Agent 的“灵魂”。你可以通过修改它来改变 Agent 的工作语言（如强制使用某种语言）、工作风格（如简洁或详尽）以及它对工具使用的优先级。改动将在下一次开启对话时生效。"
};

enData.personaSettings = {
    title: "Persona Settings",
    desc: "Define the Agent's identity, behavior guidelines, and response style",
    reset: "Reset to Default",
    save: "Save Changes",
    promptPlaceholder: "Enter system prompt to customize Agent behavior...",
    expertTip: "Expert Tip",
    expertDesc: "The system prompt is the 'soul' of the Agent. You can modify it to change its working language, style, and tool priority. Changes take effect on the next conversation."
};

zhData.coreToolSettings = {
    title: "内置核心工具",
    desc: "管理内置核心工具的启用状态和授权策略。",
    search: "搜索工具...",
    loading: "正在加载工具...",
    columns: {
        tool: "工具",
        status: "状态",
        auth: "授权方式",
        desc: "描述"
    },
    ask: "需确认 (Ask)",
    auto: "自动批准 (Auto)",
    noDesc: "无描述",
    noMatch: "未发现匹配的内置工具",
    authNoteTitle: "授权说明",
    authNoteDesc: "设置为“自动批准 (Auto)”将允许 AI 在不显示确认对话框的情况下直接执行该工具。为了安全起见，建议仅在涉及文件读取或目录浏览等不修改系统状态的操作时使用此模式。"
};

enData.coreToolSettings = {
    title: "Built-in Core Tools",
    desc: "Manage enable status and authorization policies of built-in core tools.",
    search: "Search tools...",
    loading: "Loading tools...",
    columns: {
        tool: "Tool",
        status: "Status",
        auth: "Authorization",
        desc: "Description"
    },
    ask: "Ask Confirmation",
    auto: "Auto-approve",
    noDesc: "No description",
    noMatch: "No matching built-in tools found",
    authNoteTitle: "Authorization Note",
    authNoteDesc: "Setting to 'Auto-approve' allows the AI to execute the tool directly without confirmation. For safety, it is recommended to use this mode only for read-only operations."
};

zhData.mcpSettings = {
    addServer: "添加服务器",
    serverIdPlaceholder: "服务器名称 (ID)",
    duplicateName: "服务器名称已存在！",
    add: "添加",
    cancel: "取消",
    unnamed: "Unnamed",
    on: "ON",
    noMatch: "未找到相关服务器",
    empty: "暂无服务器",
    search: "搜索服务器...",
    generalSettings: "通用设置",
    availableTools: "可用工具",
    deleteServer: "删除服务器",
    connectionFailed: "连接失败",
    enableServer: "启用此服务器",
    enableDesc: "启用后将自动加载工具",
    name: "名称 (Name)",
    nameDesc: "唯一标识符，用于区分不同的 MCP 服务器",
    transport: "传输类型 (Transport)",
    stdioDesc: "Stdio (本地命令)",
    sseDesc: "SSE (远程服务器)",
    url: "服务器地址 (URL)",
    urlDesc: "SSE 端点地址，通常以 /sse 结尾",
    apiKey: "API 密钥 (可选)",
    localOnly: "仅存储于本地",
    command: "命令 (Command)",
    commandDesc: "用于启动 MCP 服务器的可执行命令",
    args: "参数 (Arguments)",
    argsDesc: "以空格分隔的命令行参数",
    testConnection: "测试连接",
    connecting: "连接中...",
    connected: "已连接",
    notConnected: "尚未连接",
    notConnectedDesc: "请在“通用设置”中连接服务器以查看可用工具",
    toolsList: "可用工具列表",
    count: "共 {{count}} 个",
    columns: {
        tool: "工具",
        status: "状态",
        auth: "授权方式",
        desc: "描述"
    },
    ask: "需确认 (Ask)",
    auto: "自动批准 (Auto)",
    noDesc: "无描述",
    noToolsReturn: "此服务器未返回任何工具",
    noServerTitle: "未选择服务器",
    noServerDesc: "从左侧列表选择一个服务器进行配置"
};

enData.mcpSettings = {
    addServer: "Add Server",
    serverIdPlaceholder: "Server Name (ID)",
    duplicateName: "Server name already exists!",
    add: "Add",
    cancel: "Cancel",
    unnamed: "Unnamed",
    on: "ON",
    noMatch: "No matching servers found",
    empty: "No servers available",
    search: "Search servers...",
    generalSettings: "General Settings",
    availableTools: "Available Tools",
    deleteServer: "Delete Server",
    connectionFailed: "Connection Failed",
    enableServer: "Enable Server",
    enableDesc: "Tools will be loaded automatically when enabled",
    name: "Name",
    nameDesc: "Unique identifier for the server",
    transport: "Transport Type",
    stdioDesc: "Stdio (Local Command)",
    sseDesc: "SSE (Remote Server)",
    url: "Server URL",
    urlDesc: "SSE endpoint address, usually ends with /sse",
    apiKey: "API Key (Optional)",
    localOnly: "Stored locally only",
    command: "Command",
    commandDesc: "Command to start the MCP server",
    args: "Arguments",
    argsDesc: "Space-separated command-line arguments",
    testConnection: "Test Connection",
    connecting: "Connecting...",
    connected: "Connected",
    notConnected: "Not Connected",
    notConnectedDesc: "Please connect the server in 'General Settings' to view available tools",
    toolsList: "Available Tools List",
    count: "Total {{count}}",
    columns: {
        tool: "Tool",
        status: "Status",
        auth: "Authorization",
        desc: "Description"
    },
    ask: "Ask",
    auto: "Auto",
    noDesc: "No description",
    noToolsReturn: "This server returned no tools",
    noServerTitle: "No Server Selected",
    noServerDesc: "Select a server from the left list to configure"
};

zhData.imSettings = {
    title: "Telegram 机器人",
    desc: "建立 Telegram Bot，让你在移动端也可以随时召唤 Geni 代理处理任务。",
    tokenLabel: "Bot Token",
    tokenDesc: "在 Telegram 搜索 @BotFather，创建一个新 Bot 并获取 Token。",
    proxyLabel: "HTTP 代理地址 (可选)",
    proxyDesc: "国内网络连接 Telegram 可能会超时，可在此填写本地科学上网代理。",
    saving: "保存配置",
    saved: "已保存"
};

enData.imSettings = {
    title: "Telegram Bot",
    desc: "Setup a Telegram Bot to summon your Geni agent on your mobile device.",
    tokenLabel: "Bot Token",
    tokenDesc: "Search @BotFather in Telegram to create a new Bot and get its Token.",
    proxyLabel: "HTTP Proxy URL (Optional)",
    proxyDesc: "Use a proxy if your network cannot connect to Telegram directly.",
    saving: "Save Config",
    saved: "Saved"
};

fs.writeFileSync(zhPath, JSON.stringify(zhData, null, 4));
fs.writeFileSync(enPath, JSON.stringify(enData, null, 4));
console.log('done');
