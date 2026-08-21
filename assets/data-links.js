window.LINKS = {
  groups: [
    {
      name: "我的整理（本地笔记）",
      note: "6 份本地 Markdown 笔记，已拆分为 6 个独立 Tab：556 题、44 章，含完整答案（点击卡片直达对应笔记）",
      items: [
        { key: "mine-paizi", icon: "📝", title: "派聪明知识点（技术派）", token: "", status: "mine", note: "42 题 · 文件上传 / RAG / 知识库 / 聊天助手 / 进阶", local: true },
        { key: "mine-rag", icon: "📓", title: "派聪明RAG简历（含面经收集）", token: "", status: "mine", note: "145 题 · PaiSmart 项目 / trae面试 / 6 组面经", local: true },
        { key: "mine-mianshi", icon: "📚", title: "面试题收集（企业面经）", token: "", status: "mine", note: "139 题 · 长亮 / Spring / 网易 / 用友等", local: true },
        { key: "mine-agent", icon: "🤖", title: "agent面经收集", token: "", status: "mine", note: "30 题 · 哔哩AI / 联影 / 影石 / 小厂面经", local: true },
        { key: "mine-qoder", icon: "🗂️", title: "派聪明QORDER_NOTE", token: "", status: "mine", note: "68 节 · RAG 项目 10 大模块 58 技术点 / 上传·解析·向量·Agent·安全·计费等", local: true },
        { key: "mine-jishu", icon: "🌊", title: "技术派", token: "", status: "mine", note: "132 题 · 腾讯/拼多多/腾讯面试官/携程/阿里/海康/长鑫 Agent 面试篇 · 含 117 张配图", local: true }
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
        { key: "redisstream", icon: "📭", title: "1小时速通Redis Stream", token: "FBDbwmnr1iYbG5kTVi4cmSBhn7f", status: "list" },
        { key: "linux", icon: "🐧", title: "1小时速通Linux", token: "HKalwjkOwiahK8kvyGJcJHh7nef", status: "list" },
        { key: "python", icon: "🐍", title: "2小时速通Python+FastAPI", token: "XNTRwx7TVim6uqk064Vcb67jnrX", status: "list" }
      ]
    },
    {
      name: "面渣逆袭",
      note: "PDF 原文，点击在新标签页直接阅读完整内容（含全部配图）",
      items: [
        { icon: "☕", title: "Java 基础篇", pdf: "面渣逆袭+进阶之路/面渣逆袭Java基础篇V2.1.pdf", size: "11.8 MB" },
        { icon: "📦", title: "集合框架篇", pdf: "面渣逆袭+进阶之路/面渣逆袭集合框架篇V2.1.pdf", size: "13.1 MB" },
        { icon: "⚙️", title: "JVM 篇", pdf: "面渣逆袭+进阶之路/面渣逆袭 JVM篇 V2.1.pdf", size: "16.0 MB" },
        { icon: "🧵", title: "并发编程篇", pdf: "面渣逆袭+进阶之路/面渣逆袭并发编程篇V2.1.pdf", size: "23.1 MB" },
        { icon: "🐬", title: "MySQL 篇", pdf: "面渣逆袭+进阶之路/面渣逆袭MySQL篇V2.2.pdf", size: "53.6 MB" },
        { icon: "🟥", title: "Redis 篇", pdf: "面渣逆袭+进阶之路/面渣逆袭Redis篇V2.0.pdf", size: "68.5 MB" },
        { icon: "🍃", title: "Spring 篇", pdf: "面渣逆袭+进阶之路/面渣逆袭Spring篇V2.0亮白版.pdf", size: "47.7 MB" },
        { icon: "🐘", title: "MyBatis", pdf: "面渣逆袭+进阶之路/面渣逆袭 MyBatis.pdf", size: "3.2 MB" },
        { icon: "🚀", title: "RocketMQ 篇", pdf: "面渣逆袭+进阶之路/面渣逆袭RocketMQ篇.pdf", size: "5.0 MB" },
        { icon: "🌍", title: "分布式篇", pdf: "面渣逆袭+进阶之路/面渣逆袭-分布式篇.pdf", size: "1.9 MB" },
        { icon: "🧩", title: "微服务篇", pdf: "面渣逆袭+进阶之路/面渣逆袭微服务篇.pdf", size: "3.1 MB" },
        { icon: "🖥️", title: "操作系统", pdf: "面渣逆袭+进阶之路/面渣逆袭操作系统.pdf", size: "3.3 MB" },
        { icon: "🌐", title: "计算机网络", pdf: "面渣逆袭+进阶之路/面渣逆袭计算机网络.pdf", size: "7.9 MB" },
        { icon: "📚", title: "Java 进阶之路", pdf: "面渣逆袭+进阶之路/二哥的 Java 进阶之路亮白版.pdf", size: "34.5 MB" }
      ]
    },
    {
      name: "公众号专辑",
      note: "微信公众号原文，含完整文字与配图，点击在新标签页阅读",
      items: [
        { icon: "🤖", title: "图解Agent", href: "https://mp.weixin.qq.com/mp/appmsgalbum?__biz=MzUxODAzNDg4NQ==&action=getalbum&album_id=4404340926102421504&scene=21#wechat_redirect", note: "约 22 篇 · Agent 图文教程" },
        { icon: "🗄️", title: "后端高频面试题", href: "https://mp.weixin.qq.com/mp/appmsgalbum?__biz=Mzg2OTA0Njk0OA==&action=getalbum&album_id=1352302538565189634&scene=126#wechat_redirect", note: "约 92 篇 · 后端八股汇编" },
        { icon: "🧠", title: "AI 核心技术与面试实战", href: "https://mp.weixin.qq.com/mp/appmsgalbum?__biz=Mzg2OTA0Njk0OA==&action=getalbum&album_id=4412413577266053125&scene=126#wechat_redirect", note: "约 24 篇 · JavaGuide 出品" },
        { icon: "🎯", title: "AI Agent 面试指南", href: "https://mp.weixin.qq.com/mp/appmsgalbum?__biz=Mzk3NTQ2MTI2Mg==&action=getalbum&album_id=4103863406245920778&scene=126#wechat_redirect", note: "约 16 篇 · Agent 面试硬核篇" }
      ]
    }
  ],
  url: function (token) { return "https://utxc8uqzfk.feishu.cn/wiki/" + token; }
};
