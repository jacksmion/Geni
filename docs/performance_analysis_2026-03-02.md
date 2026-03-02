# Geni 性能问题分析与改进方案 (2026-03-02)

## 📌 问题现象
从输入问题到大模型产生响应期间存在 1~2 秒的初始网络请求感知延时，而早期的版本中没有该问题。

## 🔍 原因分析

经过对代码架构（特别是 Phase 1 和 Phase 2 的重构）的全面审查，发现导致目前延时的主要原因集中在 **网络连接冷启动** 和 **主线程同步阻塞** 两个方面：

### 1. 核心原因：LLM Adapter 每次请求均重新实例化（TCP/TLS 握手延迟严重）
在 `Phase 2: 认知层抽象` 重构之后，引入了统一的接口 `IChatModel`。`AgentRuntime.run()` 方法在每次处理用户请求时，都会执行 `createChatModel(...)` 函数。
在 `ChatModelFactory.ts` 及 `OpenAIAdapter.ts` 内部，这会导致每次产生新的 `new OpenAI(...)` 客户端实例对象。
- **负面影响**：Node.js 原本的底层的 HTTP Agent TCP Connection Pool（Keep-Alive 长连接）完全失效。每次消息收发都需要重新经历漫长的 `DNS 解析 -> TCP 握手 -> TLS 安全握手`。如果网络环境并不理想，仅仅前置冷启动就很容易产生 0.5s ~ 1.5s 的纯网络延时。早期版本通常将 OpenAI Client 维持单例，因此请求是极其“丝滑”的秒发。

### 2. 重要原因：密集的同步文件 I/O (阻塞 Node.js 主线程)
从用户由于点击`发送`，到正式发起对大模型的网络请求，存在密集的物理磁盘阻塞读写：
- **存入消息流**：UI 异步调用 `SessionManager.addMessage`，底层执行了 `fs.writeFileSync` (写当前 Session 的 JSON) 和 `fs.writeFileSync` (写 index.json)。
- **频繁加载设定**：工具或者 Agent 控制器等在启动或提取技能数据时，频繁高频调用了 `this.configManager.load()`。而该方法的内部直接采用 `fs.readFileSync('settings.json')`。
- **负面影响**：由于 Node.js 是单线程的，哪怕一次 `fs.writeFileSync` 落盘动作由于系统负载或诸如 Windows Defender 等防病性扫描介入而消耗上百毫秒，整个主线程将被长期挂起，期间无法派发或处理网络层的第一步事件阶段。

### 3. 此要或加剧原因：Function Calling 构建的 JSON Payload 过大
第二阶段的重构 `convertTools` 函数将所有的本地应用工具甚至可能的外源 MCP Tool 全部一股脑转换为 JSON Schema 并随着请求发送给 LLM。开启巨量工具或 MCP 时，大幅加长了 Context，同时也显著放大了首 Token 输出（Prefill 阶段）所需的推理时间。

---

## 🛠️ 改进方案

为了达到“修改简单、收益显著”的目标恢复丝滑的体验，提出以下两大改进方案：

### 方案一：LLM Client 的实例级缓存（彻底解决 TCP 断连引起的网络握手延时）
**实施点**：`src/main/services/llm/ChatModelFactory.ts`
1. 引入简单的对象层级内存缓存映射 `const modelCache = new Map<string, IChatModel>()`。
2. 使用诸如Provider、API Key 和 BaseUrl 的哈希拼接来构建 Cache Key。
3. 改造 `createChatModel` 函数：只有配置参数实质性变更时才产生新的实例，其余情况下直接返回重用的缓存实例。

### 方案二：采用异步 I/O 与内存预存 (消解主线程同步卡顿)
**实施点**：`src/main/services/ConfigManager.ts` 等
1. 在 `ConfigManager` 中增设私有变量记录 `this.cachedSettings` 并懒加载预存，当 `load()` 被调用时可极速从内存返回避免触发 `fs.readFileSync`（主线程阻塞）。
2. 在所有执行 `save` 落盘的位置将 `fs.writeFileSync` 转换为 `fs.promises.writeFile`。
3. 如果必须执行同步接口防打断数据流（例如 Session Index 更新），可尽量前置处理或包装进入宏微任务挂起（使用 `setTimeout` 隔离在发包后面进行落盘）。
