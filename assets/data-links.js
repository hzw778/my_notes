window.LINKS = {
  groups: [
    {
      name: "我的整理（本地笔记）",
      note: "你提供的 3 份本地 Markdown 笔记，已解析为「我的整理」Tab：326 题、23 章，含完整答案",
      items: [
        { key: "mine", icon: "📝", title: "派聪明知识点（技术派）", token: "", status: "mine", note: "42 题 · 文件上传 / RAG / 知识库 / 聊天助手 / 进阶", local: true },
        { key: "mine", icon: "📓", title: "派聪明RAG简历（含面经收集）", token: "", status: "mine", note: "145 题 · PaiSmart 项目 / trae面试 / 6 组面经", local: true },
        { key: "mine", icon: "📚", title: "面试题收集（企业面经）", token: "", status: "mine", note: "139 题 · 长亮 / Spring / 网易 / 用友等", local: true }
      ]
    },
    {
      name: "必备技术栈",
      note: "作者建议：至少选择一门语言；重点掌握 Java 集合、JVM、并发、线程池、IO（字节、腾讯、美团一面考的非常多）",
      items: [
        { key: "route", icon: "🧭", title: "Agent最小学习路线", token: "V7e2wn6Ibig6ATkWcLlcUrNfn5b", status: "full" },
        { key: "llm", icon: "🧠", title: "4小时速通大模型面试（更新ing）", token: "QmODwjiIjiqtpokZICWcrEpFnWe", status: "full" },
        { key: "redis", icon: "🟥", title: "2小时速通Redis", token: "ANhfwaejJilh7kklJpPcIk0inlU", status: "full" },
        { key: "mysql", icon: "🐬", title: "2小时速通MySQL", token: "IbtNwN7oPipPHLk9cMMcHqMnnFf", status: "full" },
        { key: "agent", icon: "🤖", title: "4小时速通Agent 面试", token: "MyrjwtWSNimJ5IkDUPkcGRLfnRa", status: "full" },
        { key: "concurrent", icon: "⚡", title: "2小时速通并发编程", token: "XmklwlrvAiQ7cXkwpXpcOuQen6f", status: "full" },
        { key: "mq", icon: "📨", title: "2小时速通消息队列", token: "GB6XwPLvEi0f41kVz7Ocl0GcnVh", status: "full" },
        { key: "rag", icon: "🔍", title: "4小时速通RAG（更新ing）", token: "CQxJwGWaTikOJEkGPb3cAfhinMh", status: "full" },
        { key: "net", icon: "🌐", title: "2小时速通计算机网络", token: "SwHXwDDnqi5kP5kVWYscY9NpnFh", status: "full" },
        { key: "java", icon: "☕", title: "2小时速通Java（更新ing）", token: "MWlXwd9F1i08xOkYrAhcDDdhn9c", status: "full" }
      ]
    },
    {
      name: "扩展技术栈",
      note: "按需获取，后续持续更新",
      items: [
        { key: "docker", icon: "🐳", title: "1小时速通Docker", token: "GiLdw43vzieskZkl6lJcTHu0nxh", status: "list" },
        { key: "claudecode", icon: "⌨️", title: "1小时速通ClaudeCode（更新ing）", token: "RLzNwXBhUibCq2kvr1lco5ndntg", status: "list" },
        { key: "es", icon: "🔎", title: "1小时速通ElasticSearch", token: "C8Y2wGDM0iIv0YkPmscc77KtnPw", status: "list" },
        { key: "rpc", icon: "🔗", title: "1小时速通RPC", token: "QWBKwnxh1i0VvakKAdWchzfhnNc", status: "list" },
        { key: "kafka", icon: "🟩", title: "1小时速通Kafka", token: "GqZsw3BN4iPehBkuZsdcHGPgnsg", status: "list" },
        { key: "pg", icon: "🐘", title: "1小时速通PostgreSQL", token: "SQ2Qwl80lizT1pkFjTBcGtkZnqv", status: "list" },
        { key: "langgraph", icon: "🕸️", title: "1小时速通LangGraph", token: "NfuOwtVo0iYnG3kdfvUcd8HdnGy", status: "list" },
        { key: "go", icon: "🐹", title: "2小时速通Go语言", token: "Bx2HwcEK3ij8rikyrRocW9XonRe", status: "list" },
        { key: "design", icon: "🏗️", title: "1小时速通设计模式", token: "IQVVwnIFNiIue3kfoDEczdCYnPf", status: "list" },
        { key: "distributed", icon: "🌍", title: "2小时速通分布式", token: "ThHRw6T1zixIVhk1npLcL2v0n9c", status: "list" },
        { key: "redisstream", icon: "📭", title: "1小时速通Redis Stream", token: "FBDbwmnr1iIbG5kTVi4cmSBhn7f", status: "list" }
      ]
    }
  ],
  url: function (token) { return "https://utxc8uqzfk.feishu.cn/wiki/" + token; }
};
