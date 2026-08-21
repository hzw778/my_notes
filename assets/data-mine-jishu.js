window.TAB_DATA = window.TAB_DATA || {};
(function () {
  var mine = window.TAB_DATA["mine"] || (window.TAB_DATA["mine"] = { key: "mine", title: "我的整理（本地笔记）", url: "", chapters: [] });
  mine.chapters.push({
    "no": "1",
    "title": "技术派·ReAct+plan+Multi-Agent（3 题）",
    "questions": [
      { "t": "文章导读与背景", "tag": "技术派·ReAct+plan+Multi-Agent", "p": "core", "html": `<p>第一弹，聚焦 <strong>Agent 核心架构</strong>——ReAct、Plan-and-Execute、Multi-Agent、异步并行。</p>
<p>这几个方向面试出现的频率最高，也是 PaiCLI 第 1、2、5、7 期的核心内容。</p>` },
      { "t": "01、什么是 ReAct 模式？", "tag": "技术派·ReAct+plan+Multi-Agent", "p": "core", "html": `<p>ReAct 是 Reasoning + Acting 的缩写，Yao et al.（姚顺雨）在 2022 年提出。</p>
<p>核心就一句话：让 LLM 在推理的同时能执行动作，根据动作结果继续推理，形成一个闭合的循环。</p>
<p><img src="assets/jimg/17ec57fc42ca3bfcbd492b48ea9d8f14.png" decoding="async" fetchpriority="high" width="2808" height="2758"></p>
<p>PaiCLI 第一期的 <code>Agent.java</code> 就是一个标准的 ReAct 实现。核心是一个 while 循环，每轮做三件事：</p>
<ul>
 <li>把消息历史发给 LLM、</li>
 <li>检查响应里有没有 <code>tool_calls</code></li>
 <li>有的话执行工具把结果塞回历史。</li>
</ul>
<p>LLM 不再返回 <code>tool_calls</code> 就退出循环，把最终回复输出给用户。</p>
<p>整个 Agent 的骨架就这么简单。</p>
<h3>它和 Chain-of-Thought 有什么区别？</h3>
<p>Chain-of-Thought（CoT）只推理不执行。</p>
<p>LLM 一口气想完所有步骤，直接输出最终答案。做数学题、逻辑推理可以，但碰到“帮我读一下 pom.xml”这种需要外部信息的任务就歇菜了——LLM 没有读文件的能力，想得再好也是瞎猜。</p>
<p><img src="assets/jimg/309db8320d23e618fa6660cabbb2f734.jpg" decoding="async" loading="lazy" fetchpriority="low" width="3276" height="2994"></p>
<p>ReAct 的突破在于加了 Action 和 Observation 两个环节。LLM 想到“我需要读 pom.xml”，就输出一个 <code>read_file</code> 的 tool_call，Agent 真去读了文件，把内容返回回来，LLM 基于真实的内容继续推理。</p>
<p>用一个表格说清楚两者的边界：</p>
<table>
 <thead>
  <tr>
   <th>维度</th>
   <th>CoT</th>
   <th>ReAct</th>
  </tr>
 </thead>
 <tbody>
  <tr>
   <td>能力范围</td>
   <td>纯推理</td>
   <td>推理 + 外部工具调用</td>
  </tr>
  <tr>
   <td>信息来源</td>
   <td>训练数据里的知识</td>
   <td>实时获取（文件、命令、搜索）</td>
  </tr>
  <tr>
   <td>适合场景</td>
   <td>数学、逻辑、代码生成</td>
   <td>需要与外部世界交互的任务</td>
  </tr>
  <tr>
   <td>典型产品</td>
   <td>ChatGPT 的思考过程</td>
   <td>Claude Code、PaiCLI、Cursor</td>
  </tr>
 </tbody>
</table>
<p>面试官追问到这一步，可以补一句：</p>
<p>PaiCLI 的 LLM 响应里也有 <code>reasoning_content</code>（思考过程），这个其实就是 CoT 的部分。</p>
<p>ReAct 不是替代 CoT，而是在 CoT 的基础上加了行动能力。PaiCLI 的源码里，<code>reasoning_content</code> 只写日志不进下一轮对话历史，避免思考过程占用 Token 预算。</p>` },
      { "t": "02、Agent 怎么知道该调用哪个工具？", "tag": "技术派·ReAct+plan+Multi-Agent", "p": "core", "html": `<p>这道题很多人会答错，以为 Agent 里有个什么路由规则在做工具匹配。实际上 <strong>Agent 本身不做工具选择，选择权完全在 LLM 手里</strong>。</p>
<p>流程是这样的：Agent 在构造请求时，把所有可用工具的定义（名称 + 描述 + 参数 JSON Schema）放在请求体的 <code>tools</code> 字段里发给 LLM。LLM 根据用户意图和工具描述，在响应的 <code>tool_calls</code> 字段里返回工具名和参数 JSON。</p>
<p>这就是 OpenAI 定义的 <strong>Function Calling</strong> 协议，GLM、DeepSeek、Kimi 这些国产模型也都兼容。</p>
<p><img src="assets/jimg/2254cba36fc45bc885fdcd9fe606b911.jpg" decoding="async" loading="lazy" fetchpriority="low" width="3196" height="2570"></p>
<p>PaiCLI 的 <code>ToolRegistry.java</code> 维护了一个工具注册表。每个工具注册时提供 name、description、parameters schema。Agent 每次请求 LLM 前，从注册表拉出全量工具定义塞进请求体。LLM 返回 <code>tool_calls: [{name: "read_file", arguments: {path: "pom.xml"}}]</code>，Agent 就从注册表里找到 <code>read_file</code> 的执行逻辑来跑。</p>
<pre><code class="language-java">// ToolRegistry.java 核心结构
private final Map<String, ToolDefinition> tools = new LinkedHashMap<>();
private final Map<String, ToolExecutor> executors = new LinkedHashMap<>();

public String executeTool(String name, String argumentsJson) {
    ToolExecutor executor = executors.get(name);
    if (executor == null) {
        return "未知工具: " + name;
    }
    return executor.execute(argumentsJson);
}
</code></pre>
<p>这里有个实战经验值得提一下：<strong>工具描述的质量直接决定 LLM 的选择准确率</strong>。</p>
<p>PaiCLI 早期 <code>execute_command</code> 的描述写得太简洁，LLM 经常用...</p>` }
    ]
  });

  mine.chapters.push({
    "no": "2",
    "title": "技术派·Memory与Context（4 题）",
    "questions": [
      { "t": "文章导读与背景", "tag": "技术派·Memory与Context", "p": "core", "html": `<p>老王这次换了副金丝眼镜，像极了某个互联网大厂的 CTO，眼神犀利但嘴角带笑，看起来今天心情不错。</p>
<p>老王翻了翻我的简历，“你这个 PaiCLI 写了三层记忆架构、RAG 向量检索、长上下文自适应，挺能吹的啊。”</p>
<p>（内心 OS：王哥你别说吹，这些我一行一行码出来的😤）</p>
<p>我说：“王哥，这几块确实是 PaiCLI 的核心。记忆系统做了三期，第 3 期做 Memory、第 4 期做 RAG 代码库理解、第 12 期做长上下文工程。最近还做了两个升级——长期记忆加了项目级隔离，代码检索从 RAG 一把梭改成了精确搜索优先、RAG 语义兜底。”</p>
<p>老王露出感兴趣的表情：“行，那就从记忆系统开始聊。”</p>` },
      { "t": "01、Agent 的记忆系统分哪几层", "tag": "技术派·Memory与Context", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·Memory与Context", "p": "core", "html": `<p>老王问：“先说说整体架构，你们的记忆系统是怎么分层的？”</p>
<p>我说：“三层。短期记忆、长期记忆、外部记忆。”</p>
<p><img src="assets/jimg/1e4626397a789df80630d790a612f7b7.jpg" decoding="async" fetchpriority="high" width="3312" height="2482"></p>
<p>短期记忆就是当前对话的消息历史——用户输入、模型回复、工具调用和结果，每一轮都在追加。生命周期是一次会话，关掉终端就没了。</p>
<p>长期记忆是跨会话持久的。</p>
<p>用户说“记一下这个项目用 Java 17”，Agent 就把这条事实写到本地 JSON 文件里。下次开新会话，Agent 从文件里检索和当前对话相关的条目，注入到上下文中。这样跨会话 Agent 也能“记住”用户的偏好和项目背景。</p>
<p>外部记忆就是通过检索访问的外部知识库，不在对话历史里常驻，需要的时候按需查。</p>
<p>PaiCLI 的外部记忆有两条路：</p>
<ul>
 <li>一条是精确搜索，按关键字或正则实时扫描项目文件树；</li>
 <li>另一条是 RAG 向量语义检索，从预建的 Embedding 索引里找相关代码段。</li>
</ul>
<p>Agent 优先走精确搜索，只有查询太模糊、关键词难确定的时候才走 RAG。</p>
<p>老王追问：“三层之间怎么协调？”</p>
<p>我说：“有一个统一的管理者负责协调。每轮请求模型之前，它会做三件事：从长期记忆里检索相关条目，从外部记忆拿到检索结果，然后把这些和短期记忆里的对话历史一起拼装成完整的 prompt 发给模型。三层各司其职，管理者负责‘调度’。”</p>` },
      { "t": "02、短期记忆会溢出吗", "tag": "技术派·Memory与Context", "p": "core", "html": `<p>老王问：“对话聊久了，短期记忆会不会撑爆上下文窗口？”</p>
<p>我说：“会。”</p>
<p>模型有上下文窗口限制，GLM-5.1 是 2...</p>` }
    ]
  });

  mine.chapters.push({
    "no": "3",
    "title": "技术派·tool call 和 HITL（1 题）",
    "questions": [
      { "t": "01、Function Calling 的原理是什么", "tag": "技术派·tool call和HITL", "p": "core", "html": `<p>老王开门见山：“很多人觉得大模型能‘调用工具’很神奇，你给我讲讲 Function Calling 到底是怎么回事。”</p>
<p>Function Calling 是一个协议约定。</p>
<p>客户端在请求里声明有哪些工具可以用，包括工具名、功能描述、参数的 JSON Schema。LLM 在生成响应的时候，如果判断当前任务需要工具辅助，它会在响应里输出一段 JSON，告诉客户端“我想调用这个工具，参数是这些”。然后客户端拿到这段 JSON，自己去执行对应的逻辑，把执行结果包装成 tool message 塞回对话历史，再请求一次 LLM，LLM 看到结果继续推理。</p>
<p><img src="assets/jimg/a2f7b2303d10d568c9f95d9f4489218c.jpg" decoding="async" fetchpriority="high" width="2960" height="2830"></p>
<p>所以本质上 LLM 是一个“决策者”，它决定用什么工具、传什么参数，但真正的“执行权”在客户端。</p>
<p>PaiCLI 的 ToolRegistry 维护了工具名到执行函数的映射表，LLM 说“我要调 read_file”，Agent 就从注册表里找到 read_file ...</p>` }
    ]
  });

  mine.chapters.push({
    "no": "4",
    "title": "技术派·MCP+CDP（3 题）",
    "questions": [
      { "t": "01、MCP 是什么，解决了什么问题", "tag": "技术派·MCP+CDP", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·MCP+CDP", "p": "core", "html": `<p>MCP 全称 Model Context Protocol，是 A 厂在 2024 年底推出的开放协议，一句话概括就是：<strong>给 AI 应用和外部工具之间定了一套标准通信接口</strong>。</p>
<p><img src="assets/jimg/28f13a6f8b206dddd0612570a59593de.png" decoding="async" fetchpriority="high" width="960" height="540"></p>
<h4>为什么需要这个协议？</h4>
<p>没有 MCP 之前，每个 AI 应用想接入一个新工具就得自己写一套定制代码，你写你的，我写我的，重复劳动。</p>
<p>Claude Code 要接入 GitHub，写一套；Qoder 要接入 GitHub，再写一套——干的活一模一样，但代码完全不能复用。</p>
<p>有了 MCP 就不一样了，GitHub 官方只需要写一个 MCP Server，所有支持 MCP 的 AI 应用直接接入，和当年 USB 统一接口一个道理。</p>
<h4>它具体解决了哪几个问题</h4>
<p>说白了就三件事。</p>
<p><img src="assets/jimg/cd05a5f1e7b58580c680b71a5f897d34.jpg" decoding="async" loading="lazy" fetchpriority="low" width="2848" height="3058"></p>
<p><strong>工具发现</strong>——Host 启动 MCP Server 后，调一次 tools/list 就知道这个 Server 能干啥，不用提前硬编码。</p>
<p><strong>工具调用</strong>——统一走 tools/call 接口，不管底层是 Git 操作、浏览器操控还是数据库查询，调用方式一模一样，对 Agent 来说完全无感。</p>
<p><strong>数据访问</strong>——resources/list 加 resources/read 让 Server 暴露可读取的数据源，LLM 需要上下文的时候直接拿。</p>` },
      { "t": "02、MCP 的 stdio 传输和 Streamable HT...", "tag": "技术派·MCP+CDP", "p": "core", "html": `` }
    ]
  });

  mine.chapters.push({
    "no": "5",
    "title": "技术派·Prompt与Skill（3 题）",
    "questions": [
      { "t": "文章导读与背景", "tag": "技术派·Prompt与Skill", "p": "core", "html": `<p>AI Agent 面试题系列第五弹，这次聊的是<strong>Prompt 与 Skill。</strong></p>
<p>Prompt 是 Agent 的灵魂。</p>
<p>写得好，Agent 知道什么时候该用什么工具、碰到异常该怎么处理；写得差，Agent 干啥啥不行。</p>
<p>而 <strong>Skill</strong> 是把 prompt 工程化的手段——从“一坨几千字的 system prompt”变成“按场景按需加载的专家手册”，既能降低 token 的消耗，又能提升 Agent 的行为质量。</p>
<p><img src="assets/jimg/529bfd3ec60dac08964a30b6509d0ccf.jpg" decoding="async" fetchpriority="high" width="4048" height="2762"></p>` },
      { "t": "01、Agent 的 system prompt 一般包含哪些内容？", "tag": "技术派·Prompt与Skill", "p": "core", "html": `<p>PaiCLI 的 system prompt 可以概括为四个核心模块。</p>
<p>首先是<strong>角色定义</strong>，告诉 LLM 你是谁、能做什么。PaiCLI 的 base.md 第一段就写了：你是 PaiCLI，一个面向代码库工作的智能编程 Agent。</p>
<p><img src="assets/jimg/paicli-interview-prompt-skill-20260528104912.png" decoding="async" loading="lazy" fetchpriority="low" width="2444" height="1326"></p>
<p>然后是<strong>行为规范</strong>，负责输出格式、语调等。比如 base.md 里有个 <code>## Language</code> 模块，明确写了“请用中文回复用户”，代码和 API 名称才保留原文。组装的时候会要求这个模块必须存在。</p>
<p>第三块是<strong>工具使用指导</strong>。不能只写“合理使用工具”这类泛化要求，而要具体到场景——读文件用 <code>read_file</code>，不要用 <code>execute_command cat</code>。</p>
<p>第四块是<strong>安全约束</strong>，明确哪些操作不能做、哪些操作需要用户确认。</p>` },
      { "t": "02、Prompt 分层架构是怎么设计的？", "tag": "技术派·Prompt与Skill", "p": "core", "html": `<p>PaiCLI 早期的 system prompt 是硬编码在 Java 代码里的，改一句话要重新编译。后来做了分层改造，把 system prompt 拆分成独立的 Markdown 文件，按职责分目录存放。</p>
<p>先看目录结构：</p>
<pre><code>src/main/resources/prompts/
├── base.md        ...</code></pre>` }
    ]
  });

  mine.chapters.push({
    "no": "6",
    "title": "技术派·TUI、LSP、Git、Runtime API（3 题）",
    "questions": [
      { "t": "01、Agent CLI 的终端渲染有哪些方案", "tag": "技术派·TUI/LSP/Git/Runtime", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·TUI/LSP/Git/Runtime", "p": "core", "html": `<p>三种。</p>
<p>第一种是纯文本输出。</p>
<p>直接 print。好的地方是兼容性最强，任何终端都能正常显示。不好的地方也很明显，没有颜色、没有折叠、没有状态栏，信息密度低，用户体验差。</p>
<p>第二种是 Inline 流式输出，也是 PaiCLI 的默认方案。底部固定一个状态栏，显示当前模型、token 用量、上下文窗口占比、运行耗时。</p>
<p>最关键的是工具调用可以折叠。比如说 Agent 读了 3 个文件，终端只显示一行折叠摘要，按 Ctrl+O 展开可以查看具体内容。文件修改也有行内 diff 对比，改了什么一目了然。</p>
<p><img src="assets/jimg/paicli-interview-productization-20260529075735.png" decoding="async" fetchpriority="high" width="3520" height="1790"></p>
<p>第三种是全屏 TUI。独占整个终端窗口，可以做文件树、分栏布局、弹窗。用户体验最丰富，但需要全屏模式。PaiCLI 基于 Lanterna 库实现了这个方案，有对话区、状态栏和模态弹窗做审批确认。</p>
<p>最终我们选择了 Inline 作为默认的交互方式，因为它在信息密度和用户体验之间达到了一个不错的平衡。比较接近Claude Code和Qoder CLI的交互方式。</p>` },
      { "t": "02、DECSTBM 是什么？状态栏怎么实现的", "tag": "技术派·TUI/LSP/Git/Runtime", "p": "core", "html": `<p>DECSTBM 全称是 DEC Set Top and Bottom Margins，是 VT100 终端定义的转义序列，用来设置终端的滚动区域。</p>
<p>可以通过一条 <code>ESC[1;{n}r</code> 指令，告诉终端只有第 1 行到第 n 行参与滚动，剩下的行保持不动。</p>
<p><img src="assets/jimg/paicli-interview-productization-20260529080844.png" decoding="async" loading="lazy" fetchpriority="low" width="3576" height="1674"></p>
<p>PaiCLI 的做法是把终端底部留出 2 行不参与滚动。主内容在上方正常滚动输出，底部 2 行始终固定显示状态信息。</p>
<p>第一行是核心状态，包括 HITL 审批开关、MCP Server 连接数、Skill 加载数。</p>
<p>第二行是运行时数据，包括当前模型名称、运行阶段、上下文窗口使用率（用进度条可视化显示占比）、输入输出 token 数、缓存命中数、预估费用、运行耗时和当前工作目录。</p>
<p>注意，不是所有终端都支持 DECSTBM。</p>
<p>PaiCLI 在初始化时会检测终端能力，检查是否支持 ANSI、终端尺...</p>` }
    ]
  });

  mine.chapters.push({
    "no": "7",
    "title": "技术派·多模型和提示词缓存（4 题）",
    "questions": [
      { "t": "文章导读与背景", "tag": "技术派·多模型和提示词缓存", "p": "core", "html": `<p>老王这次没废话，直接开问：“PaiCLI 接了几家大模型？”</p>
<p>“目前支持 GLM、DeepSeek、Kimi、StepFun。”</p>
<p>“那你 API 调用的代码是不是写了四遍？”老王的语气里带着一点挑衅。</p>
<p>我笑了：“那不至于，一个基类搞定，每个 Provider 实现就二三十行。”</p>` },
      { "t": "01、怎么设计一个支持多模型的 LLM 客户端接口？", "tag": "技术派·多模型和提示词缓存", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·多模型和提示词缓存", "p": "core", "html": `<p>策略模式。定义一个统一接口，每个模型的 Provider 自己实现差异化逻辑。</p>
<p>接口需要声明两组能力。</p>
<p>第一组是行为能力，也就是对话方法。一般设计两个 chat 方法，一个带流式监听器参数，一个不带。不带监听器的方法内部调用带监听器的。</p>
<p>第二组是声明式能力。包括模型名称、Provider 名称、最大上下文窗口、是否支持提示词缓存、缓存模式等等。</p>
<pre><code class="language-java">public interface LlmClient {
    ChatResponse chat(List<Message> messages, List<Tool> tools) throws IOException;
    ChatResponse chat(List<Message> messages, List<Tool> tools,
                      StreamListener listener) throws IOException;
    String getModelName();
    String getProviderName();
    default int maxContextWindow() { return 128_000; }
    default boolean supportsPromptCaching() { return false; }
    default String promptCacheMode() { return "none"; }
}
</code></pre>
<h4>为什么要把能力声明放在接口里？</h4>
<p>因为上下文管理模块需要根据模型能力做策略调整。</p>
<p>短期记忆预算、压缩触发阈值、MCP 资源索引，这些参数全部可以从上下文窗口大小推导出来。</p>
<p>接口声明了这些能力后，上层不需要写 if-else 判断“当前是哪个模型”，直接读接口方法的返回值就行。</p>
<p>四个 Provider 实现类共享一个基类，负责通用的 SSE 解析和 HTTP 请求逻辑，每个子类只覆盖 API 地址、默认模型名、API Key 来源这几个差异点。</p>` },
      { "t": "02、模板方法模式在多模型适配里怎么用？", "tag": "技术派·多模型和提示词缓存", "p": "core", "html": `<p>都兼容 OpenAI 协议。</p>
<p>就是把相同的部分提到基类里，子类只覆盖差异点。</p>
<p>基类的 chat 方法定义了完整的 SSE 请求-响应流程：构建请求体、发送 HTTP 请求、逐行解析 SSE 流、合并增量 tool_calls、提取 usage 统计、返回最终响应等。</p>
<p><img src="assets/jimg/paicli-interview-multi-model-20260530110004.png" decoding="async" fetchpriority="high" width="3668" height="2514"></p>
<p>所有 Provider 都是一样的。</p>
<p>子类只需要覆盖三个抽象方法：API 端点地址、默认模型名、API Key。</p>
<p>拿 DeepSeek 的实现来说，整个类不到 60 行代码，SSE 解析、tool_calls 合并、HTTP 超时处理一行没写，全在基类里。</p>
<pre><code class="language-java">// DeepSeek 的实现，继承基类后只需覆盖差异点
protected String getApiUrl() { return "https://api.deepseek.com/chat/completions"; }
protected String getModel()  { return "deepseek-v4-flash"; }
protected String getApiKey() { return apiKey; }
public int maxContextW...</code></pre>` }
    ]
  });

  mine.chapters.push({
    "no": "8",
    "title": "技术派·grep 和 RAG（9 题）",
    "questions": [
      { "t": "文章导读与背景", "tag": "技术派·grep和RAG", "p": "core", "html": `<p>大家好，我是二哥呀。</p>
<p>有没有想过？</p>
<p>Claude Code 的代码搜得又快又准，到底是怎么实现的？</p>
<p><img src="assets/jimg/3a2fd3b0f453d5c1325b945bd32d6b3e.jpg" decoding="async" fetchpriority="high" width="4048" height="2340"></p>
<p>我花了一早上时间，认真研究了会，翻了翻 Anthropic 首席工程师 Boris Cherny 的播客、亚马逊科学团队发的论文、Cursor 官方博客的论证、Claude Code 源码，把这件事从头到尾捋了一遍。</p>
<blockquote>
 <p>系好安全带，我们粗粗发～</p>
</blockquote>` },
      { "t": "01、Claude Code 到底怎么查找代码的？", "tag": "技术派·grep和RAG", "p": "core", "html": `<p>先回答最基本的问题：Claude Code 在分析代码仓库时，用的是什么工具？</p>
<p>答案很简单——三个工具：<strong>Glob、Grep、Read</strong>。</p>
<p>是不是很意外，是不是很惊喜？</p>
<p><img src="assets/jimg/e37b21cce5581b9e5326eac6c9ceb7ee.jpg" decoding="async" loading="lazy" fetchpriority="low" width="3172" height="2014"></p>
<ul>
 <li>Glob 负责按文件名模式匹配，比如 <code>**/*.java</code> 找出所有 Java 文件。返回的结果按修改时间排序。</li>
 <li>Grep 负责在文件内搜索，底层用的是 ripgrep（一个 Rust 写的高性能搜索工具）。比如我们想找哪个文件里用了 <code>@Transactional</code> 注解，Grep 很快就能返回结果。</li>
 <li>Read 负责读取具体文件的内容。可以读整个文件，也可以指定行号范围只读一部分。支持图片、PDF、Jupyter Notebook，覆盖面很广。</li>
</ul>
<p>没有向量数据库，没有 Embedding 模型，没有索引构建过程，没有 Chunk 分片策略。</p>
<p>Claude Code 拿到一个任务之后，先用 Glob 看看目录结构，再用 Grep 搜关键词，最后用 Read 读取相关文件。</p>
<p><img src="assets/jimg/8905383b4c5e69fb8043fb939affeadf.jpg" decoding="async" loading="lazy" fetchpriority="low" width="2048" height="2048"></p>
<p>Anthropic 内部给这种方式起了个名字，叫 <strong>Agentic Search</strong>（智能体搜索）。</p>
<p><img src="assets/jimg/ccb48e68600c812174e884a61c315bf7.png" decoding="async" loading="lazy" fetchpriority="low" width="2904" height="1974"></p>
<p>核心思路是：</p>
<p>不预先构建任何索引，而是让 Agent 在执行任务的过程中，根据当前的上下文和目标，动态决定搜什么、怎么搜、搜到之后下一步干什么。</p>
<p>这三个工具还有一个关键属性：它们都是 <code>isConcurrencySafe = true</code> 的只读工具，可以并行执行。Claude Code 经常同时发起多个 Grep 搜索，一次性扫描多个关键词，效率拉满。</p>` },
      { "t": "02、RAG 检索代码的五个问题", "tag": "技术派·grep和RAG", "p": "core", "html": `<p>要理解 Claude Code 为什么不用 RAG，得先搞清楚 RAG 用在代码搜索上到底有什么问题。</p>
<h3>第一：代码不是自然语言，语义相似度在代码这块不管用。</h3>
<p>RAG 的核心逻辑是把文本转成向量，然后用余弦相似度找“语义最接近”的内容。</p>
<p><img src="assets/jimg/527d52f603a6cd42e4f327e80a8f3156.png" decoding="async" loading="lazy" fetchpriority="low" width="1440" height="720"></p>
<p>这个逻辑在自然语言场景下很好使，比如“如何处理用户认证”和“用户登录流程”语义上确实接近。</p>
<p>但代码不一样。</p>
<p><code>createD1HttpClient</code> 和 <code>buildD1HttpClient</code> 语义上很接近，但在代码仓库里它们可能是两个完全不同的函数。我们要找的是那个精确的函数名，不是“差不多的”函数名。</p>
<p>反过来，<code>handleAuth</code> 和 <code>validateJwtToken</code> 语义上看起来不太相关，但后者可能就是前者内部调用的关键逻辑。向量相似度不会帮我找到这种调用关系，但一个简单的 grep 搜索 <code>validateJwtToken</code> 就能精确定位。</p>
<p>代码世界里，精确匹配比语义匹配重要得多。</p>
<p><img src="assets/jimg/5cfdcbc48b6c336d05e665525471b2b0.jpg" decoding="async" loading="lazy" fetchpriority="low" width="3160" height="2438"></p>
<p>一个变量名、一个方法签名、一个 import 路径，要么完全匹配，要么就是找错了。</p>
<p>没有“大概对”这回事。</p>
<h3>第二：索引同步成本很高</h3>
<p>写代码的小伙伴都知道，代码是不断变化的。</p>
<p>刚改了一个方法名，RAG 的索引里还是旧的名字。新增了一个文件，索引里没有。删了一个类，索引里还在。</p>
<p>要保持索引和代码的实时同步，得做增量更新、文件监听、冲突处理。这套东西做起来的复杂度，比 RAG 本身还高。</p>
<p>而 grep 天然不存在这个问题，它搜索的永远是磁盘上此时此刻的文件内容。代码改了，grep 的结果就跟着变了，不需要任何同步机制。</p>
<h3>第三：安全和隐私</h3>
<p>RAG 需要一个 Embedding 模型来生成向量。</p>
<p>这个模型要么跑在本地（消耗计算资源），要么调用远程 API（代码内容要发到外部服务器）。</p>
<p><img src="assets/jimg/04f191f1fc08dbdc9b26841789c5728b.jpg" decoding="async" loading="lazy" fetchpriority="low" width="3264" height="2498"></p>
<p>代码库是“非常敏感”的，我们肯定不愿意把代码发送到任何第三方服务去生成 Embedding。本地部署 Embedding，又需要很高的算力成本。</p>
<p>grep 直接在本地磁盘上搜索。从安全的角度看，这个优势是碾压级的。</p>
<p><img src="assets/jimg/da0e7a33d7640393c7ce89abbccc9c3a.jpg" decoding="async" loading="lazy" fetchpriority="low" width="3320" height="2846"></p>` },
      { "t": "03、ripgrep 凭什么这么猛", "tag": "技术派·grep和RAG", "p": "core", "html": `<p>说到 grep，大家可能第一反应是 Linux 上的 GNU grep。</p>
<p>Claude Code 用的不是这个，是 ripgrep，一个用 Rust 写的现代搜索工具。</p>
<p><img src="assets/jimg/e746bf9b9133e92fa98a8d09f943f3c5.jpg" decoding="async" loading="lazy" fetchpriority="low" width="4048" height="2800"></p>
<p>ripgrep 的作者叫 Andrew Gallant，他在 Rust 的正则表达式引擎上花了两年半的时间。这个引擎用了 SIMD 指令集加速，简单说就是用 CPU 的矢量计算单元来做文本匹配，搜索速度能逼近内存带宽的极限。</p>
<p>一般来说，在一个几万个文件的中型代码仓库里，ripgrep 跑一次全文搜索大概需要 200 毫秒。</p>
<p>而同样的搜索任务，如果走 RAG 流程：</p>
<p>先把查询文本发给 Embedding 模型生成向量（一次网络往返），再去向量数据库里做 KNN 搜索（又一次网络往返），拿到结果后可能还要做 Rerank（又一次模型调用）。整个链路下来至少 8 个步骤、四五个服务。</p>
<p><img src="assets/jimg/0a494256f19f42765191cb3bb94d252d.jpg" decoding="async" loading="lazy" fetchpriority="low" width="3284" height="2142"></p>
<p>ripgrep 还有几个对 Agent 特别友好的特性。</p>
<p>它默认递归搜索整个目录，自动跳过 <code>.gitignore</code> 里列出的文件和二进制文件，输出结果自带文件名和行号。这些恰好就是 Agent 在分析代码时最需要的信息。</p>
<p>Claude Code 的 Grep 工具在 ripgrep 之上还封装了一层保护机制。默认最多返回 250 行（通过 <code>head_limit</code> 控制），防止一次搜索返回几千行代码把上下文窗口撑爆。如果 ripgrep 超时了但有部分结果，它会把最后一行不完整的结果丢掉，返回已经拿到的部分。如果完全没有结果，才会抛出超时错误。</p>
<p>这种“尽力返回结果”的设计哲学，和 RAG 的“要么成功要么失败”形成了鲜明对比。</p>
<p><img src="assets/jimg/a1e75663c941d83d673726701b0728b6.png" decoding="async" loading="lazy" fetchpriority="low" width="2308" height="1738"></p>` },
      { "t": "04、Anthropic 官方怎么说", "tag": "技术派·grep和RAG", "p": "core", "html": `<p>这一段的信息来源是 Boris Cherny（Claude Code 首席工程师）2025 年 5 月 7 日在 Latent Space 播客上的原话。这期节目的另一位嘉宾是 Catherine Wu，也是 Claude Code 的核心工程师。</p>
<p>Boris 说了这样一句：<strong>Claude Code 早期版本确实用过 RAG。</strong></p>
<p>他们用的是 Voyage 的 Embedding 模型，做了一套本地向量索引。效果“还行”。但后来他们试了另一种方式，就是我们前面说的 Glob + Grep + Read 的 Agentic Search。结果发现这种方式在各项指标上全面碾压 RAG。</p>
<p>Boris 原话说的是 “outperformed everything, by a lot”（全面超越，而且差距很大）。</p>
<p><img src="assets/jimg/2f75aafbcdc2ccb781e884f2e3740542.jpg" decoding="async" loading="lazy" fetchpriority="low" width="3128" height="1734"></p>
<p>他坦承这个判断主要基于“内部 vibes”，也就是直觉和体感，加上一些内部 benchmark 的数据。</p>
<p>Boris 给出了放弃 RAG 的核心原因。</p>
<p>第一是性能。Agentic Search 的搜索质量更高。这里的“质量”不只是准确率，还包括搜索结果的可用性。grep 返回的是精确的代码行和文件路径，Agent 拿到就能直接用；RAG 返回的是一堆“相关”的代码片段，Agent 还得二次理解和筛选。</p>
<p>第二是简洁。RAG 需要维护索引的同步、处理增量更新、管理向量数据库的生命周期。Agentic Search 不需要任何预处理，打开一个代码仓库，直接开始搜，没有“初始化索引”这个步骤。</p>` },
      { "t": "05、亚马逊论文的实锤", "tag": "技术派·grep和RAG", "p": "core", "html": `<p>2025 年 12 月，亚马逊科学团队发表了一篇论文，题目：<strong>“Keyword search is all you need: Achieving RAG-Level Performance without vector databases using agentic tool use”</strong>（关键词搜索就够了：用 Agent 工具调用达到 RAG 级别的性能，不需要向量数据库）。</p>
<p><img src="assets/jimg/efffd311f5e95b8609cc309e0a9e4fc7.png" decoding="async" loading="lazy" fetchpriority="low" width="3260" height="1926"></p>
<p>他们的研究方法是：搭建一个标准的 RAG 系统（向量数据库 + Embedding + 检索 + 生成），和一个只有关键词搜索工具的 Agent 系统，然后在相同的问答任务上对比两者的表现。</p>
<p><img src="assets/jimg/58feadc0755eb1d45abe3df13b76a59e.png" decoding="async" loading="lazy" fetchpriority="low" width="3628" height="2154"></p>
<p>结论是：<strong>基于关键词搜索的 Agent 系统可以达到传统 RAG 系统 90% 以上的性能指标。</strong></p>
<p>论文还有一个关键发现：对于代码这种符号精确的结构化文本，关键词搜索的表现实际上比语义检索还要好。因为代码的命名约定通常是一致的，函数名、变量名、类名本身就携带了足够的语义信息，不需要额外的语义理解。</p>` },
      { "t": "06、Cursor 的反面论证", "tag": "技术派·grep和RAG", "p": "core", "html": `<p>说到这里，可能有小伙伴要问了：如果 grep 这么好，为什么 Cursor 还在用向量搜索？</p>
<p>这是个好问题。</p>
<p>Cursor 训练了自己的 Embedding 模型，建了一套完整的索引管道，用 Turbopuffer 做向量数据库。他们的 A/B 测试结果显示：加入语义搜索后，Agent 的准确率提升了不少。</p>
<p><img src="assets/jimg/190ae616c319cfce8814313fa1abfd42.jpg" decoding="async" loading="lazy" fetchpriority="low" width="2800" height="2034"></p>
<p>在超过 1000 个文件的大型代码仓库中，提升效果更加明显，代码留存率（Agent 写的代码被用户保留的比例）增加了 2.6%。</p>
<p><img src="assets/jimg/3ae9f97d1d35abf94b7ab574cf99206f.png" decoding="async" loading="lazy" fetchpriority="low" width="1920" height="785"></p>
<p>几个关键区别。</p>
<p>第一，Cursor 是 IDE 级别的产品，用户在 IDE 里工作时，代码仓库是相对稳定的，索引同步的压力没那么大。而 Claude Code 是一个命令行工具，用户可能随时切换到不同的代码仓库。</p>
<p>第二，Cursor 用的是混合检索，grep 和向量搜索都用，而不是只用向量搜索。他们的结论是“两者配合使用效果最好”，而不是“向量搜索比 grep 好”。这反过来证明了 grep 是不可或缺的基础能力。</p>` },
      { "t": "07、LLM 就是最好的 Reranker", "tag": "技术派·grep和RAG", "p": "core", "html": `<p>在 Agentic Search 的架构里，LLM 本身就充当了 Reranker 的角色。</p>
<p>传统 RAG 的工作流是：Embedding → 向量检索 → Rerank → 生成。</p>
<p>其中 Rerank 这一步是为了弥补向量检索精度不够的问题，向量搜索返回的“Top K”结果里经常混进不相关的内容，需要一个更精细的模型来重新排序。</p>
<p>但在 Claude Code 的架构里，grep 返回的结果是确定性的，搜 <code>createD1HttpClient</code> 就只会返回包含这个精确字符串的代码行。Agent 拿到这些精确的搜索结果后，用 LLM 自己的推理能力来判断哪些结果是有用的、接下来应该读哪个文件、还需要搜什么关键词。</p>
<p>这种模式下，LLM 做的不是简单的 Rerank，而是<strong>理解 + 决策 + 行动</strong>。</p>
<p>它会根据第一轮搜索的结果调整后续的搜索策略，比如发现一个关键函数调用后，顺藤摸瓜去搜被调用的函数定义。这种多轮迭代的搜索能力，是 RAG 的“一次检索”模式做不到的。</p>
<p><img src="assets/jimg/eb52d511c981b86581ecab96ed664b56.jpg" decoding="async" loading="lazy" fetchpriority="low" width="3180" height="2706"></p>
<p>RAG 像是去图书馆让管理员帮忙找书，管理员根据描述找了几本“可能相关”的放到桌上，至于对不对，得自己翻了才知道。</p>
<p>而 Agentic Search 像是自己去图书馆，先看楼层指引（Glob 看目录结构），再去对应楼层的书架上找（Grep 搜内容），找到了翻开看看（Read 读文件），不对就换个关键词再找。</p>` },
      { "t": "09、简历怎么写", "tag": "技术派·grep和RAG", "p": "core", "html": `<p><strong>项目名称</strong>：PaiCLI 智能代码分析平台</p>
<p><strong>项目简介</strong>：基于 Agentic Search 架构的代码分析工具，采用 grep + LLM 的方式替代传统 RAG 检索，实现对大型代码仓库的高效分析和理解。</p>
<p><strong>核心职责</strong>：</p>
<ul>
 <li>基于 ripgrep 实现了代码级的全文检索引擎，支持正则表达式和 Glob 模式匹配，单次搜索耗时控制在 200ms 以内</li>
 <li>设计了 Agent 多轮迭代搜索策略，通过 Glob→Grep→Read 的工具链实现代码上下文的逐步聚焦，搜索精确率达到 95% 以上</li>
 <li>实现了搜索结果的智能截断机制（head_limit + partial results），将单次搜索的 token 消耗控制在 6K 以内，避免上下文溢出</li>
</ul>` }
    ]
  });

  mine.chapters.push({
    "no": "9",
    "title": "技术派·腾讯一面 · Agent面经（24 题）",
    "questions": [
      { "t": "文章导读与背景", "tag": "技术派·腾讯一面", "p": "core", "html": `<p>不知道大家有没有发现，大模型公司都在卷终端 Agent，包括 Qoder CLI、Kimi Code、ZCode 等等。</p>
<p>更别提Claude Code和Codex CLI了。</p>
<p>我自己也从0到1撸了一个，名叫 PaiCLI，各个版本都有，下面是 Python 版的截图。</p>
<p><img src="assets/jimg/paicli-agent-mianshi-20260717145401.png" decoding="async" fetchpriority="high" width="2276" height="1428"></p>
<p>为的就是能帮大家把 Agent 时代的核心技术栈过一遍：ReAct、Function Calling、RAG、MCP、Multi-Agent、Memory、Context 压缩等等。</p>
<blockquote>
 <p>代码完全开源，放在 GitHub 上：<a href="https://github.com/itwanger/PaiCLI-Python">https://github.com/itwanger/PaiCLI-Python</a></p>
</blockquote>
<p><img src="assets/jimg/paicli-agent-mianshi-20260717141236-a1f353fc.png" decoding="async" loading="lazy" fetchpriority="low" width="1536" height="1024"></p>
<p>同时，我也结合 PaiCLI 的源码，给大家整理了 16 道高频的 Agent面试题，照着背就一定能吊打面试官，😄。</p>
<ol>
 <li>介绍一下 PaiCLI 这个项目和流程？</li>
 <li>有实现子 Agent 吗？</li>
 <li>支持后台任务吗？</li>
 <li>子 Agent 也支持 Plan 模式吗？</li>
 <li>子 Agent 是怎么调用 Skill 的？</li>
 <li>skill分层体系是怎么做的，为什么这么设计？</li>
 <li>用户输入怎么和相关skill匹配？</li>
 <li>有skill沉淀机制么？还是只能用户自己构造？</li>
 <li>长短期记忆怎么设计的？</li>
 <li>为什么要静态长期记忆和动态长期记忆？</li>
 <li>什么时候触发长期记忆存储，有没有出现用户长期记忆快速积累，存的过多？</li>
 <li>大模型怎么决定长期记忆是否需要召回？</li>
 <li>压缩机制是怎么做的？上下文窗口总token多大？触发上限为什么选这个值？</li>
 <li>讲一下动态prompt和静态prompt？</li>
 <li>模型底座是哪个？例如写一千行代码，需要消耗多少token?成本是多少？你用的百万token计费是多少？</li>
 <li>你平时用你的PaiCLI么？</li>
</ol>
<p>（全文比较肝，保证大家能学到很多很多，系好安全带，我们粗粗发～）</p>` },
      { "t": "01、介绍一下 PaiCLI 这个项目和流程", "tag": "技术派·腾讯一面", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·腾讯一面", "p": "core", "html": `<p>老王开门见山：“你简历上写了一个 PaiCLI 项目，对标 Claude Code？先介绍一下。”</p>
<p>我说：“PaiCLI 是一个 Python 写的 Agent 命令行工具，核心架构是 ReAct 循环。”</p>
<p>用户在终端输入一个任务，PaiCLI 把任务发给大模型，大模型决定要不要调用工具、调哪个、参数是什么。</p>
<p>工具执行完后把结果返回给大模型，大模型再决定下一步动作。直到大模型认为任务完成，返回最终答案。</p>
<p><img src="assets/jimg/paicli-agent-mianshi-20260717141548-9eb77145.png" decoding="async" loading="lazy" fetchpriority="low" width="1536" height="1024"></p>
<p>“PaiCLI 有三种工作模式。”</p>
<p>默认是 ReAct 模式，适合日常的单步任务，改个文件、跑个命令这种。</p>
<p>执行 /plan 会进入 Plan-and-Execute 模式，先把复杂任务拆成多个步骤再逐步执行。</p>
<p><img src="assets/jimg/paicli-agent-mianshi-20260717151243.png" decoding="async" loading="lazy" fetchpriority="low" width="2298" height="1124"></p>
<p>/team 会进入 Multi-Agent 模式，多个 Agent 分工协作。</p>
<p>“工具层面，内置了 9 个核心工具：文件读写、命令执行、代码搜索、目录浏览、web 搜索。通过 MCP 协议还可以接入外部工具，比如浏览器操作、数据库查询这些。”</p>` },
      { "t": "02、有实现 Sub-agent 吗？怎么编排的？", "tag": "技术派·腾讯一面", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·腾讯一面", "p": "core", "html": `<p>老王追问：“多 Agent 场景下你是怎么编排的？”</p>
<p>“规划者（Planner）接收用户任务，拆解成一组带依赖关系的执行步骤。”</p>
<p>“比如用户说‘重构这个模块并写测试’，规划者会拆成：步骤 1 分析现有代码结构，步骤 2 执行重构（依赖步骤 1），步骤 3 写单元测试（依赖步骤 2），步骤 4 运行测试验证（依赖步骤 3）。”</p>
<p><img src="assets/jimg/paicli-agent-mianshi-20260717141721-dc6bb70c.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<p>“这些步骤按 DAG（有向无环图）组织。编排器做拓扑排序，找出所有依赖已满足的步骤，丢给执行者（Worker）并行跑。”</p>
<p>执行者工作池默认 2 个，用 asyncio.Queue 管理，谁空闲谁接活，避免任务堆在一个执行者身上。</p>
<p>“每个步骤执行完，检查者（Reviewer）会审查结果，输出一个 JSON 结构，包含是否通过、问题列表、摘要。”</p>
<p>审查不通过的步骤会带着检查者的反馈重新执行，最多重试 2 次。</p>
<p>如果整体进度不到 50% 就连续失败，编排器会触发重新规划，让规划者换一种拆解方式。</p>
<p><img src="assets/jimg/paicli-agent-mianshi-20260717142006-0ee7c154.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<p>老王点点头：“执行者之间的隔离怎么做的？”</p>
<p>“每个执行者有独立的消息历史和 Skill 上下文缓冲区。并行执行时，输出各自写入独立的字节缓冲区，全部完成后再按原始顺序合并到终端，保证展示不会乱序。”</p>` },
      { "t": "03、支持后台任务吗？", "tag": "技术派·腾讯一面", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·腾讯一面", "p": "core", "html": `<p>老王问：“前台跑 Agent 的时候能同时跑后台任务吗？”</p>
<p>“支持。后台任务用 SQLite 做持久化队列。”</p>
<p>“状态机是 queued → running → completed 或 failed 或 canceled。”</p>
<p>Worker 认领任务后，会通过心跳续期。如果 Worker 崩溃了，当前周期过期后其他 Worker 可以重新认领这个任务。</p>
<p><img src="assets/jimg/paicli-agent-mianshi-20260717142136-4bbdf520.png" decoding="async" loading="lazy" fetchpriority="low" width="1536" height="1024"></p>
<p>“启动时还有崩溃恢复：扫描所有 running 状态但租约已过期的任务，重置为 queued 重新排队。这样即使进程异常退出，未完成的任务也不会丢。”</p>` },
      { "t": "04、Sub-agent 也支持 Plan 模式吗？Skill 怎么调用？", "tag": "技术派·腾讯一面", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·腾讯一面", "p": "core", "html": `<p>老王问：“Multi-Agent 里的执行者，能不能走 Plan 模式？”</p>
<p>我说：“可以。每个执行步骤有一个 mode 字段，值可以是 react 或 plan。”</p>
<p>规划者在拆解任务的时候可以判断某个步骤是否足够复杂，需要用 Plan 模式来执行。</p>
<p>“Plan 模式的流程是：先调规划者生成一份 JSON 格式的执行计划，每个步骤有 id、描述、类型和依赖列表。”</p>
<p><img src="assets/jimg/paicli-agent-mianshi-20260717151357.png" decoding="async" loading="lazy" fetchpriority="low" width="2208" height="1104"></p>
<p>有一个简单的任务检测，如果用户输入不超过 30 个字，且不包含‘然后’‘并且’‘再’这些多步骤线索词，就跳过 LLM 规划，直接生成一个单步计划，省掉一次 LLM 调用。</p>
<p><img src="assets/jimg/paicli-agent-mianshi-20260717142411-fe739448.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<p>“计划经过拓扑排序确定执行顺序。没有依赖关系的步骤通过 asyncio.gather 并行执行，有依赖的串行等待。”</p>
<h4>Sub-agent 是怎么调用 Skill 的？</h4>
<p>老王紧跟着追问：“Skill 在 Sub-agent 里怎么工作？”</p>
<p>“系统提示词里注入了一份 Skill 索引，包含所有启用 Skill 的名称和描述，最多 20 个，总大小不超过 4KB。”</p>
<p>LLM 在处理任务时，如果判断当前任务和某个 Skill 的描述匹配，就会主动调用 load_skill 这个内置工具。</p>
<p>“加载后，Skill 的完整内容会写入一个上下文缓冲区。下一轮 LLM 请求时，这段内容自动注入到用户消息的前面。LLM 就相当于拿到了一份专家手册，按手册指引来执行任务。”</p>
<p><img src="assets/jimg/paicli-agent-mianshi-20260717142545-0948a183.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<p>“有个关键设计：每个 Sub-agent 有独立的 Skill 缓冲区，用 LRU 策略最多缓存 3 个 Skill。”</p>
<p>因为 Skill 内容注入后会从缓冲区清空（drain 操作），如果多个 Sub-agent 共享同一个缓冲区，一个 Worker 的 drain 会把另一个 Worker 还没读到的内容清掉。</p>` },
      { "t": "05、Skill 分层体系是怎么做的，为什么这么设计？", "tag": "技术派·腾讯一面", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·腾讯一面", "p": "core", "html": `<p>老王说：“Skill 系统展开说说。”</p>
<p>我说：“三层加载，按优先级从低到高：内置 Skill 打包在程序里、用户级 Skill 放在 ~/.paicli/skills/ 目录、项目级 Skill 放在项目根目录的 .paicli/skills/ 目录。同名 Skill，优先级高的整体覆盖低的。”</p>
<p>“每个 Skill 就是一个目录，核心是 SKILL.md 文件，用 frontmatter 声明名称、描述、版本、标签，正文就是给 LLM 看的决策手册。可选的 references/ 目录放参考资料，scripts/ 放可执行脚本。”</p>
<p><img src="assets/jimg/paicli-agent-mianshi-20260717142707-ff6ac79f.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“为什么这么分？”</p>
<p>内置 Skill 提供开箱即用的基础能力，比如 web 访问的浏览器策略手册。</p>
<p>用户级满足个人工作流定制，比如我自己写了一个小红书热榜抓取的 Skill。</p>
<p>项目级承载团队约定，比如代码审查规范，提交到仓库后团队所有人共享。</p>
<p>这个思路和 Claude Code 的设计一脉相承，Claude Code 也是内置 Skill、用户 Skill、项目 Skill 三层。</p>` },
      { "t": "06、用户输入怎么和 Skill 匹配？有积累机制吗？", "tag": "技术派·腾讯一面", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·腾讯一面", "p": "core", "html": `<p>老王追问：“用户输入一段话，怎么知道该加载哪个 Skill？”</p>
<p>“打分制。每个 Skill 的得分由四个维度加权计算。精确名称匹配直接加 10000 分，确保用户点名要的 Skill 一定排第一。名称中的词项命中权重 ×12，标签词项 ×6，描述词项 ×2。”</p>
<p><img src="assets/jimg/paicli-agent-mianshi-20260717143013-6dc20751.png" decoding="async" loading="lazy" fetchpriority="low" width="1536" height="1024"></p>
<p>“分词策略分中英文两套。”</p>
<p>英文转小写后按空格分词，过滤掉 and、for、the 这些停用词。</p>
<p>“中文不做传统分词，而是取单个汉字加上 2 字和 3 字的滑动窗口，这样能覆盖大部分中文短语。比如‘代码审查’会生成‘代’‘码’‘审’‘查’‘代码’‘码审’‘审查’‘代码审’‘码审查’这些特征。”</p>
<p>老王又问：“Skill 只能开发者预定义吗？还是用户也可以自己写？”</p>
<p>“用户可以在 ~/.paicli/skills/ 下创建自己的 Skill 目录，写一个 SKILL.md 就能生效。”</p>
<p>启用状态持久化在 skills.json 里，记录的是 disabled 列表，默认全部启用，用 /skill off 命令禁用。</p>
<p>“目前没做自动积累，比如根据用户操作习惯自动生成 Skill。主要是自动生成的决策手册质量不可控，一份写得不好的手册反而会误导 LLM 的判断。”</p>
<hr>
<p><strong>简历亮点</strong></p>
<p>如果大家在简历上写 Agent 相关的项目，可以参考下面这种方式来包装（别忘了去 GitHub 上 star 一下 PaiCLI 哈～）：</p>
<p><img src="assets/jimg/paicli-agent-mianshi-20260717143146-5eafe1ba.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<p>项目名称：PaiCLI</p>
<p>项目简介：对标 Claude Code 的 Python Agent 命令行工具，支持多模型切换、多 Agent 协作、Skill 系统和记忆管理</p>
<p>技术栈：Python 3.11、asyncio、httpx、SQLite、prompt-toolkit、Rich、MCP</p>
<p>核心职责：</p>
<ul>
 <li>基于 ReAct 实现了多模型适配的 Agent 引擎，支持 DeepSeek、GLM、Kimi 等 6 种大模型 provider 的流式调用和运行时切换</li>
 <li>设计并实现了 Multi-Agent 编排系统（规划者/执行者/检查者），通过 DAG 拓扑排序和 asyncio 异步队列实现任务依赖的并行调度</li>
 <li>构建了三层 Skill 加载体系（内置/用户/项目），基于多维度加权评分算法实现用户意图到 Skill 的自动路由</li>
 <li>设计了双轨长期记忆系统（静态项目记忆 + 动态 SQLite 记忆），配合 SHA256 去重和 FIFO 淘汰策略控制记忆膨胀</li>
 <li>实现了基于滚动摘要的上下文压缩机制，在 80% 窗口阈值自动触发压缩，保留近 6 轮对话完整性，支持百万 token 级长对话</li>
</ul>
<hr>` },
      { "t": "07、长短期记忆怎么设计的？", "tag": "技术派·腾讯一面", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·腾讯一面", "p": "core", "html": `<p>老王换了个方向：“Agent 的记忆系统怎么做的？”</p>
<p>我说：“三层。”</p>
<p><img src="assets/jimg/paicli-agent-mianshi-20260717143321-74f77e12.png" decoding="async" loading="lazy" fetchpriority="low" width="1536" height="1024"></p>
<p>“短期记忆就是当前对话的消息历史。用户说了什么、LLM 回了什么、工具返回了什么，每轮 LLM 调用都带上。本质是一个不断增长的消息列表。”</p>
<p>“长期记忆用 SQLite 存储。”</p>
<p>每条记忆绑定了 scope（项目路径，实现项目隔离）、content（记忆内容）、importance（重要性，0 到 1）、confidence（置信度，0 到 1）、access_count（被召回的次数）、content_hash（SHA256 哈希，用于去重）。</p>
<p>“长期静态记忆就是 PAI.md 文件。项目根目录或 .paicli 目录下放一个 PAI.md，启动时自动加载到系统提示词里。功能类似 Claude Code 的 CLAUDE.md。”</p>` },
      { "t": "08、为什么要分静态长期记忆和动态长期记忆？", "tag": "技术派·腾讯一面", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·腾讯一面", "p": "core", "html": `<p>老王追问：“为什么不统一成一种？”</p>
<p>“用途不同。”</p>
<p><img src="assets/jimg/paicli-agent-mianshi-20260717143606-bd620fbe.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<p>“静态记忆存的是团队规范和项目约定，比如代码风格、分支策略、部署流程。”</p>
<p>变化频率低，可以提交到代码仓库，团队所有成员共享同一份。PAI.md 还支持 @filename 导入其他文件，最大嵌套 3 层，总预算 16KB，避免撑爆上下文。”</p>
<p>“动态记忆存的是用户特定的事实和偏好，比如‘这个项目用的是 PostgreSQL 而不是 MySQL’。这些信息在交互过程中学习积累，按项目隔离存储在 SQLite 里。”</p>
<p>“分开存的好处是职责清晰：静态记忆由开发者维护，走版本控制；动态记忆由 Agent 自动管理，不会污染代码仓库。”</p>
<p>两者在 Prompt 组装时合并注入系统提示词，静态的先加载、动态的后加载。</p>` },
      { "t": "09、什么时候触发记忆存储？会不会越存越多？", "tag": "技术派·腾讯一面", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·腾讯一面", "p": "core", "html": `<p>老王问：“长期记忆是怎么触发存储的？膨胀怎么控制？”</p>
<p>“触发有两种方式。用户执行 /save 命令主动存储，或者对话中说‘记住这个’‘帮我记一下’，LLM 会调用 save_memory 这个内置工具自动存。”</p>
<p><img src="assets/jimg/paicli-agent-mianshi-20260717143747-df4313be.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<p>“去重用 content_hash。把记忆内容做 Unicode 归一化后算 SHA256，如果哈希已存在，不创建新记录，只把 importance 和 confidence 取两者中的较大值更新上去。”</p>
<p>“防膨胀靠配额淘汰。设定一个 max_entries 上限，超出时按 importance、confidence、access_count、updated_at 综合排序，优先淘汰那些重要性低、置信度低、长时间没被召回过的旧记忆。”</p>
<h4>大模型怎么决定长期记忆是否需要召回？</h4>
<p>老王紧跟着追问：“每次对话都把所有记忆塞进上下文吗？”</p>
<p><img src="assets/jimg/paicli-agent-mianshi-20260717144107-abf10212.png" decoding="async" loading="lazy" fetchpriority="low" width="1600" height="983"></p>
<p>“不是，按相关性评分召回。每次 LLM 请求前，用当前的用户消息作为查询，对所有记忆逐条打分，取分数最高的 6 条注入上下文。”</p>
<p>“评分公式是多维度加权。”</p>
<p>词汇覆盖率占 72%，把查询和记忆内容各自提取词项特征，算交集占比，加上子串完全匹配的额外加成。</p>
<p>重要性占 12%，置信度占 8%，时间衰减占 6%（半衰期 30 天，一条记忆 30 天没更新过，时间分就衰减到一半），访问频率占 2%（用对数函数平滑，避免高频访问的记忆垄断排名）。</p>
<p>“召回阈值设定为 0.05。这个值很低，因为宁可多召回几条不太相关的，也不要漏掉真正有用的。LLM 自己能判断哪些记忆和当前任务有关，不需要评分系统做太严格的过滤。”</p>` },
      { "t": "10、上下文压缩机制是怎么做的？", "tag": "技术派·腾讯一面", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·腾讯一面", "p": "core", "html": `<p>老王问：“对话太长，上下文窗口装不下怎么办？”</p>
<p>我说：“自动压缩。触发条件满足任一个就启动：估算的 token 数超过可用输入 token 的 80%，或者消息数超过 100 条。”</p>
<p>“可用输入 token 的计算方式：上下文窗口总大小减去最大输出 token 数，再减去 1024 的预留空间。比如模型窗口 128K，最大输出 8K，可用输入约 119K，80% 触发阈值约 95K。”</p>
<p><img src="assets/jimg/paicli-agent-mianshi-20260717144235-c01c5a39.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<p>“压缩算法分三步。”</p>
<ul>
 <li>第一步，保留最近 6 轮对话不动，切割点必须落在用户消息的边界上。因为工具调用和工具结果必须成对出现在消息历史里，从中间切断会破坏消息协议。</li>
 <li>第二步，保留范围之外的旧消息做滚动摘要，每条消息提取最多 500 字的摘要。</li>
 <li>第三步，超长的工具返回结果截断到 4000 字。</li>
</ul>
<p>“压缩目标是可用 token 的 55%。为什么 80% 触发、55% 压缩？留出来的空间给当前轮的输入、系统提示词里动态注入的部分（比如刚召回的记忆），以及 LLM 可能返回的多个工具调用。压缩得太晚太少，当前轮的请求可能直接超窗口。”</p>
<p><img src="assets/jimg/paicli-agent-mianshi-20260717144431-482b48f8.png" decoding="async" loading="lazy" fetchpriority="low" width="1536" height="1024"></p>
<p>“token 估算用经验公式：中文字符按 1 token/字，英文按 3 个字符 1 个 token。偏保守，代码多的场景会高估。但高估比低估安全，低估可能导致请求超出模型窗口被截断。”</p>` },
      { "t": "11、讲一下动态 Prompt 和静态 Prompt", "tag": "技术派·腾讯一面", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·腾讯一面", "p": "core", "html": `<p>老王说：“你的系统提示词是怎么组装的？”</p>
<p>“分成静态部分和动态部分。”</p>
<p>“静态部分在一个会话里不会变，构建一次就缓存。包括人格设定（语气风格）、核心行为准则（工具使用规范、安全策略）、项目指令（PAI.md 的内容）。”</p>
<p>“动态部分每次 LLM 请求都重新构建。包括当前时间和时区、工作目录路径、当前使用的模型名称和 provider、已启用的 Skill 索引、刚召回的相关长期记忆。”</p>
<p>“还有一个模式维度。ReAct 模式、Plan 模式、规划者/执行者/检查者各有独立的模式提示词文件，存在 resources/prompts/ 目录下。编排器根据当前角色选择对应的模式提示词，拼到系统提示词的对应位置。”</p>
<p><img src="assets/jimg/paicli-agent-mianshi-20260717144721-215aa276.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<p>“项目指令的加载有优先级链：用户全局的 PAI.md → 项目根目录的 PAI.md → .paicli 目录下的 PAI.md → PAI.local.md（本地覆盖，不提交仓库）。”</p>
<p>总预算 16KB，超出截断。用户还可以自定义覆盖任意一层的提示词文件，覆盖是整文件替换。</p>` },
      { "t": "12、模型底座是哪个？成本怎么样？你平时用 PaiCLI 吗？", "tag": "技术派·腾讯一面", "p": "core", "html": `<p>老王抛出最后的问题：“你用的什么模型？成本算过吗？”</p>
<p>“默认模型是 DeepSeek V4。”</p>
<p>PaiCLI 支持运行时切换模型，/model 命令可以在 DeepSeek、GLM、Kimi、StepFun 等 6 种 provider 之间切换，API Key 从配置文件、环境变量、.env 文件三个来源读取，优先级依次升高。</p>
<p>“1000 行代码大约 15000 到 20000 个 token。一次完整的编码任务，算上多轮 ReAct 循环，通常消耗 5 万到 10 万 token。”</p>
<p>用 DeepSeek V4 的话，成本大约 0.1 到 1 元之间。启用 Prompt Cache 后，重复的系统提示词和历史消息命中缓存，输入成本降到四分之一。</p>
<p><img src="assets/jimg/paicli-agent-mianshi-20260717145017-023ce7cb.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<p>老王最后问：“你平时用你自己的 PaiCLI 吗？”</p>
<p>“用，每天都在用。写代码、查资料、自动化日常操作都用它。”</p>
<p>“有一说一，Claude Code 功能肯定比 PaiCLI 强。但自己写的工具，最大的好处不是功能，而是你完全理解每一个设计决策背后的取舍。”</p>
<p>“而且在写 PaiCLI 的过程中，我把 Agent 技术栈的核心概念全过了一遍。ReAct、Function Calling、RAG、MCP、Multi-Agent、Memory、Context 压缩。看文章看十遍不如自己动手实现一遍。”</p>
<h2>ending</h2>
<p>Agent 面试考的不是能背多少概念，是有没有自己做过一遍完整的技术栈。</p>
<p>想要搞清楚 Agent，最有效的方式就是自己写一个 Agent 项目。</p>
<p>不需要做得比 Claude Code 好，但 ReAct 循环、记忆系统、上下文压缩、Skill 分层这些核心模块，每个都要自己实现一遍。</p>
<p>下期见。</p>` }
    ]
  });

  mine.chapters.push({
    "no": "10",
    "title": "技术派·拼多多 · Agent面经（32 题）",
    "questions": [
      { "t": "文章导读与背景", "tag": "技术派·拼多多", "p": "core", "html": `<p>大家好，我是二哥呀。</p>
<p>有小伙伴在群里扔了一段聊天记录，大意是：当你看到这个图之后再打开拼多多，你的推荐列表里一定会出现遐蝶手办。</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720111831.png" decoding="async" fetchpriority="high" width="1308" height="962"></p>
<p>很多小伙伴都试了一下，还真的是。</p>
<p>我也试了一下，结果如下图所示。</p>
<p><img src="assets/jimg/agent-mianshi-paicli-8d7a885bf35b7594cec7e9d1567cb287.jpg" decoding="async" loading="lazy" fetchpriority="low" width="1200" height="2608" class="article-content-img--text-shot" style="--article-img-max-width: 560px;"></p>
<p>那多模态特征提取到底能不能做到跨 App 的图像识别？协同过滤和深度 CTR 排序在推荐场景里是怎么协作的？Agent 在这类系统里扮演什么角色？</p>
<p>相信很多小伙伴都好奇，正好我也收集了一份拼多多 Agent 岗的面经，附带我自己的答案一并分享给大家。</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720113925.png" decoding="async" loading="lazy" fetchpriority="low" width="934" height="1676" class="article-content-img--text-shot" style="--article-img-max-width: 467px;"></p>
<p>（全文比较肝，保证大家能学到很多，系好安全带，我们粗粗粗发了～）</p>` },
      { "t": "01、拼多多推荐系统背后用到了哪些 AI 技术？", "tag": "技术派·拼多多", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·拼多多", "p": "core", "html": `<p>老王的第一个问题：“用户看了一张图片，打开拼多多就能看到相关商品推荐。背后是什么原理？”</p>
<p>如果真能做到跨 App 的图像识别到推荐，大概是这样这样：</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720114747.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<ul>
 <li>设备侧做图像采集或 OCR，提取出视觉特征；</li>
 <li>云端用多模态模型把图像特征映射到商品类目；</li>
 <li>然后更新用户的兴趣画像，经过协同过滤加深度 CTR 模型做排序，最终推到首页信息流。</li>
</ul>
<p>老王追问：“协同过滤和深度 CTR 模型怎么配合？”</p>
<p>“协同过滤解决的是‘和我相似的人还买了什么’，本质是基于用户行为矩阵做相似度计算。深度 CTR 模型（比如 DIN、DIEN）解决的是‘这个用户在当前场景下点击某个商品的概率有多大’，它会考虑用户的实时兴趣、商品特征、上下文特征做精排。协同过滤做召回，CTR 模型做排序，两者是推荐系统的经典搭配。”</p>
<p>“不过坦白说，我个人判断遐蝶手办那个现象大概率是巧合——这本身就是热门品类，新老用户都可能刷到。”</p>
<p>“或者就是纯粹的 bug。”</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720150907.png" decoding="async" loading="lazy" fetchpriority="low" width="1196" height="806"></p>
<p>老王点点头：“行，推荐聊到这。看简历上有个自己搓的 PaiCLI 项目，聊聊 Agent 的内部机制吧。”</p>
<p><img src="assets/jimg/best-city-ai-agent-jd-20260708142704.png" decoding="async" loading="lazy" fetchpriority="low" width="2052" height="1586"></p>
<blockquote>
 <p>GitHub 地址：<a href="https://github.com/itwanger/PaiCLI-Python">https://github.com/itwanger/PaiCLI-Python</a></p>
</blockquote>` },
      { "t": "02、三层记忆架构为什么这么设计？", "tag": "技术派·拼多多", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·拼多多", "p": "core", "html": `<p>老王问：“Agent 的记忆架构是怎么分层的？为什么要这么分？”</p>
<p>我说：“三层。第一层是短期记忆，存当前对话的上下文，包括用户说了什么、助手回了什么、工具调用了什么结果。”</p>
<p>它的底层是一个 LinkedHashMap，按插入顺序维护，有一个 token 预算上限。</p>
<p>当 token 超出预算，自动淘汰最早的条目，淘汰的条目会被暂存到一个压缩摘要队列里，等待后续被 LLM 摘要。</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720115355-de3c3296.png" decoding="async" loading="lazy" fetchpriority="low" width="1536" height="1024"></p>
<p>“第二层是长期记忆，跨会话持久化。”</p>
<p>用户偏好、项目事实、关键决策这些跨会话仍然有价值的信息存在这里。底层用 ConcurrentHashMap 维护，同步持久化到磁盘的 JSON 文件里。每次写入都会做内容去重，如果已有条目的内容完全一致，直接跳过。</p>
<p>“第三层是记忆检索层，它不存数据，而是负责从前两层中检索与当前查询最相关的记忆。”</p>
<h4>为什么要这么分？</h4>
<p>“因为 LLM 的上下文窗口是有限资源。短期记忆解决‘当前对话不丢’的问题，长期记忆解决‘跨会话能想起来’的问题，检索层解决‘该想起哪些’的问题。三层各管各的，互不干扰。”</p>` },
      { "t": "03、文件作为事实源，为什么不直接用 RAG / 向量数据库存？", "tag": "技术派·拼多多", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·拼多多", "p": "core", "html": `<p>老王追问：“长期记忆用 JSON 文件存？为什么不上向量数据库？”</p>
<p>我说：“因为长期记忆存的是精炼的事实，不是大段文本。一条典型的长期记忆就是‘用户偏好用 zsh 而不是 bash’这种。”</p>
<p>数据量小，几十条到几百条，用关键词匹配就够了。</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720120624-ace930d2.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“更关键的是，长期记忆需要高频读写和即时一致性。用户说‘记一下，以后访问语雀优先复用 Chrome 登录态’，我必须立刻存进去，下一轮对话就能用上。”</p>
<p>JSON 文件的写入是同步的，每次 store 操作完成后数据就在磁盘上了。如果用向量数据库，还得等 embedding 计算、索引更新，延迟和复杂度都上来了。</p>` },
      { "t": "04、文件作为事实源，怎么保证时效性和一致性？", "tag": "技术派·拼多多", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·拼多多", "p": "core", "html": `<p>老王问：“那文件存储怎么保证数据不过期、不冲突？”</p>
<p>我说：“时效性靠两个机制。”</p>
<p>第一，写入时即持久化。ConcurrentHashMap 保证并发安全，每次 store 之后立刻把整个条目列表序列化写入磁盘。</p>
<p>第二，检索时有时间衰减。记忆的 timestamp 会参与相关度计算，越旧的记忆在检索排序中越靠后。一条 24 小时前存入的事实，它的分数会自动降到新事实的一半。</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720120836-f8aa6f35.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“一致性靠去重。长期记忆在 store 时会遍历已有条目，如果新条目的 content 和已有条目完全一致，直接跳过不存。防止 LLM 反复提取同一个事实导致记忆膨胀。”</p>
<p>“另外，长期记忆要区分作用域。”</p>
<p>每条记忆有一个 scope 字段，分 project 和 global 两种。项目级别的事实只在对应项目路径下可见，全局偏好才跨项目共享。检索时会按项目路径做可见性过滤，避免 A 项目的事实污染 B 项目的上下文。</p>` },
      { "t": "05、文件太大时，索引不能每次读全文，怎么办？", "tag": "技术派·拼多多", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·拼多多", "p": "core", "html": `<p>老王点点头，接着问：“记忆文件越来越大，全量加载不现实，怎么办？”</p>
<p>两个层面。</p>
<p>第一，长期记忆本身的体量控制。长期记忆只存精炼事实，不存对话原文和工具输出。工具结果在短期记忆中就被截断到 500 字符以内，不会流入长期记忆。加上内容去重机制，长期记忆条目数通常在几十到几百这个量级，JSON 文件撑死也就几百 KB，全量加载毫无压力。</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720121205-e0da4032.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>第二，注入到 LLM 上下文时的预算控制。每次调用 LLM 前，记忆检索层从长期记忆中捞最相关的几条注入到 system prompt 里，注入量有硬上限，context window 的千分之五，最多不超过 5000 token。</p>
<p>这意味着即使长期记忆有 500 条，注入到 LLM 上下文的也就十来条。</p>` },
      { "t": "06、Agent 是怎么调用工具的？", "tag": "技术派·拼多多", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·拼多多", "p": "core", "html": `<p>老王说：“记忆聊清楚了，说说工具调用。Agent 是怎么调工具的？”</p>
<p>我说：“标准的 Function Calling 机制。”</p>
<p>核心循环是一个 while(true) 的 ReAct 循环。</p>
<p>每一轮迭代，Agent 把当前的对话历史连同工具定义列表一起发给 LLM。</p>
<p>LLM 的响应有两种可能：如果它认为需要调工具，就在响应里返回 toolCalls 字段，包含工具名称和 JSON 参数；如果它觉得信息够了，就直接返回自然语言回复。</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720121402-1cc5f6fa.png" decoding="async" loading="lazy" fetchpriority="low" width="1691" height="930"></p>
<p>“收到 toolCalls 后，Agent 把它们封装成调用请求，交给工具注册表去调度执行。”</p>
<p>工具注册表内部维护了一个 ConcurrentHashMap，key 是工具名称，value 是工具定义和执行器。</p>
<p>执行完毕后，结果以 tool 角色的消息追加到对话历史，然后进入下一轮迭代，LLM 根据工具结果继续推理。</p>
<p>“并行调用也支持。如果 LLM 一次返回多个 toolCalls，工具注册表会用一个固定大小的线程池并行执行，最多同时跑 4 个工具。每个工具有独立的超时控制，单个工具 60 秒，整个批次 90 秒。”</p>
<h4>还有其他调用方式吗？</h4>
<p>老王追问：“除了 Function Calling，还有其他调用方式吗？”</p>
<p>我说：“有。MCP 工具走的是另一条路径。”</p>
<p>MCP 工具不是在 Agent 进程内部执行的，而是通过 JSON-RPC 2.0 协议发送请求到外部的 MCP Server 进程。</p>
<p>Agent 端有一个专门的管理模块统一管理所有 MCP Server 的生命周期，包括启动、初始化握手、工具发现、调用、关闭。</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720121547-f0181ce9.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<p>“但从 LLM 的视角看，MCP 工具和内置工具没有区别。”</p>
<p>这个管理模块在启动时会把每个 MCP Server 暴露的工具注册到同一个工具注册表里，工具名格式是 mcp__serverName__toolName。</p>
<p>LLM 不关心工具是内置的还是 MCP 的，它只看工具定义列表里的名称和参数描述。</p>` },
      { "t": "07、Agent 怎么去判断是否需要调用工具？", "tag": "技术派·拼多多", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·拼多多", "p": "core", "html": `<p>老王问：“那判断调不调工具，是 Agent 的逻辑还是 LLM 的逻辑？”</p>
<p>我说：“是 LLM 自己判断的。Agent 不做任何‘要不要调工具’的硬编码判断。”</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720121921-1d4d0751.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>每一轮 ReAct 循环，Agent 把所有可用的工具定义传给 LLM，LLM 在深度推理之后自己决定：这一轮需要调什么工具、传什么参数，还是直接回复用户。</p>
<p>“Agent 只做两件事：一是把工具的名称、描述和参数 schema 组装成标准的 JSON 格式传给 LLM，让它理解每个工具能做什么；二是忠实执行 LLM 返回的 toolCalls，不加干涉。”</p>
<p>“这就是 Function Calling 的核心理念——工具选择权交给模型。Agent 是执行者，不是决策者。”</p>` },
      { "t": "08、工具调用失败时，怎么保证 Agent 不死循环或乱回答？", "tag": "技术派·拼多多", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·拼多多", "p": "core", "html": `<p>老王紧跟着追问：“万一工具调用失败了呢？Agent 会不会反复重试、陷入死循环？”</p>
<p>我说：“不会，有三道防线。”</p>
<p>第一道是循环预算机制，它在每轮循环开始前做预算检查。</p>
<p>预算机制追踪三个维度：累计 token 消耗、已执行的迭代次数、以及死循环检测。</p>
<p>死循环检测的原理是观察最近几轮是否在重复相同的工具调用模式——如果连续几轮调同一个工具、传同样的参数，直接判定为停滞，强制退出循环并返回错误信息。</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720122239-7349144d.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<p>“第二道是工具层面的异常处理。”</p>
<p>“工具注册表在执行工具时把所有异常分成三类：策略拒绝（路径越权、命令被禁）返回’策略拒绝’前缀的消息；普通异常返回’工具执行失败’前缀的消息；工具超时返回’工具执行超时，已取消’。”</p>
<p>无论哪种情况，异常都被捕获并转成自然语言字符串，作为 tool 角色的消息返回给 LLM。LLM 看到失败消息后会自行决定：换一种方式再试，还是直接告诉用户操作失败。</p>
<p>“第三道是多 Agent 模式下的 Reviewer 审查。如果用的是多 Agent 协作模式，每个步骤执行完后会经过 Reviewer 审查。Reviewer 判定不合格的步骤最多重试 2 次，超过次数保留当前结果并标记步骤状态，不会无限重试。”</p>` },
      { "t": "09、有没有做防止反复存储无意义记忆的预防机制？", "tag": "技术派·拼多多", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·拼多多", "p": "core", "html": `<p>老王问：“前面提到长期记忆会自动提取事实。那 LLM 提取出一堆垃圾怎么办？”</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720122538-dc969991.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>我说：“做了三层过滤。”</p>
<p>“第一层是意图检测。长期记忆的存储只有两个入口：一是用户通过对话明确说‘记一下’‘记住’‘以后记得’，触发 save_memory 工具；二是上下文压缩时自动提取事实。自动提取的 prompt 里明确告诉 LLM ‘绝对不要提取当前这一轮执行的临时任务、一次性的文件名、模型自己的猜测’。”</p>
<p>“第二层是硬编码过滤。即使 LLM 还是返回了不该存的内容，代码里有两组关键词列表做二次拦截。”</p>
<p>“一组是临时事实前缀——以‘用户想’‘帮我’‘新建’‘删除’‘当前这一轮’等开头的句子直接过滤掉。另一组是推测线索——包含‘可能’‘应该’‘猜测’‘推测’等词的句子也过滤掉。只有通过这两关的、且包含持久事实特征（如‘用户偏好’‘项目’‘技术栈’‘配置’等关键词）的句子才会真正存入长期记忆。”</p>
<p>“第三层是存储时的内容去重。长期记忆在写入前会遍历已有条目，content 完全相同的直接跳过。”</p>` },
      { "t": "10、MCP 协议解决了什么问题？", "tag": "技术派·拼多多", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·拼多多", "p": "core", "html": `<p>老王说：“聊聊 MCP。它解决的核心问题是什么？”</p>
<p>我说：“一句话概括：MCP 解决的是 Agent 工具接入的标准化问题。”</p>
<p>在没有 MCP 之前，每接一个外部工具，就得在 Agent 代码里硬编码一套调用逻辑，HTTP 调一套、CLI 调一套、SDK 调又一套，参数格式、错误处理全不统一。MCP 把工具接入抽象成了一个统一的协议层。</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720122728-28141a58.png" decoding="async" loading="lazy" fetchpriority="low" width="1536" height="1024"></p>
<h4>怎么解决的？</h4>
<p>“三步。第一步是传输层抽象。MCP 定义了两种标准传输方式：Stdio（标准输入输出，适合本地进程）和 Streamable HTTP（适合远程服务）。Agent 端不用关心底层是进程通信还是网络请求，只要实现同一套传输接口就行。”</p>
<p>“第二步是通信协议。基于 JSON-RPC 2.0，只有三种消息：Request（带 id，需要响应）、Response（带 id，匹配请求）、Notification（无 id，单向通知）。整个生命周期就是 initialize → tools/list → tools/call → close。”</p>
<p>“第三步是工具发现。MCP Server 启动后，Agent 调 tools/list 就能拿到这个 Server 暴露的所有工具的名称、描述和参数 JSON Schema。”</p>
<p>Agent 把这些工具自动注册到自己的工具注册表里，LLM 就能像调内置工具一样调 MCP 工具。</p>
<p>整个过程是动态的，MCP Server 还能发 notifications/tools/list_changed 通知，Agent 会自动重新拉取工具列表并更新注册。</p>` },
      { "t": "11、Agent 的上下文窗口满了怎么办？", "tag": "技术派·拼多多", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·拼多多", "p": "core", "html": `<p>老王问：“上下文窗口快满了，怎么处理？”</p>
<p>我说：”自动压缩。Agent 里有一个对话历史压缩模块，在每轮 ReAct 循环调 LLM 之前做一次检查。它先估算当前对话历史的总 token 数，如果超过压缩阈值就触发压缩。”</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720122945-f2778a13.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<p>“压缩阈值是根据模型的 context window 动态计算的：context window 减去摘要输出预留（最多 20000 token）再减去自动压缩缓冲（最多 13000 token），就是触发阈值。比如 128K 的模型，阈值大概在 95K 左右。”</p>
<h4>如何去进行压缩，有哪几种方式？</h4>
<p>老王追问：“具体怎么压缩？”</p>
<p>我说：“两套压缩机制并行工作，各管各的。”</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720123140-704d2782.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<p>“第一套压缩的是 Agent 实际发给 LLM 的消息列表。”</p>
<p>算法是这样的：先找出所有 user 消息的位置索引，保留最近 3 轮的完整消息不动，把 system 之后、分割点之前的所有旧消息喂给 LLM 做摘要。</p>
<p>摘要完成后，重建消息列表：system prompt + 一条包含摘要的 user 消息 + 一条确认了解上下文的 assistant 消息 + 最近 3 轮原始消息。</p>
<p>分割点必须落在 user 消息的边界上，这是为了避免切断 tool_call 和 tool_result 的成对协议。”</p>
<p>“第二套压缩的是短期记忆。”</p>
<p>它用的是 Map-Reduce 模式：先把旧的记忆条目按 5 条一组分片，每片单独让 LLM 摘要，然后再把所有分片摘要合并成一个总摘要。</p>
<p>总摘要以 SUMMARY 类型回注到短期记忆中。同时，压缩过程中还会从旧对话里自动提取持久事实存入长期记忆。</p>` },
      { "t": "12、RAG 的具体流程", "tag": "技术派·拼多多", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·拼多多", "p": "core", "html": `<p>老王若有所思：“行，那说说 RAG。整个 RAG 流程是怎样的？”</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720123356-dda39038.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<p>我说：“四步。第一步分块。代码分块器对 Java 文件做 AST 解析，用 JavaParser 解析出所有的类声明和方法声明，类级别生成一个 chunk，每个方法单独生成一个 chunk。非 Java 文件按字符数分段，每段不超过 2000 字符。”</p>
<p>“第二步 Embedding。每个 chunk 的文本送给 Embedding 模型生成向量。支持 Ollama 本地模型和 OpenAI 兼容的远程 API。向量和 chunk 元信息一起存入 SQLite 数据库。”</p>
<p>“第三步建索引。SQLite 里有两张核心表：code_chunks 存代码块和向量，code_relations 存代码间的依赖关系（谁调用了谁、谁继承了谁）。索引按项目路径隔离。”</p>
<p>“第四步检索。用户输入一个自然语言查询，检索器同时走两条路：语义检索和关键词检索，结果合并去重后返回 TopK。”</p>` },
      { "t": "13、Embedding，RAG 如何检索向量？", "tag": "技术派·拼多多", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·拼多多", "p": "core", "html": `<p>老王追问：“具体是怎么做混合检索的？”</p>
<p>我说：“语义检索就是标准的向量相似度搜索。”</p>
<p>把用户查询文本送给 Embedding 模型得到查询向量，然后和数据库里所有 chunk 的向量逐一计算余弦相似度，按相似度降序排列取 TopK。</p>
<p>余弦相似度的计算是在内存里做的，因为代码库的 chunk 量级通常是几百到几千，暴力遍历完全撑得住。</p>
<p>“关键词检索不经过 Embedding，直接在 SQLite 里做 LIKE 查询，匹配 chunk 的名称和内容。”</p>
<p>关键词检索命中的结果，基础分设为 0.3，然后根据命中位置叠加额外分数：类名或方法名命中加 0.3，文件路径命中加 0.1，内容命中加 0.1。</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720123608-09d0a9e7.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<p>“合并的逻辑是：以 filePath#name 为唯一键去重，如果同一个 chunk 在两路检索中都出现了（双重命中），额外加 0.1 的奖励分。”</p>
<p>“然后还有一个代码类型加分：method 类型加 0.15，class 类型加 0.10，因为方法和类比整个文件更直接回答‘怎么实现’的问题。最终按总分降序排列，同一个文件最多保留 2 个结果，防止某个大文件霸占所有位置。”</p>` },
      { "t": "14、Agent 的 Memory 是如何进行管理的？都存在哪些地方？", "tag": "技术派·拼多多", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·拼多多", "p": "core", "html": `<p>老王问：“总结一下，Agent 的记忆都存在哪些地方？”</p>
<p>我说：“四个地方。”</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720124046-eb6c551e.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<ul>
 <li><strong>对话历史</strong>：Agent 发给 LLM 的消息列表，存在 JVM 堆内存里，会话结束即销毁。这是 LLM 真正看到的上下文</li>
 <li><strong>短期记忆</strong>：也在 JVM 堆内存里，但有独立的 token 预算和淘汰策略。它和对话历史并行维护——前者是 LLM 的输入，后者是记忆系统的内部状态</li>
 <li><strong>长期记忆</strong>：存在 <code>~/.paicli/memory/long_term_memory.json</code> 文件里，跨会话持久化。启动时全量加载到 ConcurrentHashMap，运行中每次写入同步刷盘</li>
 <li><strong>向量索引（RAG）</strong>：代码向量索引，存在 <code>~/.paicli/rag/codebase.db</code> 的 SQLite 数据库里。这个不属于对话记忆，是代码库的离线索引</li>
</ul>
<p>“记忆管理模块是这套系统的门面，统一管理短期记忆、长期记忆、上下文压缩器和记忆检索器。Agent 只和它交互，不直接操作底层的存储。”</p>` },
      { "t": "15、多 Agent 系统，Agent 之间如何协作？", "tag": "技术派·拼多多", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·拼多多", "p": "core", "html": `<p>老王说：“说说多 Agent。系统里 Agent 之间怎么协作？”</p>
<p>我说：“主从架构，一个编排器（Orchestrator）加三种角色的 Sub-agent：规划者（Planner）、执行者（Worker）、审查者（Reviewer）。”</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720124304-29ac6360.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<p>“协作流程分四个阶段。第一阶段，用户提交任务后，编排器把任务交给规划者。规划者的职责是把任务拆解成一组带依赖关系的子步骤，输出一个 JSON 格式的执行计划，每个步骤有 id、描述和依赖列表。”</p>
<p>“第二阶段，编排器解析执行计划，按依赖关系拓扑排序。同一批次内没有依赖关系的步骤可以并行执行。并行执行时，Workers 从一个 BlockingQueue 池子里获取，保证同一个 Worker 不会被两个步骤同时占用。每个并行步骤用独立的 PrintStream 缓冲输出，批次结束后按 step_id 顺序刷新到终端，避免多线程写同一个输出流造成内容交错。”</p>
<p>“第三阶段，每个步骤执行完后交给 Reviewer 审查。Reviewer 输出一个带 approved 字段的 JSON，编排器解析审批结果。未通过的步骤会带上 Reviewer 的反馈重新交给 Worker 执行，最多重试 2 次。”</p>
<p>“第四阶段，所有步骤完成后编排器汇总结果返回给用户。”</p>
<h4>多 Agent 之间的上下文怎么管理？</h4>
<p>老王追问：“这些 Sub-agent 之间的上下文是共享的还是隔离的？”</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720124645-2709cc37.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>我说：“对话历史是隔离的，工具注册表是共享的。”</p>
<p>每个 Sub-agent 有自己独立的对话历史和系统提示词（根据角色不同使用不同的提示词模板），互不干扰。但它们共享同一个工具注册表——这意味着所有 Sub-agent 能调用的工具集合是一样的，只不过规划者和审查者不调工具，只有执行者才调。</p>
<p>“每个步骤执行完后，Worker 会清空自己的对话历史，只保留系统提示词。这是为了让 Worker 处理下一个步骤时不受上一个步骤的残余上下文干扰。”</p>
<h4>任务状态如何去进行传递？</h4>
<p>“任务状态通过一个不可变的步骤记录对象传递。”</p>
<p>每个步骤有 id、description、dependencies、result 和 status 五个字段。status 在 PENDING → RUNNING → COMPLETED/FAILED 之间流转。</p>
<p>编排器在分配下一批可执行步骤时，会检查每个 PENDING 步骤的 dependencies 是否全部处于 COMPLETED 状态。</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720124900-6e3c340a.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<p>“步骤之间的上下文传递靠编排器来组装：它把当前步骤所依赖的已完成步骤的结果拼成一段上下文，注入到 Worker 的任务描述里。这样 Worker 不需要看到所有步骤的历史，只看到和自己直接相关的前置结果。”</p>` },
      { "t": "16、多 Agent 系统的工作流程和生成效果如何去做量化评估？", "tag": "技术派·拼多多", "p": "core", "html": `<p>老王最后问了一个开放题：“这套多 Agent 系统的效果怎么评估？”</p>
<p><img src="assets/jimg/agent-mianshi-paicli-20260720125148-4176d466.png" decoding="async" loading="lazy" fetchpriority="low" width="1536" height="1024"></p>
<p>我说：“三个维度。第一是任务完成率。所有步骤都达到 COMPLETED 状态算完成，有 FAILED 步骤算部分完成。这个指标反映的是端到端的可靠性。”</p>
<p>“第二是 Reviewer 通过率和重试率。如果大量步骤需要重试才能通过 Reviewer 审查，说明 Worker 的 prompt 或者工具组合有问题。单步最多重试 2 次是个硬上限，超过就强制保留当前结果。这个指标反映的是单步执行质量。”</p>
<p>“第三是 token 消耗和耗时。每个 Sub-agent 的每轮 LLM 调用都会通过预算机制记录 input token、output token 和 cached input token。编排器可以统计整个任务的总 token 消耗。并行执行的步骤可以通过比较批次耗时和串行估计耗时来评估并行加速比。”</p>
<p>“坦白说，多 Agent 系统的评估在业界还没有统一的标准。我目前主要靠 Reviewer 的审查机制做在线质量把控，离线评估还在探索中。”</p>
<h2>PaiCLI 怎么写到简历上？</h2>
<p><strong>项目名称</strong>：PaiCLI <strong>项目简介</strong>：对标 Claude Code 的 Java Agent 命令行工具，支持 ReAct 循环、三层记忆系统、MCP 协议集成、RAG 代码检索、多 Agent 协作 <strong>技术栈</strong>：Java 17、JSON-RPC 2.0、SQLite、JavaParser、OkHttp</p>
<p><strong>核心职责</strong>：</p>
<ul>
 <li>设计并实现三层记忆架构（短期/长期/检索），通过 Map-Reduce 摘要和时间衰减评分机制，将上下文压缩率提升至 60% 以上，同时保留关键信息的完整性</li>
 <li>实现 MCP 协议客户端，支持 Stdio 和 Streamable HTTP 两种传输方式，动态发现并注册外部工具，实现 Agent 工具生态的即插即用</li>
 <li>构建混合检索 RAG 系统，结合 AST 级代码分块、向量语义检索和关键词精确匹配，双重命中加权合并，代码定位准确率显著优于纯语义检索</li>
 <li>实现多 Agent 协作框架（Planner/Worker/Reviewer 架构），支持依赖拓扑排序和批次并行执行，通过独立输出缓冲和 Worker 池化避免并发冲突</li>
 <li>设计循环预算管控机制，集成死循环检测、token 累计追踪和三层工具异常处理，保障 Agent 在长会话中稳定运行不失控</li>
</ul>
<p>我们下期见。</p>` }
    ]
  });

  mine.chapters.push({
    "no": "11",
    "title": "技术派·腾讯面试官 · Agent面经（16 题）",
    "questions": [
      { "t": "文章导读与背景", "tag": "技术派·腾讯面试官", "p": "core", "html": `<p>大家好，我是二哥呀。</p>
<p>如果你是一位愿意相信努力、相信过程、相信一步一个脚印、相信自己能在 AI 时代分一杯羹的人，那接下来这份硬核的面经，希望你能认真读一读。</p>
<p><img src="assets/jimg/agent-mianshi-tengxun-20260721163620.png" decoding="async" fetchpriority="high" width="912" height="1336" class="article-content-img--text-shot" style="--article-img-max-width: 456px;"></p>
<p>（全文比较肝，保证大家能学到很多很多，系好安全带，我们粗粗发～）</p>` },
      { "t": "01、LLM 和 Agent 之间的联系和区别", "tag": "技术派·腾讯面试官", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·腾讯面试官", "p": "core", "html": `<p>老王第一问是概念题。“讲一下 LLM 和 Agent 之间的联系和区别。”</p>
<p>“先说联系。Agent 的每一次决策都由 LLM 做出。”</p>
<p>“要不要调工具、调哪个、参数怎么填、任务算不算完成，全是模型在拿主意，Agent 框架本身不做判断。”</p>
<p><img src="assets/jimg/agent-mianshi-tengxun-20260721120447-584de154.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“区别在职责边界。LLM 是无状态的文本生成服务，一次调用进一段上下文、出一段文本，调用结束什么都不记得，也改变不了外部世界。”</p>
<p>“Agent 是围绕 LLM 搭起来的执行系统，补上了模型缺的三样东西：”</p>
<ul>
 <li>工具：让模型的输出变成真实动作，读文件、执行命令、查网页</li>
 <li>循环：一次调用解决不了的任务，拆成多轮推理加行动，直到完成</li>
 <li>记忆：跨轮次、跨会话保存状态，让系统记得之前发生过什么</li>
</ul>
<p>“一句话总结，LLM 负责想，Agent 负责想完了真去干。”</p>
<p>老王追问。“那网页版的对话助手算 Agent 吗？”</p>
<p>“看有没有 ReAct 循环。纯问答是单次调用，进去一段话出来一段话，不算；一旦它开始自己联网检索、自己跑代码、拿着中间结果继续往下推进，就已经是轻量级的 Agent 了。”</p>
<p>“判断标准不是产品形态，是有没有『决策、行动、观察结果、再决策』的闭合回路。至于 ReAct 具体怎么转，下一题正好展开。”</p>` },
      { "t": "02、ReAct Agent 由哪几部分组成", "tag": "技术派·腾讯面试官", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·腾讯面试官", "p": "core", "html": `<p>老王点点头。“了解 ReAct Agent 吧？它由哪几部分组成？”</p>
<p><img src="assets/jimg/agent-mianshi-tengxun-20260721120811-af1d4a02.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“ReAct 就是推理加行动（Reasoning + Acting）的循环。拿我自己写的 PaiCLI-Python 来说，拆开是五个部分，每个都能落到具体模块：”</p>
<ul>
 <li>模型客户端：和 LLM 通信，流式接收文本、思考过程和工具调用请求</li>
 <li>工具注册表：所有可用工具的清单，每个工具带一份 JSON Schema 描述</li>
 <li>工具执行器：拿到模型的调用请求后真正干活的模块</li>
 <li>循环控制：决定继续还是退出，我设的最大轮数是 20</li>
 <li>上下文管理：每轮检查消息总量，接近预算就压缩</li>
</ul>
<h4>用户交给它一个问题，是如何完成的</h4>
<p>老王追问了一句。“那用户交给它一个问题，整个流程是怎么走的？”</p>
<p><img src="assets/jimg/agent-mianshi-tengxun-20260721121054-ea20e035.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<p>“先做两件准备工作，把匹配到的 Skill 候选清单注入上下文，再检查一遍消息总量要不要压缩。”</p>
<p>“然后进入循环。把消息历史和工具清单一起发给模型，模型流式返回，要么直接给文本回答，要么发起工具调用。”</p>
<p>“是后者的话，执行器把工具跑完，结果以 tool 消息追加回历史，再次调模型。模型看到工具结果继续决策，要么接着调，要么给出最终回答。”</p>
<p>“退出条件有两个。模型不再请求工具，正常结束；或者到达 20 轮上限，强制收尾。”</p>
<p>“执行上还有两个细节。一个是只读工具最多 4 个并发跑，写操作严格串行，防止互相覆盖；另一个是流式场景下工具调用的参数是分片到达的，要按序号把参数片段拼接完整，再解析成 JSON 交给执行器，拼早了就是半截 JSON，直接解析失败。”</p>` },
      { "t": "03、设计一个 Agent 框架，会分哪些模块", "tag": "技术派·腾讯面试官", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·腾讯面试官", "p": "core", "html": `<p>老王往椅背上一靠。“如果从零设计一个 Agent 框架，会分哪些模块？”</p>
<p>“核心六层：”</p>
<p><img src="assets/jimg/agent-mianshi-tengxun-20260721121343-a5479a61.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<ul>
 <li>入口层：命令行和交互式会话，管参数解析和结果渲染</li>
 <li>Agent 层：三种执行模式，ReAct 循环、计划执行、多 Agent 协作</li>
 <li>模型层：统一的 OpenAI 兼容客户端，管流式解析、token 用量和计费</li>
 <li>工具层：注册表加执行器，再加十七个内置工具</li>
 <li>记忆与上下文层：短期消息历史、长期记忆库、上下文压缩</li>
 <li>安全层：命令黑名单、路径守卫、高危操作人工确认、审计日志</li>
</ul>
<p>“安全层容易被漏掉，单独说一句。Agent 是真的会执行命令的，黑名单里躺着的都是狠角色，sudo、rm -rf 这类命令直接拦截。”</p>
<p>“写文件和执行命令要么标了危险等级、要么强制人工确认，所有执行记录落审计日志。能力越大的系统，越要先想清楚怎么拦住它。”</p>
<h4>模块之间如何交互</h4>
<p>“启动时组装，入口层把内置工具和 MCP 工具合并注册进同一张工具注册表，交给 Agent。”</p>
<p>“运行时流转，Agent 持有消息历史，每轮把历史交给模型层，模型返回的调用请求交给工具层执行，结果回填历史，循环往复。”</p>
<p><img src="assets/jimg/agent-mianshi-tengxun-20260721121630-23bcf0eb.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“关键的设计决定是，所有模块对外只输出一种东西，统一格式的流式事件。文本增量、思考增量、工具调用、用量统计，都是事件，入口层只管渲染，不掺和逻辑。”</p>
<p>“好处是每层都能单独替换。换模型只动模型层，加工具只动注册表，改界面只动入口层。”</p>` },
      { "t": "04、MCP 和 tool 之间有什么联系和区别", "tag": "技术派·腾讯面试官", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·腾讯面试官", "p": "core", "html": `<p>老王在本子上记了一笔。“MCP 和 tool 之间的联系和区别，说说看。”</p>
<p>“区别看归属。tool 是应用内的函数，我自己写、自己注册、跟着代码走，别的应用用不了。”</p>
<p>“MCP 把工具从应用里拆出来，变成独立的服务进程，任何支持 MCP 的客户端都能连上来用。解决的是 M 个应用对接 N 个工具的组合爆炸问题。”</p>
<p><img src="assets/jimg/agent-mianshi-tengxun-20260721121916-1ec2f461.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“联系是殊途同归。MCP 工具连上来之后，会被包装成和内置工具一样的形态，注册进同一张工具注册表，最终以函数调用（Function Calling）的格式一起喂给模型。”</p>
<p>“模型不知道也不需要知道，一个工具到底是本地函数还是远端服务。”</p>
<p>“实现上我做了三件事：”</p>
<ul>
 <li>传输支持 stdio 和 Streamable HTTP 两种</li>
 <li>远端工具名加服务名前缀做命名空间隔离，防止和内置工具撞名</li>
 <li>权限上参考远端声明的只读提示，非只读的 MCP 工具一律人工确认后才执行</li>
</ul>
<p>“配置也是分层合并的。用户目录一份全局配置，项目目录一份局部配置，同名服务后者覆盖前者，路径里支持环境变量展开。”</p>
<p>“某个 server 连不上时单独隔离并记下错误，不影响其他工具正常注册。”</p>
<p>“还有个容易被忽略的点。MCP 除了工具还有资源和提示词模板，我把它们也映射成了虚拟工具，列资源、读资源和调用普通工具走的是同一条路径，模型侧不用学新动作。”</p>` },
      { "t": "05、短期记忆和长期记忆是怎么做的", "tag": "技术派·腾讯面试官", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·腾讯面试官", "p": "core", "html": `<p>老王翻了页简历。“项目里的智能问答，短期记忆和长期记忆是怎么做的？”</p>
<p>“短期记忆就是会话内的消息历史，一个列表，上限 100 条，配合上下文压缩工作。”</p>
<p>“压缩的触发线是可用输入预算的 80%，一旦超过就压到 55%，最近 6 条消息原样保留，更早的轮次做提取式摘要。分割边界落在用户消息上，保证工具调用和结果成对出现。”</p>
<p>“长期记忆用 SQLite 存在用户目录下，跨会话生效，按项目路径隔离作用域。有几个设计细节可以展开：”</p>
<p><img src="assets/jimg/agent-mianshi-tengxun-20260721122045-21020b41.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<ul>
 <li>去重：内容归一化后取哈希，同作用域下相同哈希只存一条</li>
 <li>淘汰：上限 1000 条，超了按重要性、置信度、访问次数从低到高淘汰</li>
 <li>过期：支持 TTL，临时事实到期自动失效</li>
 <li>召回：词法匹配为主，叠加重要性、新鲜度、访问频次加权，默认召回 6 条，低于分数阈值的不进上下文</li>
</ul>
<p>“还有一条边界要守住。压缩生成的摘要只服务当前会话，它是模型生成的二手信息，不会被晋升成长期记忆。”</p>
<p>“长期记忆只收用户明确要求保存的事实。这条线一旦松了，记忆库很快会被模型自己的转述污染。”</p>
<h4>业界主流的三层记忆系统</h4>
<p>老王接着追问。“业界主流的三层记忆系统是怎么分的？每层存什么？”</p>
<p>“主流分法是按作用域切三层：”</p>
<p><img src="assets/jimg/agent-mianshi-tengxun-20260721122222-ddded696.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<table>
 <thead>
  <tr>
   <th>层次</th>
   <th>存什么</th>
   <th>在 PaiCLI-Python 里</th>
  </tr>
 </thead>
 <tbody>
  <tr>
   <td>会话层</td>
   <td>当前对话的消息</td>
   <td>内存里的消息列表，上限 100 条</td>
  </tr>
  <tr>
   <td>项目层</td>
   <td>仓库的规范、构建命令</td>
   <td>项目根的 PAI.md，跟着 Git 走</td>
  </tr>
  <tr>
   <td>全局层</td>
   <td>跨项目的个人偏好</td>
   <td>用户目录的记忆库和全局配置</td>
  </tr>
 </tbody>
</table>
<p>“文件记忆还有一个本地覆盖层 PAI.local.md，存只属于本机的配置，不进版本库。加载也有预算，单文件截断 6000 字符，合并总量 16000 字符，防止记忆把窗口吃穷。”</p>
<p>这张表建议存下来，答记忆类的题基本都能套。</p>` },
      { "t": "06、Skill 的渐进式加载机制了解吗", "tag": "技术派·腾讯面试官", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·腾讯面试官", "p": "core", "html": `<p>老王抛出下一问。“了解 Skill 的渐进式披露（progressive disclosure）机制吗？”</p>
<p>“了解，核心就八个字，索引常驻，正文按需。具体分两段。”</p>
<p><img src="assets/jimg/agent-mianshi-tengxun-20260721122347-639d6bee.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“第一段，每次用户输入时，只把匹配度最高的 5 个 Skill 的名字和描述注入上下文，单条描述截断到 300 字符，整个索引不超过 4000 字符。这时模型知道有哪些技能可用，但一个字的正文都没进来。”</p>
<p>“第二段，模型判断当前任务匹配某个 Skill，主动调用加载工具，这时才读 SKILL.md 的正文，上限 5000 字符。而且正文不是立刻塞进当前轮，是放进一个缓冲区，下一轮随工具结果一起注入，缓冲区只保留最近 3 条，防止越积越多。”</p>
<p>“Skill 目录本身也分三层，内置的、用户级的、项目级的，同名时项目级覆盖用户级，和记忆文件的分层逻辑一致。”</p>
<p>“这套机制的收益可以量化。20 个 Skill 按单篇 5000 字符的上限全量加载，就是 10 万字符；渐进式披露的常驻成本只有 4000 字符的索引，差 25 倍。”</p>
<p>老王追问。“候选是怎么匹配出来的？”</p>
<p>“加权打分。用户显式点名某个 Skill 直接给最高分；否则按命中位置算，名字命中的权重最高，标签次之，描述最低，中文还做了二元、三元分词来提升召回。”</p>
<p>“说白了就是一个微型搜索引擎，检索对象从网页换成了技能。”</p>` },
      { "t": "07、使用 AI 时，如何保证输出内容的质量", "tag": "技术派·腾讯面试官", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·腾讯面试官", "p": "core", "html": `<p>老王问出最后一道正题。“在使用 AI 时，应该怎么保证输出内容的质量？”</p>
<p>“分三层答，先说我实现了的。”</p>
<ul>
 <li>写后自检：写入或修改 Python 文件后立即做语法编译检查，报错附在工具结果里回给模型，让它当轮就改</li>
 <li>审查重试：多 Agent 模式里有专职的审查者角色，产出不合格打回重做，每步最多重试 2 次</li>
 <li>安全兜底：危险命令黑名单、路径守卫、高危操作人工确认、全程审计日志，外加任务前后各打一次快照，随时可回滚</li>
</ul>
<p>老王追问。“这些都是工程手段，提示词层面呢？”</p>
<p>“三条实践。把验收标准直接写进提示词，让模型知道什么叫合格；复杂任务要求模型先复述一遍理解再动手，提前暴露偏差；重要产出让模型对照标准自查一轮再交付。”</p>
<p>“也坦白说，通用的钩子机制和结构化输出校验我还没做，主循环也没有自动重试。这道题面试时最忌讳把没做的说成做了——质量保证的第一条，是先保证自己说的话是真的。”</p>
<p>老王笑了笑，合上了本子。</p>
<p><img src="assets/jimg/agent-mianshi-tengxun-20260721122527-c33b3c20.png" decoding="async" loading="lazy" fetchpriority="low" width="1536" height="1024"></p>
<h4>PaiCLI 如何写到简历上？</h4>
<p>项目名称：PaiCLI-Python</p>
<p>项目简介：对标 Claude Code 的 Python Agent 命令行工具，支持 ReAct、计划执行、多 Agent 三种模式</p>
<p>技术栈：Python、asyncio、httpx、MCP、SQLite</p>
<p>核心职责：</p>
<ul>
 <li>基于函数调用实现 ReAct 主循环，流式拼接工具调用参数分片，只读工具 4 路并发执行，20 轮硬上限防失控</li>
 <li>设计三层记忆体系：会话内消息历史、用户级与项目级分层文件记忆、SQLite 长期记忆，支持哈希去重、TTL 过期与 1000 条容量淘汰</li>
 <li>实现窗口自适应的上下文压缩，预算 80% 触发压至 55%，分割边界落在用户消息上，保证工具调用与结果成对完整</li>
 <li>接入 MCP 官方 SDK，支持 stdio 与 Streamable HTTP 双传输，服务级配置分层合并与故障隔离，远端工具统一命名空间注册</li>
 <li>实现 Skill 渐进式披露机制，索引常驻 4000 字符、正文按需加载，常驻上下文成本降低 25 倍</li>
</ul>
<h2>反问</h2>` },
      { "t": "08、结合面试表现，后端和 Agent 方面怎么学", "tag": "技术派·腾讯面试官", "p": "core", "html": `<p>面试收尾，轮到我反问。“结合我刚才的表现，后端和 Agent 方面能给点学习建议吗？”</p>
<p>老王想了想，给出的建议信息量很大，太用心了兄弟，我都想给他鞠个躬。原话拆开，是一份完整的自查清单：</p>
<p><img src="assets/jimg/agent-mianshi-tengxun-20260721122716-d0c8beb2.png" decoding="async" loading="lazy" fetchpriority="low" width="1536" height="1024"></p>
<ul>
 <li>模型怎么运转：ReAct 主流框架下，模型和框架各自负责什么，边界在哪</li>
 <li>模型的缓存机制：前缀缓存命中和未命中的成本差，怎么组织上下文去吃这个红利</li>
 <li>怎么让输出更稳定：温度参数、结构化提示、约束性描述</li>
 <li>Skill 的运转逻辑：索引注入和按需加载的两段式，预算怎么定</li>
 <li>MCP 和 tool use 的机制：协议、传输方式、命名空间、权限控制</li>
 <li>上下文管理：压缩触发线、保留策略、消息边界完整性</li>
 <li>参考实现：Claude Code 的开源生态里，上面这些机制都能找到对照</li>
 <li>RAG 的知识管理和召回：切块策略、混合检索、重排序，怎么让召回更准更精</li>
</ul>
<p>这份清单每一项，都能对着一个真实项目的源码过一遍。</p>
<h2>ending</h2>
<p>以前后端面试拼的是并发和中间件，现在拼的是懂模型、懂工具调用、懂记忆、懂上下文。</p>
<p>我们有机会站在 AI 发展的风口浪尖，把 Agent 从名词表变成自己简历上扛得住追问的项目。虽然挑战不少，但也充满了无限可能。</p>
<p>加油吧，兄弟姐妹们。</p>
<p>下期见。</p>` }
    ]
  });

  mine.chapters.push({
    "no": "12",
    "title": "技术派·携程 · Agent面经（22 题）",
    "questions": [
      { "t": "文章导读与背景", "tag": "技术派·携程", "p": "core", "html": `<p>看到这样一则爆料。</p>
<blockquote>
 <p>在携程4年，月薪30000左右，研发岗，基本是没有涨薪了。不过这么多年还是挺满足的，毕竟稳定，福利待遇也不错。</p>
</blockquote>
<p></p>
<figure><img src="assets/jimg/agent-mianshi-xiecheng-20260727125714.png" alt="截图来自职级对标网" decoding="async" fetchpriority="high" width="2270" height="1060">
 <figcaption>
  截图来自职级对标网
 </figcaption>
</figure>
<p></p>
<p>在如今这个快节奏的 AI 时代，能说出“满足”两个字的人，我是真的佩服。</p>
<p>看看你的周围，是不是每个人都在卷？早上出了个新模型要测测，中午出了个新 Work 要试试。整个行业的节奏快得像在赶末班车，每个人都马不停蹄地、拼了命地往前冲。</p>
<p>但这位老哥说，满足，稳定，福利不错。</p>
<p>深得我心啊。</p>
<p>这两年 AI 把节奏拉得太快了，快到大家忘了一件事——<strong>人还应该有生活</strong>。准时下班、周末不加班、半夜不用回消息，这些更应该是我们追求的，不是吗？</p>
<p>要我说，稳定才是最好的学习姿势。反正，我只有在外界环境都顺风顺水的状态下才有心情工作，才想去学习新东西。</p>
<p>如果你也渴望稳定，同时又想在稳定的心态和节奏下学一些新的 AI 知识，那接下来这些 Agent 面试题，可以好好读一读。</p>
<p><img src="assets/jimg/agent-mianshi-xiecheng-20260727130023.png" decoding="async" loading="lazy" fetchpriority="low" width="1168" height="1680" class="article-content-img--text-shot" style="--article-img-max-width: 560px;"></p>
<p>（全文比较肝，保证大家能学到很多很多，系好安全带，我们粗粗粗粗发～）</p>

<blockquote>
 <p>PS：PaiCLI 是一个类 Claude Code 的终端 Agent，已开源。如果你想拥有一个 Agent 的项目经验，可以参考。</p>
</blockquote>
<p><img src="assets/jimg/agent-mianshi-xiecheng-20260727110104.png" decoding="async" loading="lazy" fetchpriority="low" width="2272" height="838"></p>
<blockquote>
 <p>GitHub: <a href="https://github.com/itwanger/PaiCLI-Python">https://github.com/itwanger/PaiCLI-Python</a></p>
</blockquote>` },
      { "t": "01、Claude Code 与 Codex 各自有什么特别？", "tag": "技术派·携程", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·携程", "p": "core", "html": `<p>老王翻开面试题，直接问：“Claude Code 和 Codex 你都用过吗？各自有什么特别的地方？”</p>
<p>“都用过。这两个产品方向完全不一样。”</p>
<p>“Claude Code 是 Anthropic 做的终端 Agent，最大的特点是实时交互，和 AI 时代完美契合，不需要 IDE 就可以完成 Coding 工作。在终端里给它任务，然后读代码、改文件、跑命令，整个过程全程可见，并且随时可以打断、纠正。就目前来说，Claude Code 就是最强的终端 Agent，没有之一。”</p>
<p><img src="assets/jimg/agent-mianshi-xiecheng-20260727110628-0058d2f0.png" decoding="async" loading="lazy" fetchpriority="low" width="1536" height="1024"></p>
<p>“Codex 是 OpenAI 做的桌面端 Agent，走的是异步多线程，可视化比 Claude Code 更强。”</p>
<p>“我个人是两者的重度用户，Claude Code 配合 Opus 模型在文本领域更强，整体架构能力上更强。Codex 我更喜欢配合 GPT-5.6 Sol 做代码开发和生图，特别消耗 Token的任务也会交给它。”</p>
<p><img src="assets/jimg/agent-mianshi-xiecheng-20260727130738.png" decoding="async" loading="lazy" fetchpriority="low" width="2578" height="1748"></p>` },
      { "t": "02、输入到模型的 prompt 由哪些部分组成？", "tag": "技术派·携程", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·携程", "p": "core", "html": `<p>“你做的 Agent，输入到模型的 prompt 是怎么组装的？哪些部分是必须注入的，哪些不是？”</p>
<p>“prompt 组装用的是分层拼接，一共 9 层，按固定顺序拼进去。”</p>
<p><img src="assets/jimg/agent-mianshi-xiecheng-20260727110803-5ab8d56e.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<p>“前 4 层是静态的，整个会话期间不变。”</p>
<ul>
 <li>第一层是身份定义，包括工具的 schema、安全策略、行为守则，这一层是必须注入的，没有它模型连自己是谁都不知道，更不知道能用什么工具。</li>
 <li>第二层是人格层，控制语气和风格。</li>
 <li>第三层是模式层，根据当前执行路径加载不同的指令集，ReAct、Plan、Team 三种模式各一套。</li>
 <li>第四层是审批层，定义哪些工具调用需要用户确认。</li>
</ul>
<p>“后 5 层是动态的，每轮都可能变。运行时上下文（日期、时区）、项目记忆、Skills 索引、上下文管理策略、收尾指令。”</p>
<p>“必须注入的是身份层和模式层——模型必须知道自己是谁、当前在什么执行模式下工作。人格层、Skills 索引、项目记忆这些不是必须的，没有它们模型照样能干活，但体验会差不少。比如没有 Skills 索引，模型就不知道有哪些现成的技能可以加载，遇到问题只能靠自己硬想。”</p>
<h4>为什么静态内容要排在最前面？</h4>
<p>“因为 Prompt Caching。”</p>
<p><img src="assets/jimg/agent-mianshi-xiecheng-20260727110940-7039b291.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“Prompt Caching 会按最长公共前缀命中。前 4 层是静态内容，放在提示词最前面，每轮请求的前缀都一样，缓存命中率能拉到最高。如果把动态内容插到前面，前缀每轮都变，缓存基本不会中，token 成本会高出好几倍。”</p>` },
      { "t": "03、你做的 coding agent 和 Claude Code 与 Codex 区别在哪？", "tag": "技术派·携程", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·携程", "p": "core", "html": `<p>“Claude Code 是终端 Agent 的标杆。”</p>
<p><img src="assets/jimg/agent-mianshi-xiecheng-20260727111329-75af211d.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>但我在使用这些工具的过程中产生了一个疑问——这些工具底层到底是怎么工作的？</p>
<p>它是怎么理解我的指令的、怎么决定该读哪个文件的、怎么判断该调用什么工具的、多轮对话的上下文它是怎么管理的。</p>
<p>我发现如果我只会用这些工具但不理解它们的底层设计，遇到工具表现不好的时候（比如Agent选错了工具、上下文丢失了关键信息、生成的代码跟项目风格不一致）我只能试着换个说法重新问，而不能从原理层面判断问题出在哪里。</p>
<p>所以我决定自己从零实现一个Agent CLI，把ReAct推理循环、Tool Calling、Memory管理、MCP协议这些核心模块都自己写一遍。</p>
<p>做完之后我对Agent系统的每一层都有了源码级的理解，再回去用Claude Code的时候我能明显感觉到我对工具的驾驭能力提升了——我知道什么样的指令能让Agent更准确地理解我的意图、我知道在什么场景下应该手动压缩上下文、我知道怎么设计Tool的描述信息能提高调用准确率。</p>` },
      { "t": "04、上下文压缩是怎么做的？", "tag": "技术派·携程", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·携程", "p": "core", "html": `<p>老王往前倾了倾身子，继续问：“你提到了上下文压缩，具体是怎么做的？”</p>
<p>“三层压缩，每一层处理不同粒度的内容。”</p>
<p>“第一层是工具结果截断。单次工具返回的内容如果超过阈值——比如 grep 一下出来几千行——直接截断，保留首尾和关键信息，中间用摘要替代。这一层是即时生效的，工具一返回就处理。”</p>
<p>“第二层是对话历史摘要。当整个对话的 token 数接近上下文窗口的上限时，保留最近几轮完整对话，把更早的历史用 LLM 做一次摘要压缩。摘要会保留四类关键信息：用户的核心诉求、Agent 已完成的操作、达成的共识、还没解决的待办。”</p>
<p><img src="assets/jimg/agent-mianshi-xiecheng-20260727111512-07ad2c61.png" decoding="async" loading="lazy" fetchpriority="low" width="1536" height="1024"></p>
<p>“第三层是紧急降级。如果摘要压缩之后 token 数还是超限，按优先级丢弃非核心上下文——Skills 索引、非关键记忆、项目记忆里优先级低的部分，给核心对话腾空间。”</p>` },
      { "t": "05、为什么要采用三层压缩策略？每一层压缩的内容一致吗？", "tag": "技术派·携程", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·携程", "p": "core", "html": `<p>“设计思路是粒度从细到粗，触发条件从宽到严。”</p>
<p>“第一层处理的是单条消息级别的冗余，触发条件最宽松——每次工具返回都会检查，超了就截。成本几乎为零，不需要调 LLM。”</p>
<p>“第二层处理的是对话历史级别的膨胀，触发条件是 token 数超过上下文窗口的差不多 80%。200k 的窗口大概在 167k 左右触发。这一层要调一次 LLM 做摘要，有成本，所以不会太频繁。”</p>
<p><img src="assets/jimg/agent-mianshi-xiecheng-20260727111759-b1580e56.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“第三层是最后防线，只在前两层都不够用的时候才启动。丢弃的是可恢复的辅助信息——Skills 索引可以重新加载、项目记忆可以重新检索——核心对话内容不到万不得已不动。”</p>
<p>“三层压缩的内容完全不一样。第一层压的是工具输出，第二层压的是对话历史，第三层丢的是辅助上下文。如果只用一层笼统地压缩，要么压得太早浪费上下文空间，要么压得太晚直接超限报错。”</p>` },
      { "t": "06、压缩过度效果不理想，怎么发现，怎么处理？", "tag": "技术派·携程", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·携程", "p": "core", "html": `<p>“靠两个信号。”</p>
<p>“第一个是行为异常。模型开始重复做已经做过的事情——比如读一个文件，明明十分钟前已经读过了，又读了一遍。或者模型直接说'我不太清楚之前讨论了什么'，这就是压缩把关键信息压丢了。”</p>
<p>“第二个是任务成功率下降。同样类型的任务，之前能完成，压缩几轮之后开始失败，大概率是上下文丢了关键内容。”</p>
<p><img src="assets/jimg/agent-mianshi-xiecheng-20260727111927-dabe1b1b.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“处理有三个手段。”</p>
<p>第一，动态调整保留轮数。默认保留最近 3 轮不压缩，如果检测到异常，临时扩大到 5 轮。</p>
<p>第二，关键信息标注。用户明确给出的需求、已确认的技术方案，标记为不可压缩，摘要的时候跳过。</p>
<p>第三，压缩前备份原始历史，发现效果不好可以回滚到压缩前的状态，用更保守的策略重新压。</p>` },
      { "t": "07、增量修改系统怎么做？需要重新注入哪些信息？", "tag": "技术派·携程", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·携程", "p": "core", "html": `<p>“走的是 Plan 审查机制。”</p>
<p>“Agent 生成执行计划之后，用户可以审查。如果需要加新功能，用户选择'补充需求'，把新的需求描述传进去。系统拿着原计划和新需求一起交给规划器，让它重新生成一份计划。”</p>
<p><img src="assets/jimg/agent-mianshi-xiecheng-20260727112049-6b8cf048.png" decoding="async" loading="lazy" fetchpriority="low" width="1694" height="929"></p>
<p>“重新注入的信息有三块：原始任务描述、已完成步骤的摘要、新需求的补充说明。已完成的步骤不会重新执行，规划器基于当前进度来安排后续的步骤。”</p>
<h4>为什么不直接在原计划上追加，而要重新规划？</h4>
<p>“因为新需求可能改变已有任务的依赖关系。”</p>
<p><img src="assets/jimg/agent-mianshi-xiecheng-20260727112354-d9e51ccc.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“举个例子，原计划是'先创建数据库表，再写 CRUD 接口'。用户补充说'加一个缓存层'。这不是简单地在后面追加一个缓存任务——CRUD 接口的实现逻辑要改，读操作要先查缓存再查库，写操作要同步更新缓存。直接追加的话，前面已经写好的接口代码就不对了。”</p>
<p>“重新规划让规划器看到全貌，重新安排依赖和执行顺序，避免后续步骤建立在错误的前提上。”</p>` },
      { "t": "08、工具调用的流程是怎样的？", "tag": "技术派·携程", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·携程", "p": "core", "html": `<p>老王翻了一页笔记，继续问：“工具调用这块讲讲，完整流程是什么？”</p>
<p>“三个阶段。”</p>
<p>“第一阶段，LLM 生成 tool_call。模型看到工具的 schema 定义之后，根据当前任务决定调哪个工具、传什么参数，输出一个结构化的 tool_call 请求。”</p>
<p>“第二阶段，策略审批。写操作（改文件、跑命令）会过一道安全检查——路径是否在允许范围内、命令是否在黑名单里。需要用户确认的操作会暂停等审批通过。”</p>
<p>“第三阶段，执行。单个工具直接执行，多个工具可以并行跑，线程池上限 4 个并发。执行结果作为 tool 消息追加到对话历史里，LLM 拿到结果之后再决定下一步。整个过程是一个循环：生成 → 审批 → 执行 → 结果回到模型 → 继续生成，直到模型认为任务完成。”</p>
<p><img src="assets/jimg/agent-mianshi-xiecheng-20260727112641-08735adb.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<h4>能不能用 Skill 替代工具？</h4>
<p>不能，两个东西完全不一样。</p>
<table>
 <thead>
  <tr>
   <th>维度</th>
   <th>Tool（工具）</th>
   <th>Skill（技能）</th>
  </tr>
 </thead>
 <tbody>
  <tr>
   <td>本质</td>
   <td>可执行能力——读文件、跑命令、搜代码</td>
   <td>决策知识——怎么用工具、什么策略、什么规范</td>
  </tr>
  <tr>
   <td>调用方式</td>
   <td>LLM 通过 tool_call 协议调用</td>
   <td>LLM 调用 load_skill，内容注入下一轮消息</td>
  </tr>
  <tr>
   <td>返回内容</td>
   <td>结构化结果（文件内容、命令输出）</td>
   <td>Markdown 指令（提示词级别的知识）</td>
  </tr>
  <tr>
   <td>生命周期</td>
   <td>单次调用，用完即走</td>
   <td>加载后驻留在上下文里，持续影响后续决策</td>
  </tr>
 </tbody>
</table>
<p>“Tool 是手，Skill 是脑子里的经验。你不能用经验代替手去拧螺丝，也不能用手代替经验去判断该拧哪颗。两个是互补关系，不是替代关系。”</p>` },
      { "t": "09、讲讲你的 Skills 有哪些？", "tag": "技术派·携程", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·携程", "p": "core", "html": `<p>“核心设计思路是渐进式披露，分三层加载。”</p>
<p>“第一层是索引。只把 Skill 的名称和一句话描述放进 system prompt，控制在 4KB 以内，最多 20 个 Skill。这一层常驻上下文，成本很低。”</p>
<p>“第二层是正文。LLM 看到索引后，判断当前任务需要哪个 Skill，调一个 load_skill 工具把完整指令拿进来，单个 Skill 正文上限 5KB。加载进来的 Skill 放在一个 LRU 缓冲区里，最多同时持有 3 个，超出的按最久未使用淘汰。”</p>
<p><img src="assets/jimg/agent-mianshi-xiecheng-20260727112949-36d73526.png" decoding="async" loading="lazy" fetchpriority="low" width="1536" height="1024"></p>
<p>“第三层是参考文档。部分 Skill 自带参考文档目录，只在 Skill 指令明确要求的时候才加载。”</p>
<h4>为什么不一次性全量加载？</h4>
<p>因为 system prompt 越长，Prompt Caching 命中率越低。绝大多数对话只会用到一两个 Skill，全量加载等于让用户为用不到的内容付 token 成本。</p>
<p>“Skill 来源有三个优先级：内置的、用户级的、项目级的，从低到高覆盖。项目级的 Skill 可以覆盖内置同名 Skill 的行为，不用改源码。”</p>` },
      { "t": "10、工具调用时模型用了几次？Skill 用了几次？", "tag": "技术派·携程", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·携程", "p": "core", "html": `<p>“这个跟任务复杂度有关，说个典型场景。”</p>
<p><img src="assets/jimg/agent-mianshi-xiecheng-20260727113148-2b04c0c6.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“比如'帮我在项目里加一个分页接口'这种任务，模型差不多要调 10 到 15 次工具——读项目结构、读已有接口代码、读数据库模型、写新接口、写测试、跑测试、修 bug，每一步都是一次工具调用。Skill 的话，可能就加载了一个代码规范相关的 Skill，一次。”</p>
<p>“工具调用频率远高于 Skill 加载，差不多 10:1 到 20:1 的比例。这也是为什么 Skill 要做渐进式加载——使用频率不像工具那么高，没必要全部常驻上下文。”</p>
<h2>场景题</h2>` },
      { "t": "11、面向一个复杂任务，你的 coding agent 的 plan 是怎么做的？", "tag": "技术派·携程", "p": "core", "html": `<p>老王合上笔帽，换了个方向：“来道场景题。如果来了一个复杂任务，你的 Agent 会怎么做 plan？”</p>
<p>“先判断任务是不是真的需要 plan。简单任务——比如'把这个变量名改一下'——直接走 ReAct 模式，一步到位，不需要规划。”</p>
<p>“复杂任务走 Plan-and-Execute 模式。规划器接收用户任务之后，生成一个带依赖关系的 JSON 计划。每个子任务有 id、描述、类型和依赖列表。”</p>
<p><img src="assets/jimg/agent-mianshi-xiecheng-20260727113323-31b9a838.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“计划生成之后先做拓扑排序，确认没有环依赖。然后按依赖关系分批执行——没有依赖的任务可以并行跑，有依赖的等前置任务完成再启动。”</p>
<p>“用户可以在执行前审查计划，觉得不对可以调整，也可以补充需求让规划器重新出方案。”</p>
<h4>多 Agent 编排具体是怎么做的？</h4>
<p>“Team 模式下有三个角色。”</p>
<p><img src="assets/jimg/agent-mianshi-xiecheng-20260727113505-29861275.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“规划器负责把任务拆解成带依赖关系的执行计划，只动脑子不动手，不调任何工具。Worker 是干活的角色，有独立的对话历史和完整的工具集，同一批没有依赖的任务可以分给不同的 Worker 并行执行，默认最多 2 个 Worker 同时工作。审查器负责质量把关，Worker 干完活之后审查器检查产出，不合格就打回重做，最多打回 2 次。”</p>
<h4>每个子 Agent 的区别是什么？</h4>
<p>“区别在两个维度：系统提示词和对话历史。”</p>
<p>“每个角色有专属的系统提示词，通过不同的模式加载——规划器的提示词告诉它'你只负责拆解任务，不许调工具'，Worker 的提示词告诉它'你负责执行具体步骤，工具随便用'，审查器的提示词告诉它'你负责检查质量，给出通过或打回的判断'。”</p>
<p><img src="assets/jimg/agent-mianshi-xiecheng-20260727113637-558cc572.png" decoding="async" loading="lazy" fetchpriority="low" width="1693" height="929"></p>
<p>“对话历史完全隔离。每个角色只看得到自己的交互记录，Worker-1 不知道 Worker-2 在干什么，审查器也看不到规划器是怎么想的。每个角色只关注自己职责范围内的信息，上下文干净，不容易互相干扰。”</p>
<h4>为什么这么设计？能不能所有的子 Agent 共享工具？</h4>
<p>“工具本身是共享的。三个角色用的是同一个工具注册表，11 个核心工具加上 MCP 动态工具，技术上所有角色都能访问到。”</p>
<p>“但规划器和审查器不调工具，这是通过提示词约束的，不是技术上做不到。设计上故意不让它们碰工具，原因是角色隔离——如果审查器有工具执行权限，它发现 Worker 的代码有问题，可能会自己动手去改。改完之后它再审查自己改的代码，那就是既当运动员又当裁判了。”</p>
<p><img src="assets/jimg/agent-mianshi-xiecheng-20260727113826-f052b7e0.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“工具执行权集中在 Worker 手里，规划器和审查器只做判断。出了问题也好定位——代码写得不对找 Worker，计划拆得不合理找规划器，漏检了找审查器，职责边界清清楚楚。”</p>
<h2>ending</h2>
<p>以前我们找工作拼的是八股文，背并发、背中间件、背设计模式。现在面试官问的是 prompt 怎么组装、上下文怎么压缩、Tool 和 Skill 有什么区别、多 Agent 怎么编排。</p>
<p>【<strong>技术栈在变，面试题在变，但有一件事没变——心态稳的人，学什么都快。</strong>】</p>
<p>AI 正在重新划分工程师的能力版图，这个过程才刚开始。不要着急，每天进步一点点就足够了。</p>
<p>跟着二哥的Agent八股，搞起来。</p>
<p>加油吧，兄弟姐妹们。</p>
<p>下期见。</p>` }
    ]
  });

  mine.chapters.push({
    "no": "13",
    "title": "技术派·阿里 · Agent面经（6 题）",
    "questions": [
      { "t": "文章导读与背景", "tag": "技术派·阿里", "p": "core", "html": `<p>说实话，我自己也是Qoder系列产品的重度使用者，感觉确实发展快。</p>
<p>一开始，我看有些小伙伴反馈嫌贵，单由于接的是某海外顶级模型，价格比国内模型肯定贵一些。</p>
<p>但Claude Code和Codex也不是每个人都能用得上，所以Qoder反而在国内成为了不错的替代品。</p>
<p><img src="assets/jimg/sucai-20260730102655.png" decoding="async" fetchpriority="high" width="1080" height="607"></p>
<p>他们最近新开源的 Better Harness 我看了一下，确实都是Agent时代值得去参考和借鉴的东西。</p>
<blockquote>
 <p><a href="https://github.com/QoderAI/better-harness">https://github.com/QoderAI/better-harness</a></p>
</blockquote>
<p>我也第一时间接入到了我自己的Coding产品PaiCLI中。</p>
<p><img src="assets/jimg/agent-mianshi-ali-20260730113328.png" decoding="async" loading="lazy" fetchpriority="low" width="2290" height="850"></p>
<blockquote>
 <p>同样开源：<a href="https://github.com/itwanger/PaiCLI-Python">https://github.com/itwanger/PaiCLI-Python</a></p>
</blockquote>
<p>就目前来说，最成功的 AI 产品当属 Claude Code和Codex，其次就是Qoder、WorkBuddy这些国内的 Agent，那“羡慕隔壁组做 Qoder 的”绝对是最真实的心声。</p>
<p>对于传统业务，最好的结果无非就是优化存量，但 AI 工具团队却在创造增量，说不羡慕，那绝对是嫉妒。😄</p>
<p>AI Coding 方向的迭代速度极快，团队每天都有新的、可见的产出。在大厂，可见的产出等于可见的绩效。可见的绩效等于年底的丰厚年终奖。</p>
<p>原因很简单——程序员是大模型落地最直接的用户群体，AI Coding 工具的使用频次和付费意愿远高于其他场景。再加上，Agent 让那些原本不具备开发能力的群体也能产出自己的产品。</p>
<p>这意味着 Agent 方向的岗位未来两三年只会越来越多。</p>
<p>限流、熔断、异步队列、幂等设计、调用追踪、灰度发布——这些在三高时代积累的工程能力，在 Agent 产品化的过程中一个都不能少。</p>
<p>以前管的是 HTTP 请求，现在你管的是 LLM 调用。上下文窗口是新的内存管理，token 预算是新的 QPS 限流，工具调用是新的 RPC 网关。</p>
<p>做 Agent 不需要去训模型、搞推理加速、写 CUDA。它需要的是你能把大模型的能力包装成一个可靠的服务——能扛住流量、能处理异常、能追踪问题、能持续迭代。</p>
<p>如果你是一位愿意在自己的节奏下学一些新东西的人，那接下来这份 Agent 面试题，可以好好读一读。</p>
<p><img src="assets/jimg/agent-mianshi-ali-20260730114513-4f1ceb8e.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>（全文比较肝，保证大家能学到很多很多，系好安全带，我们粗粗粗粗发～）</p>
<h2>场景题</h2>` },
      { "t": "在淘天高并发场景下，将 Agent Demo 改造为能支撑“双十一”级别流量的生产系统，最大的架构挑战是什么？", "tag": "技术派·阿里", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·阿里", "p": "core", "html": `<p>老王翻了翻简历上的项目经历，开口就是一个很难的场景题：“假设你来我们淘天，要把一个实验性质的 Agent Demo 改造成能扛双十一的生产系统，你觉得最大的架构挑战是什么？”</p>
<p>“最大的挑战是 LLM API 会成为单点瓶颈。”</p>
<p><img src="assets/jimg/agent-mianshi-ali-20260730114737-a7698169.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“传统微服务扛流量的思路是水平扩容——流量大了加实例，实例不够加节点。但 Agent 系统的核心依赖是 LLM API 调用，这东西有三个特性让它没法用传统思路来扩。”</p>
<p>“第一，延迟量级不同。HTTP 接口的响应时间是毫秒级，LLM 接口是秒级。一个 Agent 处理一次用户请求可能需要 3 到 5 次 LLM 调用，每次两三秒，加起来就是十几秒，长程任务甚至需要几个小时。传统的同步请求模型在这种延迟下会把线程池打满。”</p>
<p>“第二，QPS 有上限。不管你扩多少个 Agent 实例，它们都在调同一个 LLM 端点。模型提供商给你的 RPM（Requests Per Minute，每分钟请求数）配额是固定的，假如是 1 万次/分钟，10 个 实例 和 100 个 实例 分到的总额度没变。”</p>
<p>“第三，成本随调用量线性增长。每次 LLM 调用按 token 计费，双十一峰值可能是平时的 50 到 100 倍，成本也跟着翻这么多。”</p>
<p>“针对这三个问题，我的应对方案分四层。”</p>
<p><img src="assets/jimg/agent-mianshi-ali-20260730114939-b3a0e8ad.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“第一层，语义缓存（Semantic Cache）。把用户查询做 Embedding，在缓存里找语义相似的历史查询。双十一场景下大量问题是重复的——‘我的快递到哪了’‘怎么申请退款’‘能用几个红包’。这类高频问题命中缓存后直接返回，不走 LLM。”</p>
<p>“第二层，模型分级路由。不是所有请求都需要最强的模型。简单查询（订单状态、物流追踪）走小参数模型甚至走规则引擎，只有复杂的多轮对话才走大模型。路由的依据是意图分类器的输出，分类器本身用轻量模型或者规则匹配就行。”</p>
<p>“第三层，全流程异步化。用户请求进来先入 RocketMQ，Agent Worker 从队列消费。削峰填谷的同时也解决了线程池打满的问题。实时场景设超时兜底，超时就降级到模板回复。”</p>
<p>“第四层，工具调用熔断。Agent 执行过程中会调外部 API——库存服务、物流服务、支付服务。双十一这些下游服务自己也在扛流量，随时可能超时。每个工具调用加 Sentinel 熔断器，错误率超过阈值直接短路。同时所有工具调用都做幂等设计，防止重试导致重复下单或重复退款。”</p>
<h4>为什么不能直接水平扩容 Agent 实例？</h4>
<p>“因为瓶颈在 LLM API，不在计算资源。”</p>
<p><img src="assets/jimg/agent-mianshi-ali-20260730115151-a6d6eb80.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“假设 LLM 端点的 RPM 上限是 1 万次/分钟，你扩 10 个 实例 还是 100 个 实例，能发出去的请求总量没变。100 个 实例 只是让更多线程同时排队，排队速度不会变快。”</p>
<p>“真正能提升吞吐的是减少 LLM 调用次数——语义缓存、模型分级、规则引擎前置——把有限的额度留给真正需要大模型推理的请求。”</p>` },
      { "t": "01、在构建 Agent 框架时，选择 LangChain/LlamaIndex 还是自研？", "tag": "技术派·阿里", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·阿里", "p": "core", "html": `<p>老王端起茶杯抿了一口：“框架选型这块，你怎么看 LangChain 这类开源框架和自研？”</p>
<p>“这个问题我有实际经验。PaiCLI 的核心 Agent 循环是自研的，基于 Spring AI 做模型层抽象。另一个项目 PaiAgent 用了 LangGraph4j 做复杂的 DAG 工作流编排。”</p>
<p><img src="assets/jimg/agent-mianshi-ali-20260730120627-d7099a27.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“先说 LangChain 的优势。生态是真的强，500 多个集成，向量数据库、模型提供商、工具连接器几乎全覆盖。做 POC 验证想法，差不多两三天就能出一个能跑通的 Demo。社区活跃，遇到问题基本都能搜到解法。”</p>
<p>“但它的问题也是真实存在的。”</p>
<p>“第一，调试成本高。一个简单的工具调用，经过好几层框架内部的包装，报错时堆栈太多。你想知道‘为什么这次工具调用返回了空’，得先理解框架的内部状态。”</p>
<p>“第二，版本是历史包袱。LangChain 早期从 0.1 到 0.2 到 0.3 几乎是三个不同的框架，API 断裂式变更。虽然到了 1.x 稳定了不少，但这段历史说明一件事——你的生产代码依赖别人的迭代节奏，这本身就是风险。”</p>
<p>“第三，抽象。框架的设计是通用的，但你的业务是完全不同的。为了适配，你得写大量代码把自己的逻辑塞进框架的接口里。”</p>
<p><img src="assets/jimg/agent-mianshi-ali-20260730120820-a4072495.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“自研的优势是完全掌控每一步。调试直接看自己的代码，性能瓶颈知道在哪，迭代节奏自己定。况且现在 Agent 的 Coding 能力已经很强了，完全不用担心自研。”</p>
<p>“我的判断——做技术验证和快速原型，用框架。做生产系统，核心自己写，框架当工具库用。”</p>` },
      { "t": "02、如何控制 Agent 的自主性边界？如何设计安全护栏？", "tag": "技术派·阿里", "p": "core", "html": `<p>“自主性边界的核心原则——确定性的规则走规则引擎，模糊的地方交给 LLM 判断，高风险动作交给人工审批。”</p>
<p><img src="assets/jimg/agent-mianshi-ali-20260730121031-a3ea383b.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“...</p>` }
    ]
  });

  mine.chapters.push({
    "no": "14",
    "title": "技术派·海康威视 · Agent评测面经（10 题）",
    "questions": [
      { "t": "文章导读与背景", "tag": "技术派·海康威视", "p": "core", "html": `<p>简单给大家科普下。</p>
<p>如有错误和遗漏，还请大家指出（我超爱学习的～</p>
<p><img src="assets/jimg/sucai-20260803093803.png" decoding="async" fetchpriority="high" width="1672" height="941"></p>
<p>特此声明，代表公司不等于实力排名，同一家公司可以横跨多个层级。</p>
<p><strong>①、上游基础层，主要提供数据、芯片与算力的基础设施</strong>。</p>
<p>比如说数据采集与标注的海天瑞声、AI训练与推理芯片的华为昇腾、智驾与边缘AI芯片的寒武纪、AI服务器与集群的中兴、云计算与智能算力的火山引擎、智算中心与IDC的中国移动等等。</p>
<p><strong>②、中游模型层，主要提供基础模型、行业模型与模型平台</strong>。</p>
<p>先说大厂，比如阿里的千问、腾讯的混元、字节的豆包、科大讯飞的讯飞星火、华为的盘古。</p>
<p>然后是创业公司，DeepSeek、智谱的GLM、月之暗面的Kimi。</p>
<p>再然后是针对特定行业的大模型，比如说第四范式、金融领域的蚂蚁、医疗领域的科大讯飞、教育领域的网易、政务与城市治理的商汤科技等。</p>
<p><strong>③、下游应用层，主要提供面向用户的C端产品，以及真实业务</strong>。</p>
<p>元宝、夸克、WorkBuddy、Qoder、WPS AI、TRAE、小浣熊、可灵、即梦。</p>
<p>视觉AI与AIoT领域的海康威视，主要从事智能视频、机器视觉、智慧交通、工业视觉等。</p>
<p>以及小鹏汽车、理想汽车、蔚来汽车、比亚迪等提供的智能驾驶。</p>
<p>机器人领域的宇树科技、智元等。</p>
<p>PS：我必须强调一点，在我的公众号，我只会讲一家公司的好话，拍一家公司的马屁。不要怂恿我批评一家公司，因为大厂的法务不是吃素的，我惹不起，兄弟姐妹们，之前吃过不少亏，没办法（你们懂的。</p>
<p>那站在积极正面、充满正能量、激情热血的一面，海康威视也是AI应用落地值得去冲的一家公司，</p>
<p>2026年上半年，海康威视的复苏明显加速，总营收来到了468.23亿元。其中PBG公共服务、EBG企事业、SMBG中小企业、海外主业、创新业务都有不同程度的营收增长。</p>
<p><img src="assets/jimg/sucai-20260803095939.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>一句话来概括海康威视的护城河业务就是。</p>
<blockquote>
 <p>用规模化感知设备获得物理世界入口，用边缘AI理解现场，用行业平台组织流程，再用控制设备和机器人完成行动闭环。</p>
</blockquote>
<p>换句话说，DeepSeek 等模型能力越强，海康就越有条件把资源集中在自己真正擅长的物联感知、边缘部署、行业知识和物理执行层。</p>
<p>如果你是一位愿意相信努力、相信过程、相信一步一个脚印、相信自己能在 AI 时代分一杯羹的人，那接下来这份硬核的面经，希望你能认真读一读。</p>
<p><img src="assets/jimg/haikang-agent-eval-mianshi-20260803105756-3dcdeb39.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>（全文比较肝，保证大家能学到很多很多，系好安全带，我们粗粗粗发～）</p>

<p><img src="assets/jimg/haikang-agent-eval-mianshi-20260803144119.png" decoding="async" loading="lazy" fetchpriority="low" width="2286" height="940"></p>
<blockquote>
 <p>文中涉及的PaiCLI Agent 已经开源到GitHub，Go版本也有：<a href="https://github.com/itwanger/PaiCLI-Python">https://github.com/itwanger/PaiCLI-Python</a></p>
</blockquote>` },
      { "t": "01、对 Agent 自进化的理解", "tag": "技术派·海康威视", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·海康威视", "p": "core", "html": `<p>老王低头翻着我的简历，无名指上的戒指碰到纸面，发出轻轻的响声。翻到第二页停了下来：“Agent 自进化，你展开聊聊？”</p>
<p>“自进化的核心是——不改模型权重，在应用层让 Agent 自己变好。”</p>
<h4>和 fine-tuning 的区别在哪？</h4>
<p>fine-tuning 要收集标注数据、跑训练、部署新模型，周期长、成本高。</p>
<p>自进化走的是另一条路——Agent 在执行任务的过程中，自动分析哪些做法有效、哪些失败，把有效的经验积累下来，下次遇到类似任务直接复用。</p>
<p><img src="assets/jimg/haikang-agent-eval-mianshi-20260803105942-e9a79e7a.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>具体来说有三条路径。</p>
<p>第一条，Prompt 进化。Agent 跑完一批任务后，分析失败的执行轨迹，提取反复出现的失败模式，自动生成新的约束规则写入 system prompt。比如发现模型经常在多文件编辑时漏掉某个文件，就补一条“多文件编辑前先用工具列出所有需要修改的文件清单”。</p>
<p>第二条，工具链优化。记录成功任务的工具调用序列，发现某些工具组合的成功率特别高，下次遇到类似任务优先走验证过的路径。</p>
<p>第三条，知识库增量。把解决过的问题和方案结构化存入长期记忆。下次遇到同类问题，先检索经验库，不用从零开始推理。</p>` },
      { "t": "02、自进化产物的提取标准和质量评估", "tag": "技术派·海康威视", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·海康威视", "p": "core", "html": `<p>“提取标准有三条。”</p>
<p>“第一，任务最终成功了。只有成功的执行轨迹才值得提取。失败的轨迹是反面教材，用来生成约束规则，不用来生成推荐路径。”</p>
<p>“第二，效率高于基线。同样的任务，如果这次用了更少的步骤或更少的 token 就完成了，说明这条路径有优化价值。”</p>
<p>“第三，用户认可。Agent 的回答用户接受了、代码提交了、没有要求修改，这些隐式信号也算认可。”</p>
<h4>质量怎么评估？</h4>
<p>“三个维度。”</p>
<p><img src="assets/jimg/haikang-agent-eval-mianshi-20260803121915-364d8c44.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“结果维度——提取出来的经验，拿去跑同类任务，成功率有没有提升。这个要实测，不能凭感觉。”</p>
<p>“泛化维度——这条经验换个场景还管不管用。如果只对某个特定 case 有效，换个项目就不行，那就是过于耦合了，价值不大。”</p>
<p>“可解释维度——提取出来的规则，人类能不能看懂、能不能审核。不可解释的经验不能放进 system prompt，因为你不知道它为什么有效，也不知道它什么时候会失效。”</p>` },
      { "t": "03、数据从哪来？怎么判断高质量数据？", "tag": "技术派·海康威视", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·海康威视", "p": "core", "html": `<p>老王端起茶杯喝了一口：“用于做 Agent 自进化的数据从哪来？”</p>
<p>“三个来源。”</p>
<p>“第一个，生产环境的真实执行轨迹。这是最有价值的数据，因为是真实用户在真实场景下的真实任务。每一轮 Agent 和用户的交互都会记录成不可变的 JSONL 日志，包括 LLM 消息、工具调用、执行结果、耗时。”</p>
<p><img src="assets/jimg/haikang-agent-eval-mianshi-20260803110558-5a977cb3.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“第二个，Golden Set（标准测试集）的执行记录。在受控环境下跑标准用例，每条用例有明确的输入和预期输出。跑出来的轨迹可以精确标注成功和失败。”</p>
<p>“第三个，人工构造的种子数据。冷启动阶段没有足够的生产数据，手动写几条标准的执行轨迹作为起步。数量不用多，能覆盖主要的任务类型就行。”</p>
<h4>怎么判断高质量？</h4>
<p><img src="assets/jimg/haikang-agent-eval-mianshi-20260803110821-b9095390.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>四个信号。</p>
<ul>
 <li>任务最终成功，</li>
 <li>过程高效——步骤数和 token 消耗在合理范围内，</li>
 <li>无副作用——没有误删文件、没有执行危险命令，</li>
 <li>可泛化——不是针对特定文件路径或特定项目结构的 hack。四个条件都满足，才算高质量。</li>
</ul>` },
      { "t": "04、为什么在沙箱环境做自进化？", "tag": "技术派·海康威视", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·海康威视", "p": "core", "html": `<p>“第一，安全。自进化过程中 Agent 会尝试新策略，新策略可能有副作用——删错文件、执行错误命令、改坏代码。在沙箱里犯错不影响真实环境。”</p>
<p><img src="assets/jimg/haikang-agent-eval-mianshi-20260803111111-292d9076.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“第二，可复现。每次实验从同一个干净状态出发，变量只有 Agent 的策略差异，结果才有可比性。如果在真实环境跑，上一次实验的残留会污染下一次，不知道效果提升是策略的功劳还是环境碰巧有利。”</p>
<p>“第三，可逆向。策略不好就回滚快照从头再来，成本很低。真实环境里把代码改坏了，回滚的代价要大得多。”</p>` },
      { "t": "05、快照的选择时机", "tag": "技术派·海康威视", "p": "core", "html": `<p>“你提到快照和回滚，那快照在什么时机做？”</p>
<p>“第一个，每一轮自进化迭代开始前，做一次全量快照。这是 baseline（基准状态），不管后面发生什么，都能回到这个干净状态。我的做法是用独立的 Git 仓库做快照管理，和用户项目的 .git 完全隔离。每次 Agent 开始执行前自动做一次 pre-turn（执行前）快照。”</p>
<p><img src="assets/jimg/haikang-agent-eval-mianshi-20260803111448-b59857bb.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“第二个，每次 Agent 执行完一个完整任务后，做增量快照。这是 checkpoint（检查点），记录阶段性成果。post-turn（执行后）快照放在后台异步写入，不阻塞主流程。”</p>
<p>“第三个，Agent 即将执行高风险操作前——比如批量删除文件、执行不可逆的 shell 命令——做即时快照。万一操作出了问题，能精确回滚到操作之前的状态。”</p>
<h4>触发方式</h4>
<p><img src="assets/jimg/haikang-agent-eval-mianshi-20260803111739-19fbeea7.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“两种方式配合用。定时快照按迭代周期自动触发，事件驱动快照在特定事件——任务完成、错误发生、高风险操作——触发。快照...</p>` }
    ]
  });

  mine.chapters.push({
    "no": "15",
    "title": "技术派·长鑫存储 · Agent面经（22 题）",
    "questions": [
      { "t": "文章导读与背景", "tag": "技术派·长鑫存储", "p": "core", "html": `<p>看到这样一则爆料，挺有意思。</p>
<blockquote>
 <p>长鑫存储落地合肥之后，原来的偏僻区域也热闹起来了。最猛的时候疯狂扩招，大量两万+月薪的工程师往里冲，附近公寓、小区、商场一起被带热，房租直接涨了50%。</p>
</blockquote>
<p>可想而知，在AI时代，最缺的两样，算力资源和AI人才有多紧俏。</p>
<p>作为国内 DRAM（动态随机存取记忆体）的龙头，长鑫存储恰好处于国产缺口、产能扩张和技术升级的交汇点，被视为 AI 存储黄金赛道的最大受益者之一。</p>
<p>PS：DRAM 是一种半导体记忆体，主要负责暂存电脑、手机正在运行的程序和资料。</p>
<p>我去帮大家调研了一下，长鑫存储近期确实在大力招募 AI Agent 方向的研发人员，岗位主要集中在合肥总部和上海。</p>
<p><img src="assets/jimg/sucai-20260804113544.png" decoding="async" fetchpriority="high" width="1672" height="941"></p>
<p>长鑫存储本身并不做Agent，但Agent的规模化必然会间接增加两类内存需求。</p>
<p>云端 Agent 拉动 DDR5（第五代双倍数据率同步动态随机存取内存，目前主流电脑和服务器的最新一代主内存标准），端侧 Agent 拉动 LPDDR5X（低功耗第五代双倍数据率内存的增强版，专门为智能手机、轻薄本及移动端 AI 设备设计的高性能、超低功耗主内存芯片）。</p>
<p>Agent 的任务链更长、上下文更大、工具调用更频繁、并发量更高。模型权重主要放在 HBM（High Bandwidth Memory，高带宽内存）里，但服务器还需要大量 DRAM 承担请求调度与预处理、Agent 运行状态、RAG 检索结果、KV Cache 卸载、数据缓存、多 Agent 并发任务、数据库和工具服务。</p>
<p>如果你是一位愿意相信努力、相信过程、相信一步一个脚印、相信自己能在 AI 时代分一杯羹的人，那接下来这份硬核的面经，希望你能认真读一读。</p>
<p><img src="assets/jimg/agent-mianshi-changxin-20260804121732-01ca6052.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>（全文比较肝，保证大家能学到很多很多，系好安全带，我们粗粗粗发～）</p>

<p><img src="assets/jimg/agent-mianshi-changxin-20260804135851.png" decoding="async" loading="lazy" fetchpriority="low" width="2288" height="1382"></p>
<blockquote>
 <p>文中涉及的PaiCLI Agent 已经开源到GitHub，Go版本也有：<a href="https://github.com/itwanger/PaiCLI-Python">https://github.com/itwanger/PaiCLI-Python</a></p>
</blockquote>` },
      { "t": "01、Agent 系统中的 Memory，与计算机硬件中的 DRAM 有什么联系？", "tag": "技术派·长鑫存储", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·长鑫存储", "p": "core", "html": `<p>老王推了推眼镜，翻了翻简历。“开门见山问一个基础的。Agent 系统中的 Memory，和计算机硬件中的 DRAM，有什么联系？”</p>
<p>“DRAM 是物理存储介质，按地址读写，断电数据就没了。它不关心存的是什么内容，只负责往指定地址写入、从指定地址读取。”</p>
<p>“Agent Memory 是软件抽象层，按语义检索，可以选择持久化到磁盘或数据库。它关心的是‘记住什么、什么时候该想起来用’。”</p>
<p><img src="assets/jimg/agent-mianshi-changxin-20260804122227-712250b7.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“主板上插了多大的内存条 DRAM 的容量就多大。Agent Memory 的容量受上下文窗口限制，但可以把事实记忆存到磁盘，需要的时候再检索回来注入上下文。”</p>` },
      { "t": "02、大模型上下文变长后，为什么 KV Cache 会快速占用显存和内存？", "tag": "技术派·长鑫存储", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·长鑫存储", "p": "core", "html": `<p>“KV Cache 是 Transformer 推理时的核心缓存。每生成一个新 token，模型都要回顾之前所有 token 的 Key 和 Value 向量来计算注意力。如果每次都重新算，计算量会随序列长度平方增长。KV Cache 的做法是把已经算过的 Key 和 Value 缓存下来，新 token 只需要算自己的 Query，然后和缓存里的 Key、Value 做注意力计算。”</p>
<p><img src="assets/jimg/agent-mianshi-changxin-20260804122532-fec7a653.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“占用之所以大，是因为 KV Cache 的体积和序列长度成正比。”</p>
<p>“具体来说，KV Cache 的大小等于 2 乘以模型层数、乘以 KV 头数、乘以每个头的维度、乘以序列长度、乘以 batch size、再乘以每个元素的字节数。”</p>
<p>“以一个 70B 参数的模型为例。假设 80 层，用 GQA（Grouped Query Attention，分组查询注意力）做了优化，8 个 KV 头，每个头 128 维，BF16（半精度浮点）精度下每个元素 2 字节。单个 token 的 KV Cache 占用大约 320KB。上下文 4K 的时候差不多 1.3GB，到 128K 就飙到大约 40GB——接近模型权重本身的大小了。”</p>
<p>“如果同时服务多个用户，每个用户一份独立的 KV Cache，再乘以 batch size。这就是为什么长上下文加上高并发的场景下，KV Cache 会成为显存和内存的最大消耗者。”</p>
<p><img src="assets/jimg/agent-mianshi-changxin-20260804122919-af11c817.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>` },
      { "t": "03、大模型推理什么时候是算力瓶颈，什么时候是内存带宽瓶颈？", "tag": "技术派·长鑫存储", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·长鑫存储", "p": "core", "html": `<p>老王端起茶杯喝了口水。“接着上一题，推理的瓶颈不是一直不变的。什么时候卡算力，什么时候卡带宽？”</p>
<p>“第一个阶段叫预填充（Prefill），就是处理用户输入的整段 prompt。这个阶段所有 token 并行计算矩阵乘法，计算密度非常高，GPU 的算力利用率能到 90% 以上。瓶颈在算力——GPU 的浮点计算能力决定了这个阶段的速度。”</p>
<p><img src="assets/jimg/agent-mianshi-changxin-20260804123256-f893fde1.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“第二个阶段叫解码（Decode），就是逐个生成输出 token。每生成一个 token，都要把整个 KV Cache 从显存里读一遍来做注意力计算，但每次只产出一个 token 的计算量。计算量小，数据搬运量大，GPU 大部分时间在等数据从显存传过来。这时候瓶颈在内存带宽。”</p>
<p>“一句话概括就是，Prefill 阶段是算得慢，Decode 阶段是读得慢。”</p>` },
      { "t": "04、多 Agent 并发运行为什么更容易产生 OOM？", "tag": "技术派·长鑫存储", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·长鑫存储", "p": "core", "html": `<p>“原因是每个 Agent 都有自己独立的内存开销，N 个 Agent 并发就是 N 倍。”</p>
<p>“单个 Agent 运行时至少要维护三份数据：当前对话的上下文窗口、工具调用返回的结果缓存、还有从记忆库检索回来的历史信息。”</p>
<p><img src="assets/jimg/agent-mianshi-changxin-20260804123606-849f770a.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“多 Agent 并发的问题在于，这些开销不共享。每个 Agent 有自己的对话历史，有自己的工具调用结果，有自己的任务状态。就算 system prompt 相同可以共享缓存，动态生成的部分也没办法复用。”</p>` },
      { "t": "05、Agent 的工作记忆、情景记忆和长期记忆应该如何分层？", "tag": "技术派·长鑫存储", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·长鑫存储", "p": "core", "html": `<p>老王放下茶杯，翻了翻简历背面。“说说你对 Agent 记忆分层的理解。工作记忆、情景记忆、长期记忆，怎么分？”</p>
<p>“工作记忆对应当前的上下文窗口。当前对话的内容、system prompt、工具调用的结果，全在这里。”</p>
<p>“情景记忆存的是过往交互的日志。比如上周和用户聊过什么、之前执行过哪些任务、哪些成功了哪些失败了。按时间和场景索引，需要的时候检索出来注入工作记忆。”</p>
<p><img src="assets/jimg/agent-mianshi-changxin-20260804123947-63043d3a.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“语义记忆，也就是知识库。用户手册、产品文档、领域知识，切成块之后做向量索引。检索方式是语义相似度匹配，和情景记忆按时间检索不同。”</p>
<p>“程序记忆，存的是技能和执行模式。Skill 定义文件、工作流模板、常用的操作序列，这些是‘怎么做事’的知识，不是‘知道什么’的知识。”</p>
<p>“PaiCLI 目前实现了前两层：短期的对话记忆和长期的事实记忆。事实记忆持久化到本地文件，跨会话可用。情景记忆和程序记忆目前是隐式的——对话历史里天然包含了过往交互，Skill 文件天然就是程序记忆。”</p>
<h4>为什么不把所有记忆都放进上下文窗口？</h4>
<p>“两个原因。”</p>
<p>“第一，上下文窗口有上限。”</p>
<p><img src="assets/jimg/agent-mianshi-changxin-20260804124342-c30eb745.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“第二，注意力稀释。Transformer 的注意力机制在上下文越长的时候，对每个 token 的关注度越分散。塞进去太多无关信息，模型反而更容易忽略真正重要的内容。分层的目的就是让工作记忆里只保留当前任务最需要的信息，其余的按需检索。”</p>` },
      { "t": "06、Redis、向量数据库、关系数据库和对象存储分别适合保存什么 Agent 数据？", "tag": "技术派·长鑫存储", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·长鑫存储", "p": "core", "html": `<p>“Redis 适合存会话状态和短期缓存。Agent 的当前会话 ID、最近几轮对话历史、工具调用的临时结果，这些数据访问频率高、生命周期短。Redis 的读写速度快，TTL（自动过期）机制能自动清理过期数据。PaiCLI 的会话状态就存在 Redis 里，7 天自动过期。”</p>
<p><img src="assets/jimg/agent-mianshi-changxin-20260804124730-37f83d7e.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“向量数据库适合存语义记忆。知识库文档切块之后生成向量索引，用户提问时做相似度检索。关键词匹配找不到的东西，语义检索能找到。派聪明用的是 Elasticsearch 的混合检索，BM25 关键词匹配和向量语义检索并行跑，结果合并排序。”</p>
<p>“关系数据库适合存结构化的业务数据。用户信息、任务执行记录、审计日志、评估结果，这些数据需要事务保障和复杂查询能力。Agent 的审计日志尤其重要——谁在什么时间调用了什么工具、结果是什么、有没有经过人工审批，这些都要可追溯。”</p>
<p>“对象存储适合存大文件和长期归档。用户上传的文档、Agent 生成的报告、对话历史的原始日志，数据量大但访问频率低。对象存储容量大、成本低，适合做冷数据的落盘。”</p>` },
      { "t": "07、如何设计上下文压缩，避免 Agent 运行时间越长、Token 消耗越大？", "tag": "技术派·长鑫存储", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·长鑫存储", "p": "core", "html": `<p>老王看了一眼手表，无名指上的戒指反了一下光。“上下文管理是 Agent 工程化绕不开的问题。聊聊你们怎么做压缩的。”</p>
<p>“思路是‘近处保全、远处摘要’。”</p>
<p>“最近 N 轮对话保持原样，一个字都不动。PaiCLI 默认保留最近 3 轮。因为用户最近说的话大概率和当前任务直接相关，压缩了会丢失关键信息。”</p>
<p><img src="assets/jimg/agent-mianshi-changxin-20260804125116-c8e0db19.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“再往前的历史消息，做 Map-Reduce 摘要。每 5 条消息分成一组，每组让 LLM 生成一段摘要，然后把所有摘要合并成一段总结。压缩后的总结加上最近 3 轮的原始对话，替换掉原来的完整历史。”</p>
<p>“触发时机是 token 占用达到预算的 70% 左右。不能等到快满了才压缩，因为压缩本身需要调用 LLM 做摘要，也要消耗 token 和时间。留出余量才能从容处理。”</p>
<p>“摘要的时候有一个细节很重要：区分临时信息和稳定事实。‘用户让我写一个排序函数’这种临时请求，压缩后可以丢掉。但‘项目路径是 /Users/xxx/project’‘用户偏好 TypeScript’这种稳定事实，必须保留。PaiCLI 的压缩模块会做这个区分，临时的过滤掉，稳定的提取出来放进长期记忆。”</p>
<h4>为什么不直接截断旧消息？</h4>
<p>“截断是最简单的方案，但容易丢信息。”</p>
<p><img src="assets/jimg/agent-mianshi-changxin-20260804125547-917fb648.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“假如 Agent 在第 3 轮和用户确认了一个重要的设计决策，到第 20 轮的时候这条消息被截断了。Agent 就忘了这个决策。摘要至少能把关键信息的语义保留下来，虽然细节模糊了，但核心结论还在。”</p>
<p>“当然，如果 LLM 摘要调用失败了，PaiCLI 也会降级到简单截断。”</p>` },
      { "t": "08、KV Cache 量化、分页和卸载分别解决什么问题？", "tag": "技术派·长鑫存储", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·长鑫存储", "p": "core", "html": `<p>“量化解决的是‘单个 KV 太大’的问题。把 KV Cache 从 BF16 精度降到 INT8，每个元素从 2 字节变成 1 字节，显存占用直接减半。INT8 量化几乎无损，对生成质量的影响很小。继续降到 INT4 可以再减半，但精度损失会比较明显，适合对质量要求不那么高的场景。”</p>
<p><img src="assets/jimg/agent-mianshi-changxin-20260804130138-4510efe6.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“分页解决的是‘内存碎片’的问题。传统做法是给每个序列预分配一块连续的显存来放 KV Cache，但序列长度事先不确定——分多了浪费，分少了不够用。vLLM 的 PagedAttention 把 KV Cache 切成固定大小的页，按需分配，不要求连续存储。就像操作系统的虚拟内存分页一样。好处是多个序列可以共享相同前缀的页，比如 system prompt 部分只存一份。”</p>
<p>“卸载解决的是‘显存放不下’的问题。把暂时用不到的 KV Cache 搬到 SSD 上，需要的时候再搬回来。本质是拿延迟换容量，适合超长上下文的离线任务。”</p>` },
      { "t": "09、一个长时间运行的 Agent，如何实现状态持久化和故障恢复？", "tag": "技术派·长鑫存储", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·长鑫存储", "p": "core", "html": `<p>“靠快照机制。”</p>
<p>“思路是每轮执行前后各打一次快照。pre-turn 快照在 LLM 调用之前保存当前状态，post-turn 快照在这一轮执行完之后异步保存。”</p>
<p><img src="assets/jimg/agent-mianshi-changxin-20260804130541-064bf249.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“快照里存的是 Agent 的完整运行状态：对话历史、记忆内容、任务进度、工具调用结果、当前执行到哪个步骤。这些信息整合在一起，才能完整还原 Agent 中断前的状态。”</p>
<p>“PaiCLI 用的是本地文件系统，在项目目录下有一个专门的快照目录。也可以用数据库，取决于部署环境。”</p>
<p>“恢复的时候，找到最近一个完整的 post-turn 快照，加载回来，跳过已经完成的步骤，从下一个待执行的步骤继续。如果某一轮的 post-turn 快照写到一半 Agent 就挂了，就回退到 pre-turn 快照，重新执行这一轮。”</p>
<h4>为什么不用数据库事务来保障一致性？</h4>
<p><img src="assets/jimg/agent-mianshi-changxin-20260804131045-40cbde3b.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“数据库事务保障的是单行或多行数据的原子性。但 Agent 的状态横跨对话历史、记忆存储、任务进度、工具调用结果，这些可能分布在不同的存储里。跨存储的分布式事务成本太高，快照做全量保存、恢复时全量加载，反而更简单可靠。”</p>` },
      { "t": "10、如果 Agent 突然出现延迟升高，应当监控 Token、显存、内存和工具调用中的哪些指标？", "tag": "技术派·长鑫存储", "p": "core", "html": `` },
      { "t": "文章导读与背景", "tag": "技术派·长鑫存储", "p": "core", "html": `<p>老王把简历翻回正面放好。“最后一题，偏实际运维的。Agent 突然变慢了，你怎么排查？”</p>
<p>“分四个维度看。”</p>
<p>“Token 维度先查输入 token 数。如果最近几轮的输入 token 突然变大，说明上下文在膨胀——可能是压缩没触发，也可能是某次工具调用返回了大量数据没做截断。再查 Prompt Cache 的命中率，命中率下降意味着每次请求都要重新计算完整的上下文，延迟和成本同时上升。”</p>
<p><img src="assets/jimg/agent-mianshi-changxin-20260804131506-1f26ae28.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p>“显存和内存维度看 KV Cache 的占用量和 batch 队列深度。KV Cache 占用接近显存上限的时候，新请求只能排队等老请求释放，延迟自然上升。内存方面看进程的常驻内存占用，如果持续增长不回落，可能有内存泄漏或者某个 Agent 的上下文一直在膨胀没被压缩。”</p>
<p>“工具调用维度查三个指标：单次工具调用的耗时、是否有超时重试、调用频率有没有异常增长。PaiCLI 的审计日志里记录了每次工具调用的名称、参数、耗时和结果状态，查日志一眼就能定位到是哪个工具拖慢了整体。”</p>
<p>“系统维度看 GPU 利用率和网络延迟。GPU 利用率打满说明算力不够用了，利用率很低但延迟高说明瓶颈不在计算而在数据传输或排队。如果 Agent 要调用外部 API，网络延迟的波动也需要关注。”</p>
<p><img src="assets/jimg/agent-mianshi-changxin-20260804132023-491a22dc.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>` },
      { "t": "PaiCLI 如何写到简历上？", "tag": "技术派·长鑫存储", "p": "core", "html": `<p><strong>项目名称</strong>：PaiCLI — 终端 AI Agent 命令行工具</p>
<p><strong>项目简介</strong>：对标 Claude Code 的 Java 版终端 Agent，支持 ReAct、Plan-and-Execute、Multi-Agent Team 三种执行模式，具备多轮对话、代码搜索、工具调用、上下文压缩和状态恢复等能力。</p>
<p><strong>技术栈</strong>：Java 21 + Spring AI + Redis + Elasticsearch + MCP 协议</p>
<p><img src="assets/jimg/agent-mianshi-changxin-20260804132449-8ecc349e.png" decoding="async" loading="lazy" fetchpriority="low" width="1672" height="941"></p>
<p><strong>核心职责</strong>：</p>
<ul>
 <li>设计并实现 Agent 双层记忆架构，短期记忆存储当前会话上下文并按 token 预算动态裁剪，长期记忆持久化到本地文件并通过时间衰减和语义相关度加权检索，跨会话复用用户偏好和项目信息</li>
 <li>实现 Map-Reduce 上下文压缩机制，保留最近 3 轮完整对话，旧消息按 5 条一批生成摘要后合并，触发阈值设在 token 预算的 70%，配合事实提取过滤临时请求保留稳定信息，支撑 Agent 长时间运行</li>
 <li>构建 pre-turn/post-turn 快照系统，在每轮 LLM 调用前后分别保存 Agent 完整运行状态（对话历史、记忆、任务进度、工具调用结果），支持从最近有效快照恢复执行，实现故障自动回退</li>
 <li>设计 Multi-Agent Team 模式下的资源隔离策略，每个 Worker 维护独立对话历史和工具集，通过并发上限控制（默认 2 个 Worker）防止多 Agent 内存叠加导致 OOM</li>
 <li>搭建结构化审计日志系统，记录每次工具调用的名称、参数、耗时、审批状态和执行结果，自动脱敏 API Key 和 Token 等敏感信息，支撑延迟排查和安全审计</li>
</ul>
<h2>ending</h2>
<p>以前面试聊的是八股文、并发、中间件。现在聊的是 KV Cache 怎么优化、Agent 的记忆怎么分层、上下文膨胀了怎么压缩。</p>
<p><strong>知识结构在变，但工程能力的内核没变——谁能把系统做稳、把问题想清楚、把方案落到代码里，谁就是稀缺的。</strong></p>
<p>加油吧，兄弟姐妹们。</p>
<p>下期见。</p>` }
    ]
  });
})();
