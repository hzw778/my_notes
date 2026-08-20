window.TAB_DATA = window.TAB_DATA || {};
(function () {
  var mine = window.TAB_DATA["mine"] || (window.TAB_DATA["mine"] = { key: "mine", title: "我的整理（本地笔记）", url: "", chapters: [] });
  mine.chapters.push({
    "no": "1",
    "title": "PaiSmart RAG 项目技术点深度学习笔记（技术点 1–7 · 8 节）",
    "questions": [
      { "t": "技术点 1：前端分片切片 + Worker Pool 并发模型", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么需要分片上传？</strong></p>
<p>如果直接上传一个 1GB 的文件到服务器，会有三个致命问题：</p>
<ol>
<li><strong>浏览器内存爆炸</strong>：需要把整个 1GB 读进内存构造一个 HTTP 请求体</li><li><strong>网络中断就白传</strong>：传到 99% 断了，必须从头开始</li><li><strong>服务器超时</strong>：HTTP 请求长时间没有响应，服务器/网关会主动断开</li></ol>
<p>解决方案就是<strong>分片上传</strong>：把大文件切成很多小片（比如每片 5MB），一片一片上传，全部上
传完后再让服务器合并。这样即使某一片失败了，只需要重传那一片。</p>
<p><strong>第一步：前端计算文件 MD5</strong></p>
<p>MD5 是一种哈希算法，能把任意大小的文件变成一个 32 位的"指纹"字符串。
<strong>同一个文件，无论文件名怎么改，只要内容不变，MD5 就相同。</strong></p>
<pre><code class="language-typescript">// 前端知识库 Store 中
const md5 = await calculateMD5(file);
// 比如得到 "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"</code></pre>
<p>这个 MD5 会贯穿整个上传流程，作为文件的唯一标识。后端用它来：
- 判断文件是否重复（幂等）
- 在 MinIO 中命名存储路径
- 关联数据库中的分片记录</p>
<p><strong>第二步：按 5MB 切片</strong></p>
<pre><code class="language-typescript">// constants/common.ts
export const chunkSize = 5 * 1024 * 1024;  // 5MB = 5242880 字节

// 计算总分片数
const totalChunks = Math.ceil(task.totalSize / chunkSize);

// 取出第 i 片
const chunkStart = chunkIndex * chunkSize;
const chunkEnd = Math.min(chunkStart + chunkSize, task.totalSize);
const chunk = task.file.slice(chunkStart, chunkEnd);</code></pre>
<p>逐行解释：
- <code>Math.ceil()</code> 是向上取整，比如 10MB 文件 / 5MB = 2 片，11MB 文件 / 5MB = 2.2 → 向上取整 = 3 片
- <code>Math.min()</code> 确保最后一片不会超出文件总大小
- <code>task.file.slice(start, end)</code> 是浏览器 File API，它不会真的把文件读进内存，而是创建一个指向文件某段区域的"视图"，非常轻量</p>
<p><strong>数据示例</strong>：一个 1GB（1,073,741,824 字节）的文件</p>
<pre><code class="language-text">totalChunks = Math.ceil(1073741824 / 5242880) = 205 片
第 0 片：slice(0, 5242880)           → 5MB
第 1 片：slice(5242880, 10485760)    → 5MB
...
第 204 片：slice(1069547520, 1073741824) → 约 4MB（最后一片较小）</code></pre>
<p><strong>第三步：Worker Pool 并发模型（核心）</strong></p>
<p>项目不是"一片一片串行上传"，而是<strong>4 个 Worker 同时上传</strong>，谁先完成谁就拿下一片。</p>
<pre><code class="language-typescript">const maxConcurrentChunksPerFile = 4;  // 每个文件最多 4 路并发

async function uploadChunksInParallel(task, chunkIndexes: number[]) {
    if (chunkIndexes.length === 0) return;

    let uploadError: Error | null = null;

    // workerCount = min(4, 剩余分片数)
    // 如果只剩 2 片没传，就只开 2 个 worker，不浪费
    const workerCount = Math.min(maxConcurrentChunksPerFile, chunkIndexes.length);

    // 每个 worker 是一个递归的 async 函数
    const runWorker = async (): Promise&lt;void&gt; =&gt; {
        if (uploadError) return;  // 如果有其他 worker 失败了，我不再取新任务

        const chunkIndex = chunkIndexes.shift();  // 从队列头部取一个分片
        if (chunkIndex === undefined) return;      // 队列空了，退出

        const success = await uploadChunk(task, chunkIndex);
        if (!success) {
            uploadError = new Error(\`分片 \${chunkIndex} 上传失败\`);
            return;  // 失败 → 记录错误，退出
        }

        await runWorker();  // 成功 → 递归调用自己，取下一个分片
    };

    // 创建 N 个 worker 并启动
    const workers = Array.from({ length: workerCount }, () =&gt; runWorker());

    // 等待所有 worker 完成
    await Promise.all(workers);

    if (uploadError) throw uploadError;
}</code></pre>
<p>逐行解释关键概念：</p>
<p><strong><code>chunkIndexes.shift()</code></strong>：JavaScript 数组的 shift() 方法会弹出并返回数组的第一个元素。
因为多个 worker 共享同一个数组，而 shift() 在 JS 中是同步操作（JS 是单线程事件循环），
所以不会出现两个 worker 同时取到同一个分片的情况。</p>
<p><strong>递归调用 <code>await runWorker()</code></strong>：每个 worker 不是一次性处理所有分片，而是"取一个 →
上传 → 完成 → 取下一个"。这就像工厂流水线上的工人：做完一个零件，从传送带上拿下一个。</p>
<p><strong><code>Promise.all(workers)</code></strong>：等待所有 worker 都结束（无论是正常结束还是因为错误退出）。</p>
<p><strong>时间线模拟</strong>（10 个分片，4 个 worker）：</p>
<pre><code class="language-text">t=0s  Worker1 取走分片0，Worker2 取走分片1，Worker3 取走分片2，Worker4 取走分片3
      剩余队列 = [4,5,6,7,8,9]

t=2s  Worker1 完成分片0，取走分片4    剩余 = [5,6,7,8,9]
t=3s  Worker3 完成分片2，取走分片5    剩余 = [6,7,8,9]
t=4s  Worker2 完成分片1，取走分片6    剩余 = [7,8,9]
t=5s  Worker4 完成分片3，取走分片7    剩余 = [8,9]
t=6s  Worker1 完成分片4，取走分片8    剩余 = [9]
t=7s  Worker3 完成分片5，取走分片9    剩余 = []
t=8s  Worker2 完成分片6，队列空，退出
t=9s  Worker4 完成分片7，空，退出
...
所有 worker 退出 → Promise.all resolve → 上传完成</code></pre>
<p>注意：<strong>不是"分 4 批，每批 4 个"</strong>，而是"谁空了谁拿下一个"，始终保持 4 路并发。</p>
<p><strong>第四步：单个分片的上传请求</strong></p>
<pre><code class="language-typescript">async function uploadChunk(task, chunkIndex: number): Promise&lt;boolean&gt; {
    const totalChunks = Math.ceil(task.totalSize / chunkSize);
    const chunkStart = chunkIndex * chunkSize;
    const chunkEnd = Math.min(chunkStart + chunkSize, task.totalSize);
    const chunk = task.file.slice(chunkStart, chunkEnd);

    const { error, data } = await request({
        url: '/upload/chunk',
        method: 'POST',
        data: {
            file: chunk,           // 分片的二进制数据
            fileMd5: task.fileMd5, // 整个文件的 MD5
            chunkIndex,            // 这是第几片（从 0 开始）
            totalSize: task.totalSize, // 整个文件的总大小
            fileName: task.fileName,
            orgTag: task.orgTag,
            isPublic: task.isPublic ?? false
        },
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 10 * 60 * 1000  // 单个分片超时 10 分钟
    });

    if (error) return false;

    // 更新进度：合并已上传的分片列表
    updatedTask.uploadedChunks = mergeUploadedChunks(
        updatedTask.uploadedChunks, data.uploaded
    );
    updatedTask.progress = (uploadedChunks.length / totalChunks) * 100;
    return true;
}</code></pre>
<p><strong>第五步：文件级并发控制</strong></p>
<p>上面讲的是单个文件内部的 4 路分片并发。项目还有一个外层的文件级控制：</p>
<pre><code class="language-typescript">// 最多同时上传 3 个文件
if (activeUploads.value.size &gt;= 3) return;</code></pre>
<p>如果用户拖入 5 个文件，第 4、5 个会排队等待。当某个文件上传完成后，<code>finally</code> 块中会
自动调用 <code>startUpload()</code> 触发下一个文件。</p>
<pre><code class="language-typescript">finally {
    activeUploads.value.delete(task.fileMd5);  // 从活跃集合移除
    startUpload();  // 尝试启动下一个排队中的文件
}</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>前端把大文件按 5MB 切成 N 片，用 Worker Pool 模型开 4 个并发 Worker 同时上传，
每个 Worker 完成一个分片后自动从队列取下一个，始终保持 4 路并发，直到所有分片上传完毕。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么选 5MB 作为分片大小？太大或太小有什么问题？</strong></p>
<p>A：5MB 是一个平衡点。太大（比如 100MB）→ 单片上传时间长，失败重传代价大，且占用
更多内存。太小（比如 10KB）→ 1GB 文件要切 10 万片，HTTP 请求开销（建连、Header、
ACK）远大于数据本身，且服务器压力剧增。</p>
<p><strong>Q2：Worker Pool 和"分 4 批上传"有什么区别？</strong></p>
<p>A：分 4 批是"第一批 4 个全部完成 → 才开始第二批"，如果其中 1 个特别慢，其他 3 个
都在等。Worker Pool 是"谁完成了谁拿下一个"，始终保持 4 路并发，不会因为某一片慢而
卡住其他 Worker。</p>
<p><strong>Q3：如果某个 Worker 上传失败了会怎样？</strong></p>
<p>A：该 Worker 设置 <code>uploadError</code>，其他 Worker 完成当前分片后检查到这个错误就不再
取新任务。<code>Promise.all</code> 结束后抛出错误，上层把任务状态改为 Break（中断）。用户点
重试时，只上传还没完成的分片（断点续传）。</p>
<p><strong>扩展方案</strong></p>
<ul>
<li><strong>Web Worker 计算 MD5</strong>：当前 MD5 计算在主线程，大文件会卡顿 UI。可以用 Web Worker</li><ul><li>在后台线程计算，不阻塞界面。</li></ul><li><strong>动态分片大小</strong>：根据网络状况动态调整 chunkSize，网速快用大片，网速慢用小片。</li><ul><li>这就是 tus 协议（tus.io）的做法。</li></ul>
<hr>` },
      { "t": "技术点 2：Redis Bitmap 存储分片上传状态", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：什么是 Redis Bitmap？</strong></p>
<p>Bitmap（位图）不是一个独立的数据类型，而是 Redis String 类型的一种"用法"。</p>
<p>Redis 的 String 本质上是一个<strong>字节数组</strong>（byte array）。比如一个 String 值为 "hello"，
在内存中就是 5 个字节：<code>[0x68, 0x65, 0x6C, 0x6C, 0x6F]</code>。</p>
<p>Bitmap 就是把这些字节当作一个<strong>位数组</strong>来用：
- 第 0 位 = 第 0 个字节的最高位（bit 7）
- 第 1 位 = 第 0 个字节的第 6 位（bit 6）
- ...
- 第 7 位 = 第 0 个字节的最低位（bit 0）
- 第 8 位 = 第 1 个字节的最高位</p>
<p>核心命令：
- <code>SETBIT key offset value</code> → 把第 offset 位设为 0 或 1
- <code>GETBIT key offset</code> → 查询第 offset 位是 0 还是 1
- <code>GET key</code> → 获取整个字节数组（可以一次拿到所有位的状态）</p>
<p><strong>核心代码：标记分片已上传</strong></p>
<pre><code class="language-java">// UploadService.java

// 标记某个分片为"已上传"
public void markChunkUploaded(String fileMd5, int chunkIndex, String userId) {
    String redisKey = "upload:" + userId + ":" + fileMd5;
    // redisKey 举例："upload:user123:a1b2c3d4e5f6..."

    redisTemplate.opsForValue().setBit(redisKey, chunkIndex, true);
    // Redis 命令：SETBIT upload:user123:a1b2c3... 5 1
    // 意思是：把第 5 位设为 1（表示分片 5 已上传）
}</code></pre>
<p><strong>核心代码：查询某个分片是否已上传</strong></p>
<pre><code class="language-java">// 检查某个分片是否已上传
public boolean isChunkUploaded(String fileMd5, int chunkIndex, String userId) {
    String redisKey = "upload:" + userId + ":" + fileMd5;

    boolean isUploaded = redisTemplate.opsForValue().getBit(redisKey, chunkIndex);
    // Redis 命令：GETBIT upload:user123:a1b2c3... 5
    // 返回 true（已上传）或 false（未上传）

    return isUploaded;
}</code></pre>
<p><strong>核心代码：获取所有已上传的分片列表</strong></p>
<pre><code class="language-java">// 一次性获取所有已上传的分片
public List&lt;Integer&gt; getUploadedChunks(String fileMd5, String userId) {
    String redisKey = "upload:" + userId + ":" + fileMd5;

    // 一次 GET 命令拿到整个 bitmap 的字节数组
    byte[] bitmapData = redisTemplate.execute((RedisCallback&lt;byte[]&gt;) connection -&gt; {
        return connection.get(redisKey.getBytes());
    });

    // 如果 Redis 里没有数据（比如 Redis 重启了），从数据库回源
    if (bitmapData == null) {
        List&lt;Integer&gt; dbChunks = getUploadedChunksFromDatabase(fileMd5);
        // 回填 Redis
        backfillUploadedChunks(fileMd5, dbChunks, userId);
        return dbChunks;
    }

    // 解析 bitmap 字节数组，找出哪些位是 1
    List&lt;Integer&gt; uploadedChunks = new ArrayList&lt;&gt;();
    int totalChunks = getTotalChunks(fileMd5, userId);
    for (int chunkIndex = 0; chunkIndex &lt; totalChunks; chunkIndex++) {
        if (isBitSet(bitmapData, chunkIndex)) {
            uploadedChunks.add(chunkIndex);
        }
    }
    return uploadedChunks;
}</code></pre>
<p><strong>Bitmap 位解析代码（面试高频细节）</strong></p>
<pre><code class="language-java">private boolean isBitSet(byte[] bitmapData, int bitIndex) {
    int byteIndex = bitIndex / 8;
    // 比如 bitIndex=5 → byteIndex=0（在第 0 个字节里）
    // 比如 bitIndex=13 → byteIndex=1（在第 1 个字节里）

    int bitPosition = 7 - (bitIndex % 8);
    // Redis 的位顺序是从高位到低位（MSB first）
    // bitIndex=0 → bitPosition=7（第 0 字节的最高位）
    // bitIndex=5 → bitPosition=2（第 0 字节的第 2 位）

    if (byteIndex &gt;= bitmapData.length) {
        return false;  // 超出范围，默认为 0（未上传）
    }

    // 位运算：检查指定位是否为 1
    return (bitmapData[byteIndex] &amp; (1 &lt;&lt; bitPosition)) != 0;
    // 比如 bitmapData[0] = 0b10100100
    // 检查 bitIndex=2 → bitPosition=5 → (1&lt;&lt;5) = 0b00100000
    // 0b10100100 &amp; 0b00100000 = 0b00100000 ≠ 0 → 返回 true
}</code></pre>
<p><strong>Bitmap 内存占用计算</strong></p>
<p><strong>1 个分片 = 1 bit = 1/8 字节</strong></p>
<p>以 1GB 文件为例：</p>
<pre><code class="language-text">总分片数 = 205 片
Bitmap 大小 = ceil(205 / 8) = 26 字节</code></pre>
<p>就算文件有 10000 片（50GB 文件），Bitmap 也只占：</p>
<pre><code class="language-text">10000 bits = 1250 字节 ≈ 1.2 KB</code></pre>
<p>对比如果用 Redis Hash 存储（每个分片一个 field-value 对）：</p>
<pre><code class="language-text">HSET upload:user123:a1b2c3 chunk_0 "uploaded"
HSET upload:user123:a1b2c3 chunk_1 "uploaded"
...
// 205 个 field，每个 field 带结构开销（key + field + value 的编码）
// 大约需要 205 × 50 字节 ≈ 10KB</code></pre>
<p>Bitmap 节省了将近 10 倍的内存。</p>
<p><strong>Redis Bitmap vs 数据库：双保险设计</strong></p>
<p>项目不是只用 Redis，而是 <strong>Redis Bitmap 作为快路径，MySQL ChunkInfo 表作为事实来源</strong>：</p>
<pre><code class="language-text">上传分片时：
  1. 先查 Redis Bitmap → GETBIT（微秒级，极快）
  2. Redis 没命中 → 查 MySQL ChunkInfo 表（毫秒级）
  3. MySQL 也没有 → 真正上传到 MinIO → 写 MySQL → 写 Redis

查询进度时：
  1. 一次 GET 拿到 Bitmap 字节数组 → 解析出已上传列表
  2. Bitmap 为空 → 从 MySQL 查询 → 回填 Redis（backfill）</code></pre>
<p>这个设计的好处：Redis 是内存数据库，速度极快但不保证持久化（可能因为重启丢数据）。
MySQL 是持久化的，作为最终的事实来源。Redis 丢了数据可以从 MySQL 自动恢复。</p>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>用 Redis Bitmap 的 SETBIT/GETBIT 命令标记每个分片的上传状态，每个分片只占 1 bit
内存（205 片只需 26 字节），同时以 MySQL ChunkInfo 表作为事实来源，Redis 丢失后
可自动从数据库回填。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：Redis Bitmap 的位顺序是怎样的？</strong></p>
<p>A：Redis 的 Bitmap 位顺序是 MSB first（最高位优先）。第 0 位存储在第 0 个字节的
最高位（bit 7），第 7 位存储在第 0 个字节的最低位（bit 0），第 8 位存储在第 1 个
字节的最高位。这和大多数编程语言中"第 0 位是最低位"的惯例相反，面试中容易踩坑。</p>
<p><strong>Q2：为什么不只用 Redis，还要存 MySQL？</strong></p>
<p>A：Redis 是内存数据库，虽然有 RDB/AOF 持久化机制，但在极端情况下（如服务器宕机、
内存淘汰）可能丢数据。分片上传状态关系到文件能否正确合并，是"不能丢"的数据。所以
MySQL 作为持久化的事实来源，Redis 只作为快速查询的缓存层。</p>
<p><strong>Q3：如果 Redis 宕机了，上传还能继续吗？</strong></p>
<p>A：可以。Redis 查询失败时，<code>isChunkUploaded()</code> 会返回 false（代码中 catch 异常后
返回 false），然后系统会去查 MySQL ChunkInfo 表。如果 MySQL 有记录，会回填 Redis
后按幂等成功处理。整个过程对用户透明。</p>
<p><strong>扩展方案</strong></p>
<ul>
<li><strong>Redis BITCOUNT 命令</strong>：可以用 <code>BITCOUNT key</code> 直接获取已上传的分片总数，不需要</li><ul><li>GET 整个字节数组再手动解析，更高效。</li></ul><li><strong>Redis BITFIELD 命令</strong>：可以一次读取/写入多个位，适合批量操作场景。</li></ul>
<hr>` },
      { "t": "技术点 3：MinIO 分布式对象存储", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：什么是对象存储？和数据库存文件有什么区别？</strong></p>
<p>传统方式存文件：把文件放在服务器的硬盘目录里（比如 <code>/data/uploads/xxx.pdf</code>）。
问题：
- 单台服务器硬盘有限，文件多了放不下
- 服务器挂了文件就丢了
- 不方便做读写权限控制</p>
<p>对象存储（如 MinIO、AWS S3、阿里云 OSS）：
- 文件以"对象"形式存在"桶"（Bucket）里
- 通过 HTTP API 访问（PUT 上传、GET 下载）
- 天然支持分布式，可水平扩展
- 支持预签名 URL（临时授权下载链接）</p>
<p>MinIO 是一个开源的对象存储服务器，兼容 AWS S3 的 API。</p>
<p><strong>核心代码：上传分片到 MinIO</strong></p>
<pre><code class="language-java">// UploadService.java - uploadChunk() 方法中

String storagePath = "chunks/" + fileMd5 + "/" + chunkIndex;
// 路径举例：chunks/a1b2c3d4e5f6.../0  → 第 0 片
//          chunks/a1b2c3d4e5f6.../1  → 第 1 片

PutObjectArgs putObjectArgs = PutObjectArgs.builder()
    .bucket("uploads")           // 桶名叫 "uploads"
    .object(storagePath)         // 对象路径
    .stream(file.getInputStream(), file.getSize(), -1)  // 文件流
    .contentType(file.getContentType())  // MIME 类型
    .build();

minioClient.putObject(putObjectArgs);
// 把分片数据写入 MinIO</code></pre>
<p>上传后 MinIO 中的存储结构：</p>
<pre><code class="language-text">uploads/（桶）
├── chunks/
│   └── a1b2c3d4e5f6.../（以文件 MD5 命名的目录）
│       ├── 0   （分片 0，5MB）
│       ├── 1   （分片 1，5MB）
│       ├── 2   （分片 2，5MB）
│       └── ...
│       └── 204 （分片 204，约 4MB）</code></pre>
<p><strong>核心代码：合并所有分片</strong></p>
<pre><code class="language-java">// UploadService.java - mergeChunks() 方法中

// 1. 从数据库查出所有分片，按 chunkIndex 排序
List&lt;ChunkInfo&gt; chunks = chunkInfoRepository.findByFileMd5OrderByChunkIndexAsc(fileMd5);

// 2. 验证分片数量
int expectedChunks = getTotalChunks(fileMd5, userId);
if (chunks.size() != expectedChunks) {
    throw new RuntimeException("分片数量不匹配");
}

// 3. 逐个验证每个分片在 MinIO 中是否真实存在
for (int i = 0; i &lt; partPaths.size(); i++) {
    StatObjectResponse stat = minioClient.statObject(
        StatObjectArgs.builder()
            .bucket("uploads")
            .object(partPaths.get(i))
            .build()
    );
    // stat.size() 返回分片大小，可以验证完整性
}

// 4. 调用 MinIO composeObject 合并
// 这是 MinIO 的服务端操作，不需要把分片下载到后端内存
List&lt;ComposeSource&gt; sources = partPaths.stream()
    .map(path -&gt; ComposeSource.builder()
        .bucket("uploads")
        .object(path)
        .build())
    .collect(Collectors.toList());

minioClient.composeObject(
    ComposeObjectArgs.builder()
        .bucket("uploads")
        .object("merged/" + fileMd5)  // 合并后的文件路径
        .sources(sources)              // 分片列表（按顺序）
        .build()
);
// MinIO 在服务端把 205 个分片拼接成一个完整文件
// 合并后路径：uploads/merged/a1b2c3d4e5f6...</code></pre>
<p><strong>composeObject 的关键优势</strong>：整个合并过程在 MinIO 服务端完成，后端服务器不需要
下载分片数据到内存中，避免了 1GB 文件占满 JVM 堆内存的风险。</p>
<p><strong>核心代码：合并后清理 + 生成下载链接</strong></p>
<pre><code class="language-java">// 5. 删除临时分片文件
for (String path : partPaths) {
    try {
        minioClient.removeObject(
            RemoveObjectArgs.builder()
                .bucket("uploads")
                .object(path)
                .build()
        );
    } catch (Exception e) {
        // 删除失败不影响主流程，只记录警告日志
        logger.warn("删除分片文件失败，将继续处理");
    }
}

// 6. 生成预签名 URL（1 小时有效期）
String presignedUrl = minioClient.getPresignedObjectUrl(
    GetPresignedObjectUrlArgs.builder()
        .method(Method.GET)
        .bucket("uploads")
        .object("merged/" + fileMd5)
        .expiry(1, TimeUnit.HOURS)  // 链接 1 小时后失效
        .build()
);
// 返回类似：http://minio:9000/uploads/merged/a1b2c3...?X-Amz-Signature=xxx&amp;X-Amz-Expires=3600</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>分片数据通过 MinIO putObject 存储到 <code>chunks/{fileMd5}/{index}</code> 路径，全部上传完后
通过 composeObject 在 MinIO 服务端完成合并（不占后端内存），合并后生成预签名 URL
供后续下载，并清理临时分片文件。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：composeObject 和"后端下载所有分片再拼接上传"有什么区别？</strong></p>
<p>A：composeObject 是 MinIO 服务端操作，分片数据不经过后端服务器，节省带宽和内存。
如果在后端拼接，1GB 文件意味着后端要下载 1GB 数据、在内存或临时文件中拼接、再上传
1GB 回 MinIO，总共 3GB 的网络 I/O 和巨大的内存消耗。</p>
<p><strong>Q2：预签名 URL 是什么？为什么不直接给文件的永久访问地址？</strong></p>
<p>A：预签名 URL 是一个带签名的临时链接，签名中包含了过期时间和访问权限信息。过期后
链接自动失效，无法下载。这样可以在不暴露 MinIO 认证信息的情况下，安全地授权临时下载。</p>
<p><strong>Q3：如果分片删除失败了怎么办？</strong></p>
<p>A：代码中分片删除在 try-catch 里，失败只记录 warn 日志，不中断主流程。因为合并已经
成功，分片是否删除不影响文件的正确性。残留的分片可以通过后台定时清理任务处理。</p>
<p><strong>扩展方案</strong></p>
<ul>
<li><strong>MinIO Multipart Upload API</strong>：MinIO 原生支持分片上传（类似 AWS S3 Multipart Upload），</li><ul><li>有 uploadId 管理、断点续传等能力。本项目没有用这个 API，而是自己实现了分片管理逻辑。</li></ul><li><strong>CDN 加速</strong>：生产环境中可以在 MinIO 前面加一层 CDN（如 CloudFlare），缓存热门文件</li><ul><li>的预签名 URL，减少源站压力。</li></ul>
<hr>` },
      { "t": "技术点 4：CAS 状态机保证合并原子性", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：什么是 CAS？</strong></p>
<p>CAS（Compare-And-Swap）是一种并发编程中的原子操作思想：
"只有当前值等于预期值时，才把当前值修改为新值"。</p>
<p>举个例子：银行账户余额 100 元，两个线程同时想扣 50 元。
- 没有 CAS：两个线程都读到 100，都扣成 50，最终余额 50（扣了两次）
- 有 CAS：第一个线程 CAS(100→50) 成功，第二个线程 CAS(100→50) 失败（当前值已经是
  50 了，不等于预期的 100），只能重新读取再操作</p>
<p><strong>本项目的状态机设计</strong></p>
<p>FileUpload 实体有 3 个状态：</p>
<pre><code class="language-text">STATUS_UPLOADING = 0   // 上传中（正在接收分片）
STATUS_MERGING = 2     // 合并中（正在拼接分片）
STATUS_COMPLETED = 1   // 已完成（合并成功）</code></pre>
<p>状态转换规则：</p>
<pre><code class="language-text">UPLOADING(0) ──合并请求──→ MERGING(2) ──合并成功──→ COMPLETED(1)
                              │
                              │ 合并失败
                              ▼
                          UPLOADING(0)（回滚，用户可以重试）</code></pre>
<p><strong>核心代码：CAS 状态切换</strong></p>
<pre><code class="language-java">// UploadController.java - mergeFile() 方法中

// 第一步：检查文件完整性
List&lt;Integer&gt; uploadedChunks = uploadService.getUploadedChunks(fileMd5, userId);
int totalChunks = uploadService.getTotalChunks(fileMd5, userId);
if (uploadedChunks.size() &lt; totalChunks) {
    return "文件分片未全部上传，无法合并";  // 400
}

// 第二步：CAS 状态切换
// 只有当前状态是 UPLOADING(0) 才能切换为 MERGING(2)
int updatedRows = fileUploadRepository.updateStatusIfCurrent(
    fileUpload.getId(),
    FileUpload.STATUS_UPLOADING,   // expected current = 0
    FileUpload.STATUS_MERGING      // new status = 2
);

// updatedRows == 0 说明状态已经不是 UPLOADING 了
if (updatedRows == 0) {
    FileUpload latest = fileUploadRepository.findFirst...;

    if (latest.getStatus() == STATUS_COMPLETED) {
        // 已经被其他请求合并完成了 → 幂等返回成功
        return buildAlreadyMergedResponse(fileMd5);
    }
    if (latest.getStatus() == STATUS_MERGING) {
        // 正在被其他请求合并 → 返回 409 Conflict
        throw new CustomException("文件正在合并中，请稍后重试", HttpStatus.CONFLICT);
    }
    throw new CustomException("文件状态已变化，请刷新后重试", HttpStatus.CONFLICT);
}

// 第三步：CAS 成功，执行合并
try {
    objectUrl = uploadService.mergeChunks(fileMd5, fileName, userId);
} catch (Exception mergeException) {
    // 合并失败：回滚状态从 MERGING(2) → UPLOADING(0)
    fileUploadRepository.updateStatusIfCurrent(
        fileUpload.getId(),
        FileUpload.STATUS_MERGING,    // 期望当前是合并中
        FileUpload.STATUS_UPLOADING   // 回滚为上传中
    );
    throw mergeException;
}</code></pre>
<p><strong>对应的 SQL（Repository 中的 @Query）</strong></p>
<pre><code class="language-java">// FileUploadRepository.java

@Transactional
@Modifying(flushAutomatically = true, clearAutomatically = true)
@Query("UPDATE FileUpload f SET f.status = :newStatus WHERE f.id = :id AND f.status = :currentStatus")
int updateStatusIfCurrent(@Param("id") Long id,
                          @Param("currentStatus") int currentStatus,
                          @Param("newStatus") int newStatus);</code></pre>
<p>对应的原生 SQL：</p>
<pre><code class="language-sql">UPDATE file_upload SET status = 2 WHERE id = 42 AND status = 0;
-- 如果 status 已经是 2 或 1，affected rows = 0，CAS 失败
-- 如果 status 确实是 0，affected rows = 1，CAS 成功</code></pre>
<p><code>@Modifying(flushAutomatically = true, clearAutomatically = true)</code> 解释：
- <code>flushAutomatically = true</code>：执行前先刷新生效 JPA 一级缓存中的待持久化变更
- <code>clearAutomatically = true</code>：执行后清除一级缓存，避免后续读到旧数据</p>
<p><strong>并发场景分析</strong></p>
<p>假设用户连续点了两次"合并"按钮：</p>
<pre><code class="language-text">请求A：updateStatusIfCurrent(id, 0, 2) → updatedRows = 1 → CAS 成功 → 开始合并
请求B：updateStatusIfCurrent(id, 0, 2) → updatedRows = 0 → CAS 失败
        → 重新查询，发现 status=2（正在合并中）→ 返回 409 Conflict

请求A 合并成功：updateStatusIfCurrent(id, 2, 1) → COMPLETED</code></pre>
<p>如果用户点"合并"时正好后台也在合并：</p>
<pre><code class="language-text">后台：updateStatusIfCurrent(id, 0, 2) → 成功 → 开始合并
用户：updateStatusIfCurrent(id, 0, 2) → 失败 → 查到 status=2 → 返回 409
后台：合并完成 → status=1（COMPLETED）
用户重试：updateStatusIfCurrent(id, 1, ...) → 查到 status=1 → 幂等返回已合并结果</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>通过数据库 CAS（UPDATE ... WHERE status = 当前值）实现状态机的原子切换，只有状态
为 UPLOADING 才能进入 MERGING，防止并发合并；合并失败时回滚到 UPLOADING 允许重试，
已完成时幂等返回成功结果。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么用数据库 CAS 而不是分布式锁（如 Redis SETNX）？</strong></p>
<p>A：文件上传状态本身就存在 MySQL 中，用数据库 CAS 是最简单直接的方案，不需要引入
额外的分布式锁组件。而且这个场景的并发量不高（同一个文件同时合并的概率很低），数据库
CAS 完全够用。分布式锁更适合高并发、热点资源的场景。</p>
<p><strong>Q2：合并失败了为什么要把状态回滚到 UPLOADING？</strong></p>
<p>A：因为合并失败可能是临时性错误（如 MinIO 短暂不可用），回滚到 UPLOADING 后用户可以
直接重试合并，不需要重新上传分片。如果不回滚，状态会一直卡在 MERGING，用户既不能
上传新分片也不能重试合并，只能找管理员手动处理。</p>
<p><strong>Q3：如果回滚操作本身也失败了怎么办？</strong></p>
<p>A：这是一个极端边界情况。可以用定时任务扫描 status=MERGING 且超过一定时间未完成的
记录，强制回滚为 UPLOADING。本项目目前没有这个定时任务，但可以作为改进方向。</p>
<p><strong>扩展方案</strong></p>
<ul>
<li><strong>乐观锁版本号</strong>：除了用 status 做 CAS 条件，还可以加一个 version 字段，每次更新</li><ul><li>version+1，更通用的乐观锁模式。</li></ul><li><strong>状态机框架</strong>：Spring StateMachine 等框架可以更规范地管理状态转换，但对这个场景</li><ul><li>来说过于重量级。</li></ul>
<hr>` },
      { "t": "技术点 5：Kafka 事务消息 + 重试 + 死信队列", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：Kafka 是什么？</strong></p>
<p>Kafka 是一个<strong>分布式消息队列</strong>。你可以把它理解为一个"消息中转站"：</p>
<pre><code class="language-text">生产者（Producer） → [Kafka Topic] → 消费者（Consumer）

比喻：
  你（生产者） → [快递柜] → 快递员（消费者）
  你把包裹放进快递柜，不需要等快递员来取，就可以走了。
  快递员有空了再去快递柜取包裹。</code></pre>
<p>为什么要用消息队列？核心原因：<strong>解耦 + 异步</strong></p>
<p>在本项目中，文件合并成功后需要做两件耗时的事情：
1. 解析文档（提取文本、分块）→ 可能几秒到几分钟
2. 向量化（调 Embedding API、写入 ES）→ 可能几分钟</p>
<p>如果在 HTTP 请求里同步做这些事，用户点"合并"后可能要等好几分钟才能收到响应。</p>
<p>用 Kafka 之后：</p>
<pre><code class="language-text">合并成功 → 发一条消息到 Kafka → 立刻返回 HTTP 响应给用户
                ↓
        Consumer 在后台异步处理解析和向量化</code></pre>
<p><strong>前置知识：Kafka 事务消息</strong></p>
<p>普通消息发送：消息发到 Kafka 后，如果后续业务逻辑失败（如数据库更新失败），消息已经
发出去了，无法撤回。导致 Kafka 有消息但数据库没有记录，数据不一致。</p>
<p>事务消息：把"发消息"和"数据库操作"包在一个事务里，要么都成功，要么都失败。</p>
<pre><code class="language-text">开启事务 → 发消息 → 数据库操作 → 提交事务（消息真正可见）
                              → 回滚事务（消息被丢弃）</code></pre>
<p><strong>核心代码：Kafka 配置（事务 + 幂等生产者）</strong></p>
<pre><code class="language-java">// KafkaConfig.java

@Bean
public ProducerFactory&lt;String, Object&gt; producerFactory() {
    Map&lt;String, Object&gt; config = new HashMap&lt;&gt;();
    config.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
    config.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
    config.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);

    // 可靠投递三件套
    config.put(ProducerConfig.ACKS_CONFIG, "all");
    // acks=all：消息必须被所有 ISR（In-Sync Replicas）副本落盘才返回确认
    // 对比 acks=0（发出去就算成功）和 acks=1（只要 leader 落盘就算成功）

    config.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
    // 幂等生产者：即使网络重试，同一条消息也不会被 Kafka 重复存储
    // 原理：Kafka 给每个 Producer 分配一个 PID（Producer ID），
    // 每条消息带一个序列号，Broker 根据 PID+序列号 去重

    config.put(ProducerConfig.RETRIES_CONFIG, 3);
    // 自动重试 3 次（配合幂等，重试不会导致重复）

    DefaultKafkaProducerFactory&lt;String, Object&gt; factory =
        new DefaultKafkaProducerFactory&lt;&gt;(config);

    // 设置事务前缀 → 启用事务能力
    factory.setTransactionIdPrefix("file-upload-tx-");
    // 每个 Producer 实例会生成唯一的事务 ID：file-upload-tx-0, file-upload-tx-1, ...

    return factory;
}</code></pre>
<p><strong>核心代码：合并成功后发送 Kafka 事务消息</strong></p>
<pre><code class="language-java">// UploadController.java - mergeFile() 方法中

// 1. 构建任务消息
FileProcessingTask task = new FileProcessingTask(
    request.fileMd5(),     // 文件 MD5
    objectUrl,             // MinIO 预签名 URL
    request.fileName(),    // 文件名
    fileUpload.getUserId(),
    fileUpload.getOrgTag(),
    fileUpload.isPublic(),
    FileProcessingTask.TASK_TYPE_UPLOAD_PROCESS,
    userId
);

// 2. 更新向量化状态为"处理中"
fileUpload.setVectorizationStatus(FileUpload.VECTORIZATION_STATUS_PROCESSING);
fileUploadRepository.save(fileUpload);

// 3. 在事务中发送消息
kafkaTemplate.executeInTransaction(kt -&gt; {
    kt.send(kafkaConfig.getFileProcessingTopic(), task);
    return true;
});
// executeInTransaction 保证：
// - 如果 kt.send() 成功 → 事务提交 → 消费者能看到这条消息
// - 如果 kt.send() 失败 → 事务回滚 → 消息不会出现在 Topic 中</code></pre>
<p><strong>核心代码：Consumer 消费 + 重试 + 死信队列</strong></p>
<pre><code class="language-java">// KafkaConfig.java - 消费者端的错误处理

@Bean
public ConcurrentKafkaListenerContainerFactory&lt;String, Object&gt; kafkaListenerContainerFactory(
        ConsumerFactory&lt;String, Object&gt; consumerFactory,
        KafkaTemplate&lt;String, Object&gt; kafkaTemplate) {

    // 当所有重试都失败后，消息发到死信队列（DLT）
    DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(
        kafkaTemplate,
        (record, ex) -&gt; new TopicPartition(
            fileProcessingDltTopic,  // 死信队列 Topic 名
            record.partition()       // 保持和原消息相同的分区
        )
    );

    // 固定退避策略：每 3 秒重试一次，最多重试 4 次（加首次共 5 次尝试）
    DefaultErrorHandler errorHandler = new DefaultErrorHandler(
        recoverer,
        new FixedBackOff(3000L, 4)  // 间隔 3000ms，最多 4 次重试
    );

    ConcurrentKafkaListenerContainerFactory&lt;String, Object&gt; factory =
        new ConcurrentKafkaListenerContainerFactory&lt;&gt;();
    factory.setConsumerFactory(consumerFactory);
    factory.setCommonErrorHandler(errorHandler);
    return factory;
}</code></pre>
<p><strong>Consumer 处理逻辑</strong></p>
<pre><code class="language-java">// FileProcessingConsumer.java

@KafkaListener(
    topics = "#{kafkaConfig.getFileProcessingTopic()}",
    groupId = "#{kafkaConfig.getFileProcessingGroupId()}"
)
public void processTask(FileProcessingTask task) {
    // 1. 标记向量化状态为"处理中"
    documentService.markVectorizationProcessing(task.getFileMd5(), false);

    // 2. 从 MinIO 下载文件
    InputStream fileStream = downloadFileFromStorage(task.getFilePath());

    // 3. 解析文档（提取文本、分块、存 MySQL）
    parseService.parseAndSave(task.getFileMd5(), fileStream,
        task.getUserId(), task.getOrgTag(), task.isPublic());

    // 4. 向量化（调 Embedding API、写入 ES）
    VectorizationUsageResult result = vectorizationService.vectorizeWithUsage(
        task.getFileMd5(), task.getUserId(),
        task.getOrgTag(), task.isPublic(), task.getUserId()
    );

    // 5. 标记向量化完成
    documentService.markVectorizationCompleted(task.getFileMd5(), result);

    // 如果任何步骤抛异常 → Kafka DefaultErrorHandler 接管：
    //   第 1 次重试（3秒后）→ 第 2 次重试（6秒后）→ ... → 第 4 次重试
    //   → 还是失败 → 消息发到 file-processing-dlt 死信队列
    //   → 同时 markVectorizationFailed() 标记失败
}</code></pre>
<p><strong>完整流程图</strong></p>
<pre><code class="language-text">合并成功
  │
  ▼
Kafka 事务发送 FileProcessingTask
  │
  ▼（消费者拉取消息）
  │
  ├─ 成功：解析 → 向量化 → COMPLETED
  │
  └─ 失败：
      ├─ 第1次重试（+3秒）
      ├─ 第2次重试（+6秒）
      ├─ 第3次重试（+9秒）
      ├─ 第4次重试（+12秒）
      └─ 还是失败 → 发到 file-processing-dlt（死信队列）
                    + markVectorizationFailed()
                    + 管理员可手动查看死信队列并重试</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>文件合并后通过 Kafka 事务消息发送处理任务，保证消息发送和数据库状态的一致性；
Consumer 处理失败时自动重试 4 次（间隔 3 秒），全部失败后消息进入死信队列，
由管理员人工介入处理。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么要用事务消息？不用会怎样？</strong></p>
<p>A：如果不用事务，可能出现"消息已发到 Kafka，但 fileUpload 的向量化状态更新失败了"
的情况。Consumer 拿到消息开始处理，但数据库中文件状态不对，导致后续逻辑出错。事务
消息保证"发消息 + 更新数据库"要么都成功要么都失败。</p>
<p><strong>Q2：死信队列里的消息怎么处理？</strong></p>
<p>A：可以建一个管理后台页面展示死信队列中的失败任务，管理员查看错误原因后可以手动
触发重新消费（重新发一条相同内容的消息到正常 Topic）。Kafka 本身不提供死信消息
自动重试的功能，需要应用层自己实现。</p>
<p><strong>Q3：Kafka 的幂等生产者和事务有什么区别？</strong></p>
<p>A：幂等生产者解决的是"同一条消息因为网络重试被 Kafka 存了两份"的问题（Producer 端
去重）。事务解决的是"发消息和数据库操作要一起成功或一起失败"的问题（跨系统一致性）。
两者可以同时启用，各管各的。</p>
<p><strong>扩展方案</strong></p>
<ul>
<li><strong>指数退避重试</strong>：用 <code>ExponentialBackOff</code> 替代 <code>FixedBackOff</code>，重试间隔递增</li><ul><li>（3s → 6s → 12s → 24s），避免下游服务还没恢复就被频繁重试打挂。</li></ul><li><strong>Exactly-Once Semantics（EOS）</strong>：Kafka 事务 + Consumer 端 <code>read_committed</code></li><ul><li>隔离级别，可以实现端到端的 exactly-once 消费，但本项目没有用到这个级别。</li></ul>
<hr>` },
      { "t": "技术点 6：MD5 去重 + 幂等设计", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：什么是幂等？</strong></p>
<p>幂等（Idempotent）是一个数学/计算机概念：<strong>同一个操作执行一次和执行多次的效果相同。</strong></p>
<p>举个例子：
- 电梯"关门"按钮是幂等的：按一次关门，按十次也是关门
- 银行"转账 100 元"按钮不是幂等的：按一次转 100，按十次转 1000</p>
<p>在 HTTP 接口中，幂等意味着：同一个请求发一次和发多次，服务器的状态变化是一样的。</p>
<p><strong>三级幂等保护</strong></p>
<p>项目在分片上传时实现了三层幂等检查：</p>
<pre><code class="language-java">// UploadService.java - uploadChunk() 方法中

// === 第一级：Redis Bitmap 快速检查 ===
boolean chunkUploaded = isChunkUploaded(fileMd5, chunkIndex, userId);
if (chunkUploaded) {
    // Redis 已经标记这个分片为已上传 → 直接返回成功
    return;
}

// === 第二级：MySQL ChunkInfo 表检查 ===
if (chunkInfoRepository.existsByFileMd5AndChunkIndex(fileMd5, chunkIndex)) {
    // Redis 没有但数据库有（可能 Redis 丢了数据）
    // 回填 Redis 后返回成功
    markChunkUploadedQuietly(fileMd5, chunkIndex, userId, fileName);
    return;
}

// === 第三级：真正上传 ===
// 计算分片 MD5
byte[] fileBytes = file.getBytes();
String chunkMd5 = DigestUtils.md5Hex(fileBytes);

// 上传到 MinIO
String storagePath = "chunks/" + fileMd5 + "/" + chunkIndex;
minioClient.putObject(...);

// 保存到数据库（有唯一约束保护）
saveChunkInfo(fileMd5, chunkIndex, chunkMd5, storagePath);

// 标记 Redis
markChunkUploadedQuietly(fileMd5, chunkIndex, userId, fileName);</code></pre>
<p><strong>数据库唯一约束保护</strong></p>
<pre><code class="language-java">// ChunkInfo.java

@Table(
    name = "chunk_info",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_file_md5_chunk_index",
        columnNames = {"file_md5", "chunk_index"}
    )
)
public class ChunkInfo { ... }</code></pre>
<p>这意味着同一个 fileMd5 + chunkIndex 组合在数据库中只能有一条记录。如果两个请求同时
到达并试图插入同一条记录，第二个会因为唯一约束冲突而失败：</p>
<pre><code class="language-java">private void saveChunkInfo(String fileMd5, int chunkIndex, String chunkMd5, String storagePath) {
    ChunkInfo chunkInfo = new ChunkInfo();
    chunkInfo.setFileMd5(fileMd5);
    chunkInfo.setChunkIndex(chunkIndex);
    chunkInfo.setChunkMd5(chunkMd5);
    chunkInfo.setStoragePath(storagePath);

    try {
        chunkInfoRepository.save(chunkInfo);
    } catch (DataIntegrityViolationException e) {
        // 唯一约束冲突 → 说明另一个请求已经保存了 → 按幂等成功处理
        logger.info("分片信息已存在，按幂等成功处理");
    }
}</code></pre>
<p><strong>文件创建也有幂等保护</strong></p>
<pre><code class="language-java">private FileUpload getOrCreateFileUpload(...) {
    // 先查是否已存在
    Optional&lt;FileUpload&gt; existing = fileUploadRepository
        .findFirstByFileMd5AndUserIdOrderByCreatedAtDesc(fileMd5, userId);
    if (existing.isPresent()) {
        return existing.get();  // 已存在，直接返回
    }

    // 不存在才创建
    FileUpload fileUpload = new FileUpload();
    // ... 设置属性 ...

    try {
        return fileUploadRepository.save(fileUpload);
    } catch (DataIntegrityViolationException e) {
        // 并发创建导致冲突 → 重新查询
        return fileUploadRepository
            .findFirstByFileMd5AndUserIdOrderByCreatedAtDesc(fileMd5, userId)
            .orElseThrow(...);
    }
}</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>通过 Redis Bitmap（快速路径）→ MySQL ChunkInfo（事实来源）→ 数据库唯一约束（兜底）
三级幂等保护，确保同一个分片无论上传多少次，都只存储一次，也不会报错。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：如果前端的分片重发了（比如网络超时后自动重试），系统会怎么处理？</strong></p>
<p>A：后端收到重复的分片请求后，先查 Redis Bitmap，发现该位已经是 1（已上传），直接
返回成功，不会重复写 MinIO 和 MySQL。如果 Redis 恰好丢了数据，MySQL ChunkInfo 的
唯一约束也会阻止重复插入。</p>
<p><strong>Q2：MD5 碰撞怎么办？两个不同的文件 MD5 相同？</strong></p>
<p>A：MD5 碰撞的概率极低（2^128 种可能），在实际业务中可以忽略不计。如果真的需要
防止碰撞，可以用 SHA-256 替代，但 MD5 在文件标识场景下已经足够。</p>
<p><strong>扩展方案</strong></p>
<ul>
<li><strong>SHA-256 替代 MD5</strong>：SHA-256 的碰撞概率更低，但计算量更大。对于大文件可以只</li><ul><li>计算前 1MB + 后 1MB 的哈希（快速哈希），兼顾速度和安全。</li></ul><li><strong>秒传功能</strong>：上传前先查数据库是否有相同 MD5 的文件，如果有就直接复用，不需要</li><ul><li>再上传数据。本项目目前没有实现秒传。</li></ul>
<hr>` },
      { "t": "技术点 7：断点续传", "tag": "我的整理", "p": "core", "html": `<p><strong>什么是断点续传？</strong></p>
<p>用户上传一个 1GB 文件，传到第 150 片（75%）时网络断了或者浏览器关了。
如果没有断点续传，用户必须从头开始重新上传 205 片。
有了断点续传，用户只需上传剩下的 55 片，已经传好的 150 片不需要重传。</p>
<p><strong>前端实现：只传未完成的分片</strong></p>
<pre><code class="language-typescript">// knowledge-base/index.ts - startUpload() 方法中

// 1. 计算所有分片的索引
const totalChunks = Math.ceil(task.totalSize / chunkSize);

// 2. 过滤出还没上传的分片
const pendingChunkIndexes: number[] = [];
for (let i = 0; i &lt; totalChunks; i += 1) {
    if (!task.uploadedChunks.includes(i)) {
        // uploadedChunks 是已经上传成功的分片索引列表
        // 不包含 i → 这个分片还没传 → 加入待上传队列
        pendingChunkIndexes.push(i);
    }
}
// 假设 uploadedChunks = [0,1,2,...,149]（前 150 片已传）
// 则 pendingChunkIndexes = [150, 151, ..., 204]（只传剩余 55 片）

// 3. 只上传待传的分片
await uploadChunksInParallel(task, pendingChunkIndexes);</code></pre>
<p><strong>后端实现：查询上传状态</strong></p>
<pre><code class="language-typescript">// 前端调 GET /upload/status?file_md5=xxx 查询进度

// 后端 UploadController.java
@GetMapping("/status")
public ResponseEntity&lt;Map&lt;String, Object&gt;&gt; getUploadStatus(
        @RequestParam("file_md5") String fileMd5,
        @RequestAttribute("userId") String userId) {

    List&lt;Integer&gt; uploadedChunks = uploadService.getUploadedChunks(fileMd5, userId);
    int totalChunks = uploadService.getTotalChunks(fileMd5, userId);
    double progress = (double) uploadedChunks.size() / totalChunks * 100;

    return {
        "uploaded": uploadedChunks,  // [0, 1, 2, ..., 149]
        "progress": 73.17,            // 73.17%
        "fileName": "技术文档.pdf",
        "fileType": "PDF文档"
    };
}</code></pre>
<p><strong>前端的任务状态管理</strong></p>
<pre><code class="language-typescript">// 上传任务的状态枚举
enum UploadStatus {
    Pending,    // 等待上传
    Uploading,  // 正在上传
    Break,      // 中断（失败）
    Completed   // 已完成
}

// 上传失败时：
catch (e) {
    tasks.value[index].status = UploadStatus.Break;  // 标记为中断
}

// 用户点"重试"时：
if (existingTask.status === UploadStatus.Break) {
    existingTask.status = UploadStatus.Pending;  // 改回等待状态
    startUpload();  // 重新启动上传，只传未完成的分片
}</code></pre>
<p><strong>后端的幂等保护确保断点续传安全</strong></p>
<p>当用户重试时，前端把未完成的分片重新发送。后端收到后：</p>
<pre><code class="language-text">分片 0 → Redis Bitmap 查到位=1 → 幂等返回成功（不重复上传）
分片 1 → Redis Bitmap 查到位=1 → 幂等返回成功
...
分片 149 → Redis Bitmap 查到位=1 → 幂等返回成功
分片 150 → Redis 没有 → 真正上传到 MinIO → 写 MySQL → 写 Redis
分片 151 → 真正上传
...</code></pre>
<p>即使前端多发了已上传的分片（比如前端状态和后端不同步），后端也不会重复处理。</p>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>前端通过 uploadedChunks 记录已上传的分片，重试时只发送未完成的分片；后端通过
Redis Bitmap + MySQL 的幂等保护确保已上传的分片不会被重复处理，实现无缝断点续传。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：如果用户关了浏览器再打开，怎么知道之前传了哪些分片？</strong></p>
<p>A：分片上传状态存在两个地方——前端 Pinia Store 的 uploadedChunks 数组和后端 Redis/MySQL。
如果前端状态丢了（关了浏览器），可以通过 GET /upload/status 接口从后端查询已上传
的分片列表，恢复上传进度。</p>
<p><strong>Q2：断点续传有有效期吗？过了很久还能续传吗？</strong></p>
<p>A：取决于后端 Redis 和 MySQL 中分片记录的保留策略。Redis 中的数据可能因为内存淘汰
或重启而丢失，但 MySQL ChunkInfo 表是持久化的。如果 Redis 丢了，系统会从 MySQL 回源
查询并回填 Redis。只要 MySQL 中分片记录还在，就可以续传。</p>
<p><strong>Q3：如果用户传了一半，文件内容被修改了怎么办？</strong></p>
<p>A：不会有问题。文件 MD5 是基于文件内容计算的，内容变了 MD5 就变了，会当作一个新文件
处理，不会和之前的分片混淆。</p>
<p><strong>扩展方案</strong></p>
<ul>
<li><strong>分片 MD5 校验</strong>：本项目已经计算了每个分片的 MD5（chunkMd5），但没有在上传时</li><ul><li>校验（只存了没验）。可以在上传请求中带上 chunkMd5，后端收到后对比，不一致则拒绝，</li><li>防止传输过程中数据损坏。</li></ul><li><strong>tus 协议</strong>：tus（tus.io）是一个开源的断点续传协议标准，定义了完整的上传/暂停/</li><ul><li>恢复 API。如果要做更规范的断点续传，可以考虑引入 tus 协议。</li></ul>
<hr>` },
      { "t": "完整链路总结", "tag": "我的整理", "p": "core", "html": `<p>把 7 个技术点串在一起，就是一次完整的文件上传流程：</p>
<pre><code class="language-text">[浏览器]
  │
  │ 1. calculateMD5(file)  → "a1b2c3..."
  │ 2. 按 5MB 切成 205 片
  │ 3. 4 个 Worker 并发上传
  │
  ▼
[POST /upload/chunk] × 205 次
  │
  │ 4. 文件类型验证（仅第 1 片）
  │ 5. Redis Bitmap 幂等检查 → 已传？跳过
  │ 6. MySQL ChunkInfo 幂等检查 → 有记录？回填 Redis 跳过
  │ 7. MinIO putObject 存分片 → chunks/{md5}/{i}
  │ 8. MySQL 写 ChunkInfo → 唯一约束兜底
  │ 9. Redis SETBIT 标记
  │
  ▼
[POST /upload/merge]
  │
  │ 10. CAS：UPLOADING → MERGING（防并发）
  │ 11. MinIO composeObject 合并 → merged/{md5}
  │ 12. 清理临时分片 + Redis
  │ 13. CAS：MERGING → COMPLETED
  │    （失败则回滚 MERGING → UPLOADING）
  │
  ▼
[Kafka 事务消息]
  │
  │ 14. 事务发送 FileProcessingTask
  │ 15. Consumer 异步：下载 → 解析 → 向量化
  │ 16. 失败自动重试 4 次 → 死信队列
  │
  ▼
[完成，文件可以开始 RAG 检索]</code></pre>` }
    ]
  });

  mine.chapters.push({
    "no": "2",
    "title": "二、文档解析与文本分块（7个技术点）（技术点 8–14 · 8 节）",
    "questions": [
      { "t": "技术点 8：PDF vs 非PDF 双引擎解析", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么 PDF 要单独处理？</strong></p>
<p>PDF 和其他文档格式有本质区别：
- <strong>Word/TXT</strong>：内容是线性文本流，从头读到尾就行
- <strong>PDF</strong>：内容是"按页排版"的，每页有固定结构（页眉、正文、页脚）</p>
<p>PDF 有两个独特特性可以利用：
1. <strong>页码信息</strong>：知道内容在第几页，检索时可以说"见第 3 页"
2. <strong>页眉页脚</strong>：每页顶部/底部都有重复内容，需要过滤</p>
<p><strong>核心代码：入口判断</strong></p>
<pre><code class="language-java">public void parseAndSave(String fileMd5, InputStream fileStream,
        String userId, String orgTag, boolean isPublic) throws IOException, TikaException {
    checkMemoryThreshold();  // 先检查内存（技术点13）

    try (BufferedInputStream bufferedStream = new BufferedInputStream(fileStream, bufferSize)) {
        if (isPdfDocument(bufferedStream)) {
            parsePdfAndSave(fileMd5, bufferedStream, userId, orgTag, isPublic);
            return;  // PDF → PDFBox 路径
        }
        // 非 PDF → Tika 流式路径
        StreamingContentHandler handler = new StreamingContentHandler(fileMd5, userId, orgTag, isPublic);
        AutoDetectParser parser = new AutoDetectParser();
        parser.parse(bufferedStream, handler, metadata, context);
    }
}</code></pre>
<p><strong>PDF 判断：读 Magic Number</strong></p>
<pre><code class="language-java">private boolean isPdfDocument(BufferedInputStream stream) throws IOException {
    stream.mark(bufferSize);                  // 标记当前位置
    byte[] header = stream.readNBytes(5);     // 读前 5 字节
    stream.reset();                           // 退回标记位置
    return header.length == 5 &amp;&amp; "%PDF-".equals(new String(header, StandardCharsets.US_ASCII));
    // PDF 文件开头一定是 "%PDF-"，这叫 Magic Number
}</code></pre>
<p><code>mark()/reset()</code> 的作用：读完 5 字节后流位置后移了，reset 退回来不影响后续解析。
<code>BufferedInputStream</code> 支持 mark/reset，可以"偷看"前几个字节再退回来。</p>
<p><strong>PDF 路径：PDFBox 逐页解析</strong></p>
<pre><code class="language-java">private void parsePdfAndSave(...) throws IOException {
    try (PDDocument document = PDDocument.load(fileStream)) {
        List&lt;String&gt; cleanedPageTexts = extractCleanPdfPageTexts(document);
        // 第一步：提取每页文本 + 过滤页眉页脚（技术点12）

        for (int pageNumber = 1; pageNumber &lt;= cleanedPageTexts.size(); pageNumber++) {
            String pageText = cleanedPageTexts.get(pageNumber - 1);
            if (pageText == null || pageText.isBlank()) continue;

            List&lt;String&gt; childChunks = splitTextIntoChunksWithSemantics(pageText, chunkSize);
            // 同一套分块算法（技术点10）

            saveChildChunks(fileMd5, childChunks, userId, orgTag, isPublic, savedChunkCount, pageNumber);
            //                                                                              ^^^^^^^^^^^
            //                                                                              PDF独有页码
        }
    }
}</code></pre>
<p><strong>非PDF 路径：Tika 自动解析</strong></p>
<pre><code class="language-java">AutoDetectParser parser = new AutoDetectParser();
// 自动识别格式，选择对应解析器：
//   .docx → OOXMLParser    .xlsx → OOXMLParser（单元格文本）
//   .html → HtmlParser     .txt → TXTParser    .epub → EpubParser

StreamingContentHandler handler = new StreamingContentHandler(...);
// 继承 BodyContentHandler，只接收文本，图片自动忽略

parser.parse(bufferedStream, handler, metadata, context);</code></pre>
<p><strong>Tika 对不同格式的处理</strong></p>
<div class="table-wrap"><table>
<thead><tr><th>格式</th><th>解析器</th><th>提取方式</th></tr></thead>
<tbody>
<tr><td>.docx</td><td>OOXMLParser</td><td>解压 zip，提取 word/document.xml 文本</td></tr>
<tr><td>.xlsx</td><td>OOXMLParser</td><td>遍历 sheet/cell 提取文本值</td></tr>
<tr><td>.pptx</td><td>OOXMLParser</td><td>遍历幻灯片文本框</td></tr>
<tr><td>.html</td><td>HtmlParser</td><td>解析 DOM，提取 body 文本节点</td></tr>
<tr><td>.txt/.md/.csv</td><td>纯文本</td><td>直接读取</td></tr>
<tr><td>.epub</td><td>EpubParser</td><td>解压 epub，逐章节提取 HTML 正文</td></tr>
</tbody></table></div>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>通过文件头 5 字节（Magic Number）判断 PDF/非PDF，PDF 走 PDFBox 逐页解析保留页码，
非 PDF 走 Tika 自动识别格式流式提取纯文本，两者最终调用同一套语义分块算法。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：PDF 不也用 Tika 行不行？</strong>
A：Tika 解析 PDF 底层也调 PDFBox，但封装会丢失页码信息。我们需要页码做引用溯源，
所以直接用 PDFBox。另外页眉页脚过滤需要按页处理。</p>
<p><strong>Q2：Excel 解析后什么样？</strong>
A：单元格文本依次输出，用制表符和换行分隔，行列结构丢失，只保留文本。</p>
<p><strong>Q3：加密 PDF 怎么办？</strong>
A：<code>PDDocument.load()</code> 抛异常 → 标记为向量化失败。</p>
<p><strong>扩展方案</strong></p>
<ul>
<li><strong>OCR 支持</strong>：集成 Tesseract OCR，对扫描页和图片做文字识别。</li><li><strong>表格结构保留</strong>：用 Camelot/Tabula 提取 PDF 表格，保留行列结构。</li></ul>
<hr>` },
      { "t": "技术点 9：Parent-Child Chunking 父子分块策略", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么需要分块？</strong></p>
<p>LLM 和 Embedding 模型有输入长度限制。10 万字文档不可能整个送给模型。
切太大噪声多，切太小语义碎片化。</p>
<p>Parent-Child 策略：大块保持语义完整，小块做精细检索。
<strong>本项目中父块只作为流式处理窗口，子切片才是存储和检索的单元。</strong></p>
<p><strong>配置参数</strong></p>
<pre><code class="language-yaml">chunk-size: 512           # 子切片目标大小（字符数）
overlap-size: 100         # 重叠字符数
min-chunk-size: 100       # 最小分片
parent-chunk-size: 1048576  # 父块 1MB</code></pre>
<p><strong>核心代码：父块作为流式窗口</strong></p>
<pre><code class="language-java">private class StreamingContentHandler extends BodyContentHandler {
    private final StringBuilder buffer = new StringBuilder();  // 文本缓冲区
    private int savedChunkCount = 0;

    public StreamingContentHandler(...) {
        super(-1);  // -1 = 不限制输出长度（默认只 10 万字符）
    }

    @Override
    public void characters(char[] ch, int start, int length) {
        buffer.append(ch, start, length);
        if (buffer.length() &gt;= parentChunkSize) {  // 到 1MB 触发
            processParentChunk();
        }
    }

    @Override
    public void endDocument() {
        if (buffer.length() &gt; 0) processParentChunk();  // 处理剩余
    }
}</code></pre>
<p><strong>父块 → 子切片 → 存数据库</strong></p>
<pre><code class="language-java">private void processParentChunk() {
    String parentChunkText = buffer.toString();  // 取出 ~1MB 文本

    List&lt;String&gt; childChunks = splitTextIntoChunksWithSemantics(parentChunkText, chunkSize);
    // 切成 ~512 字符的子切片（技术点10详讲）

    this.savedChunkCount = saveChildChunks(fileMd5, childChunks, ...);
    // 存入 MySQL document_vectors 表

    buffer.setLength(0);  // 清空缓冲区 → 父块直接丢弃，不存库
}</code></pre>
<p><strong>子切片保存</strong></p>
<pre><code class="language-java">private int saveChildChunks(String fileMd5, List&lt;String&gt; chunks, ..., Integer pageNumber) {
    int currentChunkId = startingChunkId;
    for (String chunk : chunks) {
        currentChunkId++;
        var vector = new DocumentVector();
        vector.setFileMd5(fileMd5);        // 文件指纹（关联用）
        vector.setChunkId(currentChunkId);  // 分块序号（排序用）
        vector.setTextContent(chunk);       // ~512字符文本
        vector.setPageNumber(pageNumber);   // PDF页码（非PDF为null）
        vector.setAnchorText(buildAnchorText(chunk));  // 前120字符预览
        vector.setUserId(userId);
        vector.setOrgTag(orgTag);
        vector.setPublic(isPublic);
        documentVectorRepository.save(vector);
    }
    return currentChunkId;
}</code></pre>
<p><strong>数据示例</strong></p>
<pre><code class="language-text">3MB Word 文档：
  父块1(1MB) → ~2000 子切片 → chunkId 1~2000 → 存 MySQL → 清空缓冲区
  父块2(1MB) → ~2000 子切片 → chunkId 2001~4000 → 存 MySQL → 清空
  父块3(1MB) → ~2000 子切片 → chunkId 4001~6000 → 存 MySQL → 清空
总计：6000 个子切片存入 document_vectors 表</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>以 1MB 父块作为流式解析的内存窗口（避免大文件 OOM），内部切成 ~512 字符子切片存入
MySQL，父块本身不存库——它只是"处理单元"，子切片才是"检索单元"。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么父块 1MB？</strong>
A：足够大减少切换次数，又不会导致 JVM OOM（默认堆 1-4GB，1MB 的 StringBuilder 完全承受）。</p>
<p><strong>Q2：能从子切片找到父块吗？</strong>
A：当前不能。没存父块也没 parentId。改进方向：参考 LangChain ParentDocumentRetriever，
同时存储父块和子切片，检索命中子切片后回溯父块送给 LLM。</p>
<p><strong>Q3：<code>super(-1)</code> 什么意思？</strong>
A：BodyContentHandler 默认限制 10 万字符输出，超过会抛 SAXException。传 -1 取消限制。</p>
<p><strong>扩展方案</strong></p>
<ul>
<li><strong>LangChain ParentDocumentRetriever</strong>：同时存父块和子切片，检索时命中子切片后回溯父块。</li><li><strong>动态父块大小</strong>：根据文档类型调整（法律合同用更大父块保持条款完整）。</li></ul>
<hr>` },
      { "t": "技术点 10：三级语义切分算法", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么不能硬切？</strong></p>
<p>"每 512 字符切一刀"会在句子中间断开：</p>
<pre><code class="language-text">"...检索增强生成是一种技术方案。它通过从知识库中检索|相关文档片段..."
                                                 ↑ 切在这</code></pre>
<p>一个完整句子被切成两半，语义断裂。</p>
<p><strong>三级切分流程</strong></p>
<pre><code class="language-text">splitTextIntoChunksWithSemantics(text, chunkSize)
  ├── 第一级：splitTextIntoBaseChunks()    段落 → 句子 → 词语 → 字符（逐级降级）
  ├── 第二级：mergeSmallChunks()           合并 &lt;100 字符的过小 chunk
  └── 第三级：addSemanticOverlap()         添加语义重叠（技术点11详讲）</code></pre>
<p><strong>第一级：按段落分割</strong></p>
<pre><code class="language-java">private List&lt;String&gt; splitTextIntoBaseChunks(String text, int chunkSize) {
    String[] paragraphs = text.split("\\n\\n+");  // 双换行分段落（\\n\\n+ 匹配2个或更多换行）
    StringBuilder currentChunk = new StringBuilder();

    for (String paragraph : paragraphs) {
        paragraph = paragraph.trim();
        if (paragraph.isBlank()) continue;

        if (paragraph.length() &gt; chunkSize) {
            // 情况A：单段落就超长 → 先保存现有chunk → 再按句子切此段落
            if (currentChunk.length() &gt; 0) {
                chunks.add(currentChunk.toString().trim());
                currentChunk = new StringBuilder();
            }
            chunks.addAll(splitLongParagraph(paragraph, chunkSize));
        }
        else if (currentChunk.length() + paragraph.length() + 2 &gt; chunkSize) {
            // 情况B：加上此段会超限 → 保存当前chunk → 开始新的
            // +2 是因为段落之间要加 "\\n\\n"
            chunks.add(currentChunk.toString().trim());
            currentChunk = new StringBuilder(paragraph);
        }
        else {
            // 情况C：放进当前chunk
            if (currentChunk.length() &gt; 0) currentChunk.append("\\n\\n");
            currentChunk.append(paragraph);
        }
    }
    if (currentChunk.length() &gt; 0) chunks.add(currentChunk.toString().trim());
    return chunks;
}</code></pre>
<p><strong>长段落 → 按句子切</strong></p>
<pre><code class="language-java">private List&lt;String&gt; splitLongParagraph(String paragraph, int chunkSize) {
    String[] sentences = paragraph.split("(?&lt;=[。！？；])|(?&lt;=[.!?;])\\\\s+");
    // (?&lt;=[。！？；])   → 中文标点后面切（lookbehind 后视断言）
    // (?&lt;=[.!?;])\\\\s+  → 英文标点+空格后面切
    // 例："你好！这是测试。" → ["你好！", "这是测试。"]

    StringBuilder currentChunk = new StringBuilder();
    for (String sentence : sentences) {
        if (currentChunk.length() + sentence.length() &gt; chunkSize) {
            if (currentChunk.length() &gt; 0) {
                chunks.add(currentChunk.toString().trim());
                currentChunk = new StringBuilder();
            }
            if (sentence.length() &gt; chunkSize) {
                chunks.addAll(splitLongSentence(sentence, chunkSize));  // 还长 → 按词语切
            } else {
                currentChunk.append(sentence);
            }
        } else {
            currentChunk.append(sentence);
        }
    }
    if (currentChunk.length() &gt; 0) chunks.add(currentChunk.toString().trim());
    return chunks;
}</code></pre>
<p><strong>长句子 → HanLP 按词语切</strong></p>
<pre><code class="language-java">private List&lt;String&gt; splitLongSentence(String sentence, int chunkSize) {
    try {
        List&lt;Term&gt; termList = StandardTokenizer.segment(sentence);
        // HanLP 分词示例：
        // "检索增强生成是一种结合检索和生成的技术方案"
        // → ["检索","增强","生成","是","一种","结合","检索","和","生成","的","技术","方案"]

        StringBuilder currentChunk = new StringBuilder();
        for (Term term : termList) {
            String word = term.word;
            if (currentChunk.length() + word.length() &gt; chunkSize &amp;&amp; !currentChunk.isEmpty()) {
                chunks.add(currentChunk.toString());
                currentChunk = new StringBuilder();
            }
            currentChunk.append(word);
        }
        if (!currentChunk.isEmpty()) chunks.add(currentChunk.toString());
    } catch (Exception e) {
        chunks = splitByCharacters(sentence, chunkSize);  // 兜底：按字符硬切
    }
    return chunks;
}</code></pre>
<p><strong>HanLP 失败时的兜底：按字符硬切</strong></p>
<pre><code class="language-java">private List&lt;String&gt; splitByCharacters(String sentence, int chunkSize) {
    // 逐字符拼入 chunk，超过 chunkSize 就保存开新的
    // 这是最后的兜底方案，不考虑语义
}</code></pre>
<p><strong>第二级：合并过小的 chunk</strong></p>
<pre><code class="language-java">private List&lt;String&gt; mergeSmallChunks(List&lt;String&gt; chunks, int chunkSize) {
    int effectiveMinChunkSize = Math.min(minChunkSize, chunkSize);  // 100
    int maxMergedChunkSize = chunkSize + Math.min(overlapSize, chunkSize - 1);  // 612

    for (String chunk : chunks) {
        if (!merged.isEmpty()) {
            String previous = merged.get(merged.size() - 1);
            String combined = previous + "\\n\\n" + chunk;
            // 合并条件：当前或前一个太小，且合并后不超上限
            if ((chunk.length() &lt; effectiveMinChunkSize || previous.length() &lt; effectiveMinChunkSize)
                    &amp;&amp; combined.length() &lt;= maxMergedChunkSize) {
                merged.set(merged.size() - 1, combined);
                continue;
            }
        }
        merged.add(chunk);
    }
    return merged;
}
// 为什么合并？一个只有 20 字符的 chunk（比如"总结"两个字）
// 送进 Embedding 模型生成的向量几乎没有语义信息，检索时产生噪声</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>三级语义切分：段落 → 句子 → HanLP 词语 → 字符硬切（逐级降级兜底），切后合并过小
chunk（&lt;100字符），最终得到大小均匀、语义完整的子切片。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：HanLP 是什么？为什么用它？</strong>
A：HanLP 是开源中文 NLP 工具包，用来做中文分词。保证切块时不把词语切成两半
（比如不会把"增强"切成"增"和"强"）。</p>
<p><strong>Q2：没有 \\n\\n 段落分隔怎么办？</strong>
A：整段当一个超长段落，走 splitLongParagraph 按句子分割。无论原始格式如何都能切好。</p>
<p><strong>Q3：为什么不直接用固定大小切？</strong>
A：固定切会在句子中间断开，导致上下文依赖信息丢失。语义切分保证每个 chunk
是完整的语义单元，LLM 更容易理解。</p>
<p><strong>扩展方案</strong></p>
<ul>
<li><strong>基于 Token 的分块</strong>：当前按字符数分块，但 Embedding 模型限制是 Token 数。</li><ul><li>可以用 tiktoken 等工具按 Token 分块，更精确。</li></ul><li><strong>语义分块（Semantic Chunking）</strong>：用 Embedding 相似度判断句子是否属于同一话题，</li><ul><li>在话题切换处切割。效果更好但计算成本高。</li></ul>
<hr>` },
      { "t": "技术点 11：语义重叠 Overlap", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么需要重叠？</strong></p>
<p>假设：</p>
<pre><code class="language-text">chunk1: "...RAG 通过检索相关文档片段来增强生成质量。"
chunk2: "它的核心流程分为三步..."</code></pre>
<p>用户问"RAG的核心流程？"命中 chunk2，但"它"指什么？"RAG"这个词在 chunk1 里。</p>
<p>Overlap 的解决方案：把 chunk1 末尾的一段文字复制到 chunk2 开头：</p>
<pre><code class="language-text">chunk2: "来增强生成质量。\\n\\n它的核心流程分为三步..."
         ↑ 从 chunk1 末尾复制的重叠内容</code></pre>
<p><strong>核心代码</strong></p>
<pre><code class="language-java">private List&lt;String&gt; addSemanticOverlap(List&lt;String&gt; chunks, int chunkSize) {
    int effectiveOverlapSize = Math.min(overlapSize, chunkSize - 1);  // min(100, 511) = 100
    List&lt;String&gt; overlappedChunks = new ArrayList&lt;&gt;();
    overlappedChunks.add(chunks.get(0));  // 第一个不需要重叠

    for (int i = 1; i &lt; chunks.size(); i++) {
        String overlapText = buildOverlapText(chunks.get(i - 1), effectiveOverlapSize);
        overlappedChunks.add(overlapText.isEmpty()
            ? chunks.get(i)
            : overlapText + "\\n\\n" + chunks.get(i));
    }
    return overlappedChunks;
}</code></pre>
<p><strong>提取重叠文本（按语义边界）</strong></p>
<pre><code class="language-java">private String buildOverlapText(String text, int maxLength) {
    List&lt;String&gt; sentences = splitIntoSentenceUnits(text);  // 按标点分句子
    StringBuilder overlap = new StringBuilder();

    // 从最后一个句子往前拼，直到超过 maxLength
    for (int i = sentences.size() - 1; i &gt;= 0; i--) {
        String sentence = sentences.get(i).trim();
        if (sentence.length() &gt; maxLength) {
            // 单个句子就超过 → 用 HanLP 按词语截取尾部
            return overlap.isEmpty()
                ? tailByTokenBoundary(sentence, maxLength)
                : overlap.toString().trim();
        }
        if (overlap.length() + sentence.length() &gt; maxLength) break;
        overlap.insert(0, sentence);
    }
    if (overlap.isEmpty()) return tailByTokenBoundary(text, maxLength);
    return overlap.toString().trim();
}</code></pre>
<p><strong>HanLP 按词语截取尾部</strong></p>
<pre><code class="language-java">private String tailByTokenBoundary(String text, int maxLength) {
    List&lt;Term&gt; termList = StandardTokenizer.segment(text);
    StringBuilder tail = new StringBuilder();

    // 从最后一个词往前拼
    for (int i = termList.size() - 1; i &gt;= 0; i--) {
        String word = termList.get(i).word;
        if (tail.length() + word.length() &gt; maxLength) break;
        tail.insert(0, word);
    }
    if (!tail.isEmpty()) return tail.toString();
    return text.substring(Math.max(0, text.length() - maxLength));  // 字符兜底
}</code></pre>
<p><strong>数据示例</strong></p>
<pre><code class="language-text">chunk1（200字符）：
"RAG（检索增强生成）是一种结合检索和生成的技术方案。它通过从知识库中检索相关文档片段，
来增强大语言模型的生成质量。"

提取重叠文本（maxLength=100）：
  句子列表：
    [0] "RAG（检索增强生成）是一种结合检索和生成的技术方案。"  (24字符)
    [1] "它通过从知识库中检索相关文档片段，来增强大语言模型的生成质量。"  (30字符)

  从后往前拼：
    句子[1]：30字符 &lt; 100 → 拼入
    句子[0]：24+30=54 &lt; 100 → 拼入
    overlap = 两句话全部

chunk2 最终内容：
"RAG（检索增强生成）是一种...来增强大语言模型的生成质量。\\n\\n它的核心流程分为三步..."</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>每个子切片开头追加前一切片末尾约 100 字符的重叠内容，按句子边界截取，句子太长用
HanLP 按词语边界截取，保证跨切片语义连贯。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：overlap 太大/太小的影响？</strong>
A：太大（300字符）→ 大量重复浪费 Embedding Token 和存储。太小（10字符）→ 跨块
语义连贯不够。100 字符约 1-2 个完整句子，是经验值。</p>
<p><strong>Q2：重叠会不会导致检索重复命中？</strong>
A：相邻 chunk 向量会更接近，top-K 中可能同时出现。但 LLM 综合多个片段回答，
重复不影响准确性。</p>
<p><strong>扩展方案</strong></p>
<ul>
<li><strong>Sentence Window Retrieval</strong>：不存储重叠，检索命中后动态获取前后各 N 个 chunk</li><ul><li>拼接送给 LLM。避免存储冗余，但需要额外查询逻辑。</li></ul>
<hr>` },
      { "t": "技术点 12：PDF 跨页页眉页脚自动过滤", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识</strong></p>
<p>50 页 PDF，每页顶部"XX公司文档 v2.0"，底部"第 N 页"。不过滤的话每个 chunk 都带
这些重复内容，浪费 Token 并干扰检索。</p>
<p><strong>三步算法</strong></p>
<pre><code class="language-java">private List&lt;String&gt; extractCleanPdfPageTexts(PDDocument document) throws IOException {
    PDFTextStripper stripper = new PDFTextStripper();
    List&lt;List&lt;String&gt;&gt; rawPageLines = new ArrayList&lt;&gt;();

    // 第一步：逐页提取文本行
    for (int page = 1; page &lt;= document.getNumberOfPages(); page++) {
        stripper.setStartPage(page);
        stripper.setEndPage(page);
        rawPageLines.add(splitPdfLines(stripper.getText(document)));
    }

    // 第二步：统计前3行+后3行的跨页频率
    Map&lt;String, Integer&gt; topCounts = collectBoundaryLineCounts(rawPageLines, true);
    Map&lt;String, Integer&gt; bottomCounts = collectBoundaryLineCounts(rawPageLines, false);
    int threshold = Math.max(2, Math.min(3, document.getNumberOfPages()));

    // 第三步：逐页过滤高频行
    for (List&lt;String&gt; lines : rawPageLines) {
        cleanedPages.add(removePdfBoilerplateLines(lines, topCounts, bottomCounts, threshold));
    }
    return cleanedPages;
}</code></pre>
<p><strong>归一化（精妙之处）</strong></p>
<pre><code class="language-java">private String normalizePdfBoundaryLine(String line) {
    return Normalizer.normalize(line, Normalizer.Form.NFKC)
        // NFKC：全角→半角，统一 Unicode
        .replace('\\u00A0', ' ')        // 不间断空格 → 普通空格
        .replaceAll("\\\\s+", " ")       // 多空格 → 单空格
        .replaceAll("\\\\d+", "#")       // 所有数字 → #
        // "第 1 页" → "第 # 页"
        // "第 2 页" → "第 # 页"  ← 相同了！
        // "第 50 页" → "第 # 页" ← 也相同！
        .trim().toLowerCase();

    // 过滤太短（&lt;4字符）或太长（&gt;120字符）的行
    if (normalized.length() &lt; 4 || normalized.length() &gt; 120) return null;
}</code></pre>
<p><strong>数字归一化</strong> <code>\\\\d+ → #</code> 是整个算法的精妙之处：不同页码的"第 N 页"变成同一个 key，
才能统计出它出现在所有页中。</p>
<p><strong>过滤逻辑</strong></p>
<pre><code class="language-java">// 从顶部检查（最多看 3 行）
//   高频行 → 跳过（页眉）
//   遇到非高频行 → 立刻 break（保护正文不被误删）

// 从底部检查（最多看 3 行）
//   高频行 → 跳过（页脚）
//   遇到非高频行 → 立刻 break</code></pre>
<p><strong>数据示例</strong></p>
<pre><code class="language-text">50 页 PDF：
  "xx公司内部文档 v2.0" → 出现 50 次 → ≥ 阈值3 → 页眉 → 过滤
  "第 # 页" → 出现 50 次 → ≥ 阈值3 → 页脚 → 过滤
  "第一章 概述" → 出现 1 次 → &lt; 阈值3 → 不是页眉 → 保留</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>统计每页前 3 行和后 3 行的跨页频率（数字归一化为 #），超过阈值判定为页眉/页脚
并过滤，遇到非高频行立刻停止保护正文，避免重复内容污染分块和检索。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么要数字归一化？</strong>
A：页脚"第 1 页"和"第 2 页"数字不同，不归一化无法识别为同类页脚。归一化后
都变成"第 # 页"，计数 = 50（所有页都有）→ 判定为页脚。</p>
<p><strong>Q2：正文第一行和页眉一样怎么办？</strong>
A：只在顶部连续区域检查最多 3 行。第 1 行是页眉跳过，第 2 行不是高频就 break，
不会继续往下找，避免误删正文。</p>
<p><strong>扩展方案</strong></p>
<ul>
<li><strong>机器学习方法</strong>：用分类模型判断每行是"页眉/页脚/正文"，比频率规则更鲁棒。</li></ul>
<hr>` },
      { "t": "技术点 13：流式解析防 OOM", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：什么是 OOM？</strong></p>
<p>OOM（Out Of Memory）= JVM 堆内存溢出。如果把 2GB 文件整个读进内存就会 OOM。</p>
<p><strong>三层防护</strong></p>
<p><strong>第一层：内存阈值检查</strong></p>
<pre><code class="language-java">private void checkMemoryThreshold() {
    long maxMemory = Runtime.getRuntime().maxMemory();
    long usedMemory = Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory();
    double memoryUsage = (double) usedMemory / maxMemory;

    if (memoryUsage &gt; 0.8) {  // 使用率超过 80%
        System.gc();  // 主动触发垃圾回收
        // 重新检查，还是超 → 直接拒绝处理
        if (stillHigh) throw new RuntimeException("内存不足，无法处理大文件");
    }
}
// 在 parseAndSave() 开始时调用
// 如果内存不够就提前拒绝，而不是处理到一半 OOM 崩溃</code></pre>
<p><strong>第二层：Tika 流式解析（内存最多 ~1MB）</strong></p>
<pre><code class="language-java">// StreamingContentHandler 不会把整个文档加载到内存
// Tika 边解析边回调 characters()，每次只送一小段文本
// 到 1MB → processParentChunk() → 切块+存库+清空缓冲区
// 任何时刻内存中最多只有约 1MB 的文本</code></pre>
<p><strong>第三层：BufferedInputStream 8KB 缓冲</strong></p>
<pre><code class="language-java">new BufferedInputStream(fileStream, 8192);  // 每次只从底层流读 8KB</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>三层防 OOM：解析前检查内存（&gt;80% 触发 GC 或拒绝），Tika 流式解析只保留 ~1MB
缓冲区，BufferedInputStream 控制底层读取为 8KB。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：System.gc() 可靠吗？</strong>
A：只是建议，JVM 不保证立刻执行。但实践中 HotSpot JVM 通常会触发 Full GC。
作为"解析大文件前紧急回收"的手段可以接受。</p>
<p><strong>Q2：PDF 路径有 OOM 风险吗？</strong>
A：有。<code>PDDocument.load()</code> 加载整个 PDF 到内存。改进：用
<code>MemoryUsageSetting.setupTempFileOnly()</code> 把大对象写到磁盘临时文件。</p>
<p><strong>扩展方案</strong></p>
<ul>
<li><strong>JVM 参数调优</strong>：<code>-Xmx4g -XX:+UseG1GC -XX:MaxGCPauseMillis=200</code></li></ul>
<hr>` },
      { "t": "技术点 14：Apache Tika 20+ 格式自动识别", "tag": "我的整理", "p": "core", "html": `<p><strong>核心机制</strong></p>
<p>Tika 通过 Magic Number + 扩展名识别格式，自动选解析器。</p>
<p><strong>支持的 21 种格式</strong>：
pdf, doc, docx, xls, xlsx, ppt, pptx, txt, rtf, md, odt, ods, odp,
html, htm, xml, json, csv, epub, pages, numbers, keynote</p>
<p><strong>明确拒绝的</strong>：图片(jpg/png...)、音频(mp3/wav...)、视频(mp4/avi...)、
压缩包(zip/rar...)、可执行文件(exe...)、字体、CAD、数据库文件等</p>
<p><strong>验证时机</strong>：只在第一个分片（chunkIndex=0）时检查扩展名。</p>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>Tika 通过 Magic Number + 扩展名自动识别 21 种格式并选对应解析器；不支持的格式
在第一个分片时就被拒绝。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：.exe 改名 .pdf 上传会怎样？</strong>
A：扩展名检查通过。Tika 解析时读 Magic Number 发现是 <code>MZ</code>（exe特征）不是 <code>%PDF-</code>，
抛异常，标记向量化失败。改进：上传时也检查 Magic Number。</p>
<p><strong>Q2：Excel 公式单元格怎么处理？</strong>
A：Tika 提取的是"显示值"（计算结果），不是公式本身。比如 <code>=SUM(A1:A10)</code> 显示
<code>55</code>，Tika 提取 <code>55</code>。</p>
<p><strong>扩展方案</strong></p>
<ul>
<li><strong>Magic Number 验证前置</strong>：第一个分片到达时不仅检查扩展名还读文件头验证。</li><li><strong>图片 OCR</strong>：集成 Tesseract 支持图片格式。</li></ul>
<hr>` },
      { "t": "完整链路总结", "tag": "我的整理", "p": "core", "html": `<pre><code class="language-text">[Kafka Consumer 收到任务]
  │ 13. 检查内存（&gt;80% 拒绝）
  ▼
[ParseService.parseAndSave()]
  │ 8. 读文件头 5 字节 → PDF or 非PDF
  │
  ├── PDF（PDFBox）：
  │     12. 逐页提取 → 页眉页脚频率过滤
  │     10. 每页三级语义切分
  │     11. 添加语义重叠
  │     9.  子切片存 MySQL（带页码）
  │
  └── 非PDF（Tika）：
        14. AutoDetectParser 自动识别格式
        9.  StreamingContentHandler 流式处理（每 1MB 触发）
        10. 三级语义切分（段落→句子→HanLP词语→字符兜底）
        11. 添加语义重叠
        9.  子切片存 MySQL（无页码）
  │
  ▼
[MySQL document_vectors 表]
  │  字段：fileMd5, chunkId, textContent, pageNumber, anchorText, userId, orgTag
  │  准备交给下一步：VectorizationService 向量化 → 写入 Elasticsearch</code></pre>` }
    ]
  });

  mine.chapters.push({
    "no": "3",
    "title": "三、向量检索与混合搜索（6个技术点）（技术点 15–20 · 7 节）",
    "questions": [
      { "t": "技术点 15：Elasticsearch + IK 分词器", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：Elasticsearch 是什么？</strong></p>
<p>Elasticsearch（简称 ES）是一个分布式搜索和分析引擎。你可以理解为：
- <strong>MySQL</strong> 擅长精确查询（<code>WHERE id = 42</code>）
- <strong>Elasticsearch</strong> 擅长全文搜索（"哪些文档包含'检索增强生成'这个词？"）</p>
<p>ES 把数据存在"索引"（Index）里，类似 MySQL 的"表"。每条数据叫"文档"（Document），
类似 MySQL 的"行"。</p>
<p><strong>前置知识：什么是分词器？</strong></p>
<p>搜索"检索增强生成"时，ES 需要知道用户想搜的是什么。分词器把文本拆成一个个"词元"
（Token），建索引和搜索时都用这些词元来匹配。</p>
<p>比如中文句子"检索增强生成是一种技术方案"：
- <strong>不分词</strong>：整句当一个词 → 用户搜"检索"匹配不到（因为索引里只有整句）
- <strong>分词后</strong>：["检索", "增强", "生成", "是", "一种", "技术", "方案"] → 搜"检索"能匹配</p>
<p><strong>IK 分词器的两种模式</strong></p>
<p>本项目用了 IK 分词器的两种模式，分别用于<strong>建索引</strong>和<strong>搜索</strong>：</p>
<pre><code class="language-json">// es-mappings/knowledge_base.json
{
  "mappings": {
    "properties": {
      "textContent": {
        "type": "text",
        "analyzer": "ik_max_word",       // 建索引时用：细粒度切词
        "search_analyzer": "ik_smart"     // 搜索时用：粗粒度切词
      }
    }
  }
}</code></pre>
<p><strong>ik_max_word（索引时）</strong>：尽可能多地切出词语</p>
<pre><code class="language-text">"中华人民共和国" → ["中华人民共和国", "中华人民", "中华", "华人", "人民共和国", "人民", "共和国", "共和", "国"]
// 切出 9 个词元，尽可能多召回</code></pre>
<p><strong>ik_smart（搜索时）</strong>：智能切分，不会过度拆分</p>
<pre><code class="language-text">"中华人民共和国" → ["中华人民共和国"]
// 只切出 1 个词元，精确匹配</code></pre>
<p><strong>为什么索引时细粒度、搜索时粗粒度？</strong></p>
<pre><code class="language-text">索引文档："中华人民共和国国歌"
  ik_max_word 切出：["中华人民共和国", "中华人民", "中华", "华人", "人民共和国", "人民", "共和国", "共和", "国", "国歌"]
  → ES 倒排索引：
    "中华" → 文档1
    "人民" → 文档1
    "国歌" → 文档1
    "中华人民共和国" → 文档1
    ...（很多词都指向文档1）

用户搜索："中华"
  ik_smart 切出：["中华"]
  → 查倒排索引："中华" → 文档1 ✅ 命中

用户搜索："中华人民共和国国歌"
  ik_smart 切出：["中华人民共和国", "国歌"]
  → 查倒排索引：两个词都命中 文档1 ✅ 精确匹配</code></pre>
<p>如果反过来（索引用 ik_smart、搜索用 ik_max_word），会导致搜索时过度拆分，
召回大量不相关的结果。</p>
<p><strong>ES Mapping 完整结构</strong></p>
<pre><code class="language-json">{
  "mappings": {
    "properties": {
      "fileMd5":      { "type": "keyword" },           // 文件指纹（精确匹配用）
      "chunkId":      { "type": "integer" },           // 分块序号
      "pageNumber":   { "type": "integer" },           // PDF 页码
      "anchorText":   { "type": "text", "index": false },  // 锚点文本（不建索引，只存储）
      "textContent":  {
        "type": "text",
        "analyzer": "ik_max_word",         // IK 细粒度（索引时）
        "search_analyzer": "ik_smart"       // IK 粗粒度（搜索时）
      },
      "vector": {
        "type": "dense_vector",             // 向量字段
        "dims": 2048,                       // 2048 维
        "index": true,                      // 开启向量索引（HNSW）
        "similarity": "cosine"              // 余弦相似度
      },
      "modelVersion": { "type": "keyword" },
      "userId":       { "type": "keyword" },
      "orgTag":       { "type": "keyword" },
      "isPublic":     { "type": "boolean" }
    }
  }
}</code></pre>
<p><strong>关键类型解释</strong>：</p>
<div class="table-wrap"><table>
<thead><tr><th>类型</th><th>含义</th><th>用途</th></tr></thead>
<tbody>
<tr><td><code>keyword</code></td><td>不分词，整串匹配</td><td>fileMd5、userId、orgTag 的精确过滤</td></tr>
<tr><td><code>text</code></td><td>分词后建倒排索引</td><td>textContent 的全文搜索</td></tr>
<tr><td><code>dense_vector</code></td><td>浮点向量数组</td><td>vector 的 KNN 向量检索</td></tr>
<tr><td><code>integer</code></td><td>整数</td><td>chunkId、pageNumber 的范围查询</td></tr>
<tr><td><code>boolean</code></td><td>布尔值</td><td>isPublic 的过滤</td></tr>
</tbody></table></div>
<p><strong><code>anchorText</code> 的 <code>"index": false</code></strong>：这个字段只存储不建索引，不能被搜索，
但可以在搜索结果中返回（用于前端展示预览文字）。</p>
<p><strong>索引自动初始化</strong></p>
<pre><code class="language-java">// EsIndexInitializer.java - 应用启动时自动创建索引

@Override
public void run(String... args) throws Exception {
    // 检查索引是否存在
    BooleanResponse exists = esClient.indices().exists(
        ExistsRequest.of(e -&gt; e.index("knowledge_base"))
    );

    if (!exists.value()) {
        // 索引不存在 → 读取 knowledge_base.json → 创建索引
        String mappingJson = new String(
            mappingResource.getInputStream().readAllBytes(),
            StandardCharsets.UTF_8
        );
        esClient.indices().create(
            CreateIndexRequest.of(c -&gt; c
                .index("knowledge_base")
                .withJson(new StringReader(mappingJson))
            )
        );
    }
    // 索引已存在 → 跳过（不会重复创建）
}</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>Elasticsearch 使用 IK 分词器的双模式策略：索引时用 ik_max_word 细粒度切词（多召回），
搜索时用 ik_smart 粗粒度切词（高精度）；ES Mapping 同时定义了文本字段和 2048 维向量
字段，支持全文搜索和向量检索；索引在应用启动时自动创建。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么索引和搜索要用不同的分词器？</strong>
A：索引用 ik_max_word 切出尽可能多的词元，让用户搜任何子词都能命中。搜索用 ik_smart
避免过度拆分导致召回大量不相关结果。这是"宽索引、窄搜索"的经典策略。</p>
<p><strong>Q2：<code>dense_vector</code> 的 <code>similarity: cosine</code> 是什么意思？</strong>
A：余弦相似度衡量两个向量的方向是否一致（不看长度）。值域 [-1, 1]，1 表示方向完全
相同（语义最相似），0 表示正交（不相关），-1 表示完全相反。ES 的 KNN 搜索会按
cosine 相似度排序返回结果。</p>
<p><strong>Q3：如果 ES 没装 IK 分词器插件会怎样？</strong>
A：创建索引时 ES 会报错 <code>analyzer [ik_max_word] not found</code>。EsIndexInitializer 的
错误诊断逻辑会检测到关键词 <code>ik_max_word</code>，提示"请确认 ES 已安装 analysis-ik 插件"。</p>
<p><strong>扩展方案</strong></p>
<ul>
<li><strong>同义词扩展</strong>：配置 IK 的同义词词典，让搜索"AI"也能命中包含"人工智能"的文档。</li><li><strong>拼音分词</strong>：集成 pinyin 分词器，让用户输入拼音也能搜索中文内容。</li></ul>
<hr>` },
      { "t": "技术点 16：阿里 Embedding 模型 2048 维向量化", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：什么是 Embedding（向量化）？</strong></p>
<p>Embedding 是把文本变成一个<strong>浮点数数组</strong>（向量）的过程。</p>
<pre><code class="language-text">文本："RAG是一种检索增强生成技术"
      ↓ Embedding 模型
向量：[0.012, -0.034, 0.056, ..., 0.078]  // 2048 个浮点数</code></pre>
<p>语义相似的文本 → 向量在空间中距离近（余弦相似度高）
语义不同的文本 → 向量在空间中距离远</p>
<p>这就是向量检索的基础：把用户问题也变成向量，然后在 ES 中找"距离最近"的文档向量。</p>
<p><strong>核心代码：调用 Embedding API</strong></p>
<pre><code class="language-java">// EmbeddingClient.java - callApiOnce()

private String callApiOnce(List&lt;String&gt; batch) {
    ModelProviderConfigService.ActiveProviderView provider =
        modelProviderConfigService.getActiveProvider(ModelProviderConfigService.SCOPE_EMBEDDING);
    // provider 包含：API 地址、API Key、模型名、维度等配置

    Map&lt;String, Object&gt; requestBody = new HashMap&lt;&gt;();
    requestBody.put("model", provider.model());       // 比如 "text-embedding-v3"
    requestBody.put("input", batch);                   // 文本列表
    requestBody.put("dimension", provider.dimension()); // 2048
    requestBody.put("encoding_format", "float");

    return buildClient(provider).post()
        .uri("/embeddings")        // OpenAI 兼容的 Embedding 端点
        .bodyValue(requestBody)
        .retrieve()
        .bodyToMono(String.class)
        .retryWhen(Retry.fixedDelay(3, Duration.ofSeconds(1)))  // 失败自动重试 3 次
        .block(Duration.ofSeconds(30));  // 最多等 30 秒
}</code></pre>
<p><strong>批量处理</strong></p>
<pre><code class="language-java">// EmbeddingClient.java - embedWithUsage()

public EmbeddingUsageResult embedWithUsage(List&lt;String&gt; texts, String requesterId, UsageType usageType) {
    List&lt;float[]&gt; all = new ArrayList&lt;&gt;();
    int totalTokens = 0;

    // 按 batchSize（默认 100）分批调用 API
    for (int start = 0; start &lt; texts.size(); start += batchSize) {
        int end = Math.min(start + batchSize, texts.size());
        List&lt;String&gt; sub = texts.subList(start, end);

        // Token 配额预留
        TokenReservationBundle reservation = usageType == UsageType.QUERY
            ? rateLimitService.reserveEmbeddingQueryUsage(requesterId, sub)
            : rateLimitService.reserveEmbeddingUploadUsage(requesterId, sub);

        try {
            String response = callApiOnce(sub);
            EmbeddingApiResponse parsed = parseEmbeddingResponse(response, sub);
            usageQuotaService.settleReservation(reservation, parsed.totalTokens());  // 按实际用量结算
            all.addAll(parsed.vectors());
            totalTokens += parsed.totalTokens();
        } catch (Exception e) {
            usageQuotaService.abortReservation(reservation);  // 失败则释放预留
            throw e;
        }
    }
    return new EmbeddingUsageResult(all, totalTokens, currentModelVersion());
}</code></pre>
<p><strong>解析 API 响应</strong></p>
<pre><code class="language-java">// EmbeddingClient.java - parseEmbeddingResponse()

private EmbeddingApiResponse parseEmbeddingResponse(String response, List&lt;String&gt; inputTexts) {
    JsonNode jsonNode = objectMapper.readTree(response);
    JsonNode data = jsonNode.get("data");  // OpenAI 兼容格式

    List&lt;float[]&gt; vectors = new ArrayList&lt;&gt;();
    for (JsonNode item : data) {
        JsonNode embedding = item.get("embedding");
        float[] vector = new float[embedding.size()];  // 2048 维
        for (int i = 0; i &lt; embedding.size(); i++) {
            vector[i] = (float) embedding.get(i).asDouble();
        }
        vectors.add(vector);
    }

    // 获取 Token 用量
    JsonNode usage = jsonNode.path("usage");
    int totalTokens = usage.path("total_tokens").asInt(
        usage.path("input_tokens").asInt(0)  // 兜底字段名
    );

    return new EmbeddingApiResponse(vectors, totalTokens);
}</code></pre>
<p>API 响应格式（OpenAI 兼容）：</p>
<pre><code class="language-json">{
  "data": [
    { "embedding": [0.012, -0.034, ...], "index": 0 },
    { "embedding": [0.056, 0.078, ...], "index": 1 }
  ],
  "usage": { "total_tokens": 150 }
}</code></pre>
<p><strong>向量化完整流程</strong></p>
<pre><code class="language-java">// VectorizationService.java - vectorizeWithUsage()

public VectorizationUsageResult vectorizeWithUsage(String fileMd5, ...) {
    // 1. 从 MySQL 查出所有子切片
    List&lt;TextChunk&gt; chunks = fetchTextChunks(fileMd5);
    // SELECT * FROM document_vectors WHERE file_md5 = ? ORDER BY chunk_id ASC

    // 2. 提取文本列表
    List&lt;String&gt; texts = chunks.stream().map(TextChunk::getContent).toList();

    // 3. 批量调 Embedding API（每 100 条一批）
    EmbeddingUsageResult embeddingResult = embeddingClient.embedWithUsage(texts, ...);
    List&lt;float[]&gt; vectors = embeddingResult.vectors();

    // 4. 构建 ES 文档并批量写入
    List&lt;EsDocument&gt; esDocuments = IntStream.range(0, chunks.size())
        .mapToObj(i -&gt; new EsDocument(
            UUID.randomUUID().toString(),   // ES 文档 ID
            fileMd5,                         // 文件指纹
            chunks.get(i).getChunkId(),      // 分块序号
            chunks.get(i).getContent(),      // 文本内容
            chunks.get(i).getPageNumber(),   // 页码
            chunks.get(i).getAnchorText(),   // 锚点
            vectors.get(i),                  // 2048 维向量 ★
            embeddingResult.modelVersion(),  // 模型版本
            userId, orgTag, isPublic
        )).toList();

    elasticsearchService.bulkIndex(esDocuments);  // 批量写入 ES
}</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>从 MySQL 查出所有子切片文本，按 100 条一批调用阿里 Embedding API 生成 2048 维向量，
兼容 OpenAI 接口格式，支持失败自动重试 3 次和 Token 配额预留-结算机制，最终将文本+
向量一起写入 Elasticsearch。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么 2048 维？维度的高低有什么影响？</strong>
A：维度越高，向量能表达的语义信息越丰富，检索精度越高，但存储和计算成本也越高。
2048 维是当前主流 Embedding 模型（如通义千问 text-embedding-v3）的默认维度，在精度
和性能之间取得平衡。ES mapping 的 dims 必须和模型输出维度一致。</p>
<p><strong>Q2：batchSize 为什么设 100？</strong>
A：Embedding API 通常对单次请求的文本数量有限制（比如最多 100 条）。设太大 API 会
拒绝请求；设太小（比如 1）则 HTTP 开销太大，6000 个切片要发 6000 次请求。</p>
<p><strong>Q3：为什么用 <code>float[]</code> 而不是 <code>double[]</code>？</strong>
A：float 是 32 位，double 是 64 位。2048 维的 float 数组占 8KB，double 占 16KB。
Embedding 精度用 float 就够了，节省一半内存和存储。</p>
<p><strong>扩展方案</strong></p>
<ul>
<li><strong>异步批量向量化</strong>：当前是同步逐批调用，可以用 CompletableFuture 并发调用多个批次。</li><li><strong>本地 Embedding 模型</strong>：用 ONNX Runtime 在本地运行 Embedding 模型，避免 API 调用</li><ul><li>延迟和费用。</li></ul>
<hr>` },
      { "t": "技术点 17：KNN 向量召回", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：什么是 KNN？</strong></p>
<p>KNN（K-Nearest Neighbors，K 近邻）= 在向量空间中找到和目标向量最接近的 K 个向量。</p>
<pre><code class="language-text">用户问题："RAG的核心流程是什么？"
  ↓ Embedding
查询向量：[0.01, -0.03, 0.05, ...]  // 2048 维
  ↓ KNN 搜索
在 ES 的 knowledge_base 索引中，找到 cosine 相似度最高的 K 个文档向量</code></pre>
<p><strong>核心代码</strong></p>
<pre><code class="language-java">// HybridSearchService.java - searchWithPermission()

SearchResponse&lt;EsDocument&gt; response = esClient.search(s -&gt; {
    s.index("knowledge_base");

    // KNN 向量召回
    int recallK = topK * 30;  // 召回窗口 = topK 的 30 倍
    // 比如 topK=5 → recallK=150，先召回 150 条再精排

    s.knn(kn -&gt; kn
        .field("vector")              // 向量字段名
        .queryVector(queryVector)      // 用户问题的向量（List&lt;Float&gt;）
        .k(recallK)                    // 返回最近邻的数量
        .numCandidates(recallK)        // 搜索候选数量（越大越精确但越慢）
    );

    // 关键词过滤（必须匹配）
    s.query(q -&gt; q.bool(b -&gt; b
        .must(mst -&gt; mst.match(m -&gt; m.field("textContent").query(query)))
        // must = 必须匹配关键词（AND 语义）
        // 即使向量很近，如果文本中不含关键词也不会返回

        .filter(f -&gt; f.bool(bf -&gt; bf
            .should(s1 -&gt; s1.term(t -&gt; t.field("userId").value(userDbId)))
            .should(s2 -&gt; s2.term(t -&gt; t.field("isPublic").value(true)))
            .should(s3 -&gt; s3.bool(...))  // orgTag 过滤
        ))
        // filter = 权限过滤（不参与评分，只决定是否可见）
    ));

    // BM25 重排序（技术点18详讲）
    s.rescore(r -&gt; r
        .windowSize(recallK)
        .query(rq -&gt; rq
            .queryWeight(0.2d)
            .rescoreQueryWeight(1.0d)
            .query(rqq -&gt; rqq.match(m -&gt; m
                .field("textContent").query(query)
                .operator(Operator.And)
            ))
        )
    );

    s.size(topK);  // 最终返回 topK 条
    return s;
}, EsDocument.class);</code></pre>
<p><strong>为什么 recallK = topK × 30？</strong></p>
<pre><code class="language-text">假设用户要 topK=5 条结果：

如果直接 KNN k=5：
  → 向量最接近的 5 条，可能其中 3 条关键词不匹配被过滤掉
  → 最终只剩 2 条 → 不够

用 recallK=150：
  → 先召回向量最接近的 150 条
  → 关键词过滤后可能剩 50 条
  → BM25 重排后取前 5 条
  → 结果充足且质量高</code></pre>
<p><strong>30 倍是一个经验值</strong>，太小可能过滤后不够，太大则增加搜索延迟。</p>
<p><strong>numCandidates 的作用</strong></p>
<p>ES 的 KNN 使用 HNSW（Hierarchical Navigable Small World）近似最近邻算法，不是精确
暴力搜索。<code>numCandidates</code> 控制搜索的精度：</p>
<pre><code class="language-text">numCandidates 越大 → 搜索越精确，但越慢
numCandidates 越小 → 搜索越快，但可能漏掉一些近邻

本项目 numCandidates = recallK，意味着搜索精度和召回数量匹配</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>KNN 向量召回使用 ES 的 dense_vector 字段和 cosine 相似度，先召回 topK×30 条向量
最接近的文档（扩大召回窗口），再经过关键词过滤和权限过滤，为后续 BM25 精排提供
候选集。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么不直接用 KNN k=topK，要先召回 30 倍？</strong>
A：因为后面还有关键词 must 过滤和 BM25 重排。如果只召回 5 条，过滤后可能不够。
先召回 150 条给后续步骤更大的筛选空间，最终取 top 5。</p>
<p><strong>Q2：HNSW 是什么？和暴力搜索有什么区别？</strong>
A：HNSW 是一种近似最近邻算法，用多层图结构快速找到近邻。暴力搜索要计算与所有向量
的距离（O(N)），HNSW 通过图跳转只需 O(logN) 量级的计算。精度略低于暴力搜索，但
速度快几个数量级。</p>
<p><strong>Q3：cosine 和 euclidean（欧式距离）的区别？</strong>
A：cosine 衡量方向相似度（不受向量长度影响），适合文本语义。euclidean 衡量绝对
距离，受向量长度影响。文本检索一般用 cosine。</p>
<p><strong>扩展方案</strong></p>
<ul>
<li><strong>多路召回</strong>：除了 KNN 向量召回，还可以加一路 BM25 全文召回，两路结果合并后再精排。</li><ul><li>本项目通过 must 查询实现了类似效果。</li></ul>
<hr>` },
      { "t": "技术点 18：BM25 重排序 Rescore", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：什么是 BM25？</strong></p>
<p>BM25（Best Match 25）是一种经典的文本相关性评分算法，是 Elasticsearch 默认的搜索
评分方法。它基于 TF-IDF 改进：</p>
<ul>
<li><strong>TF（词频）</strong>：词在文档中出现越多，分越高（但有饱和效应）</li><li><strong>IDF（逆文档频率）</strong>：词在整个语料中越罕见，越重要</li></ul>
<pre><code class="language-text">搜索"RAG 检索"：
  文档A："RAG 是一种检索增强生成技术，RAG 的核心是检索" → RAG 出现 2 次，检索出现 2 次 → 高分
  文档B："今天是晴天" → 没有 RAG 也没有检索 → 0 分</code></pre>
<p><strong>为什么需要 BM25 重排？</strong></p>
<p>KNN 向量搜索擅长<strong>语义相似</strong>，但有时关键词精确匹配更重要：</p>
<pre><code class="language-text">用户搜索："Spring Boot 3.0 的新特性"

KNN 结果（按语义排序）：
  1. "Spring Boot 是一个快速开发框架..."        ← 语义相关但没有"3.0"
  2. "Java 17 的新特性包括..."                   ← 有"新特性"但主题不对
  3. "Spring Boot 3.0 引入了 AOT 编译..."        ← 精确匹配！但向量排名可能靠后

BM25 重排后：
  1. "Spring Boot 3.0 引入了 AOT 编译..."        ← "Spring"+"Boot"+"3.0"+"新特性" 全命中
  2. "Spring Boot 是一个快速开发框架..."        ← 只命中"Spring"+"Boot"
  3. "Java 17 的新特性包括..."                   ← 只命中"新特性"</code></pre>
<p>BM25 把精确包含所有关键词的文档排到前面。</p>
<p><strong>核心代码：rescore 配置</strong></p>
<pre><code class="language-java">s.rescore(r -&gt; r
    .windowSize(recallK)           // 对前 recallK 条结果重排（比如前 150 条）
    .query(rq -&gt; rq
        .queryWeight(0.2d)         // 原始 KNN 分数的权重 = 0.2
        .rescoreQueryWeight(1.0d)  // BM25 分数的权重 = 1.0
        .query(rqq -&gt; rqq.match(m -&gt; m
            .field("textContent")  // 对文本内容做 BM25
            .query(query)          // 用户搜索词
            .operator(Operator.And) // AND 语义：要求所有词都出现
        ))
    )
);</code></pre>
<p><strong>最终评分公式</strong></p>
<pre><code class="language-text">最终分数 = queryWeight × 原始KNN分数 + rescoreQueryWeight × BM25分数
         = 0.2 × KNN_score + 1.0 × BM25_score</code></pre>
<p><strong>权重设计意图</strong>：
- BM25 权重（1.0）远大于 KNN 权重（0.2）
- 这意味着关键词精确匹配的权重远高于语义相似度
- 适合知识库场景：用户搜特定术语时，精确包含该术语的文档更重要</p>
<p><strong>Operator.And 的作用</strong></p>
<pre><code class="language-java">.operator(Operator.And)
// 要求查询中的所有词都必须在文档中出现
// 搜索 "Spring Boot 3.0"：
//   AND：文档必须同时包含 "Spring" + "Boot" + "3.0" → 严格
//   OR：文档包含任一词即可 → 宽松（会召回大量不相关结果）</code></pre>
<p><strong>数据示例</strong></p>
<pre><code class="language-text">用户搜索："MinIO 分片上传"
假设 KNN 召回了 150 条候选

KNN 原始排名（按向量相似度）：
  #1 (score=0.95) "对象存储方案概述，包括 MinIO 和 S3..."
  #2 (score=0.92) "大文件上传策略，支持分片和断点续传..."
  #3 (score=0.88) "MinIO 分片上传与合并的完整流程..."
  ...

BM25 重排后（0.2×KNN + 1.0×BM25）：
  #3 → BM25 高分（"MinIO"+"分片"+"上传" 全部命中）→ 最终排第1
  #1 → BM25 中等（命中"MinIO"但没有"分片上传"）→ 排第2
  #2 → BM25 中等（命中"分片"但没有"MinIO"）→ 排第3</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>BM25 重排对 KNN 召回的前 N 条结果做二次评分，用 <code>0.2×KNN + 1.0×BM25</code> 的加权公式，
让精确包含搜索关键词的文档排名上升，弥补向量搜索在关键词精确匹配上的不足。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么不直接做 BM25 搜索，要先 KNN 再 BM25？</strong>
A：纯 BM25 只能做关键词匹配，无法理解语义。比如用户搜"如何上传文件"，BM25 无法
命中"分片上传策略"（因为"上传"和"文件"没有直接出现）。KNN 能理解语义相似性，先
召回语义相关的候选集，再用 BM25 精排提升精确匹配的排名。</p>
<p><strong>Q2：windowSize 设太大或太小有什么影响？</strong>
A：太大（如 10000）→ 对太多结果做 BM25 计算，增加延迟。太小（如 10）→ 只对前 10
条重排，可能漏掉排名靠后但 BM25 分数高的文档。recallK = topK×30 是平衡点。</p>
<p><strong>Q3：queryWeight=0.2 是怎么确定的？</strong>
A：这是经验值。设太高（如 0.8）→ KNN 语义分占主导，BM25 精排效果被稀释。设太低
（如 0.01）→ 完全忽略语义，退化为纯 BM25 搜索。0.2 保留了一定的语义信号，同时让
BM25 主导排序。</p>
<hr>` },
      { "t": "技术点 19：混合搜索三阶段", "tag": "我的整理", "p": "core", "html": `<p><strong>整体架构</strong></p>
<p>本项目的搜索不是单一方法，而是<strong>三个阶段串联</strong>：</p>
<pre><code class="language-text">用户提问 "RAG的核心流程"
  │
  ▼
阶段1：KNN 向量召回
  │ 把问题变成 2048 维向量
  │ 在 ES 中找向量最接近的 150 条（recallK = topK × 30）
  │
  ▼
阶段2：关键词 must 过滤 + 权限 filter
  │ must：文档必须包含 "RAG" 和 "核心" 和 "流程"（至少一个）
  │ filter：只看用户有权限的文档（自己的/公开的/同组织的）
  │ → 从 150 条中筛出符合条件的（可能剩 30 条）
  │
  ▼
阶段3：BM25 重排序
  │ 对这 30 条做 BM25 评分
  │ 最终分数 = 0.2 × KNN分数 + 1.0 × BM25分数
  │ → 取前 topK（如 5）条返回
  │
  ▼
最终结果：5 条最相关的知识片段</code></pre>
<p><strong>核心代码（完整版，含权限过滤）</strong></p>
<pre><code class="language-java">// HybridSearchService.java - searchWithPermission()

public List&lt;SearchResult&gt; searchWithPermission(String query, String userId, int topK) {
    // 1. 获取用户的权限信息
    List&lt;String&gt; userEffectiveTags = getUserEffectiveOrgTags(userId);
    String userDbId = getUserDbId(userId);

    // 2. 生成查询向量
    List&lt;Float&gt; queryVector = embedToVectorList(query, userId);
    if (queryVector == null) {
        // 向量生成失败 → 降级为纯文本搜索
        return textOnlySearchWithPermission(query, userDbId, userEffectiveTags, topK);
    }

    // 3. 执行三阶段搜索
    SearchResponse&lt;EsDocument&gt; response = esClient.search(s -&gt; {
        s.index("knowledge_base");
        int recallK = topK * 30;

        // ★ 阶段1：KNN 向量召回
        s.knn(kn -&gt; kn
            .field("vector")
            .queryVector(queryVector)
            .k(recallK)
            .numCandidates(recallK)
        );

        // ★ 阶段2：关键词 + 权限过滤
        s.query(q -&gt; q.bool(b -&gt; b
            .must(mst -&gt; mst.match(m -&gt; m.field("textContent").query(query)))
            .filter(f -&gt; f.bool(bf -&gt; bf
                // 权限1：用户自己的文档
                .should(s1 -&gt; s1.term(t -&gt; t.field("userId").value(userDbId)))
                // 权限2：公开文档
                .should(s2 -&gt; s2.term(t -&gt; t.field("isPublic").value(true)))
                // 权限3：同组织文档
                .should(s3 -&gt; {
                    if (userEffectiveTags.size() == 1) {
                        return s3.term(t -&gt; t.field("orgTag").value(userEffectiveTags.get(0)));
                    } else {
                        return s3.bool(inner -&gt; {
                            userEffectiveTags.forEach(tag -&gt;
                                inner.should(sh -&gt; sh.term(t -&gt; t.field("orgTag").value(tag)))
                            );
                            return inner;
                        });
                    }
                })
            ))
        ));

        // ★ 阶段3：BM25 重排序
        s.rescore(r -&gt; r
            .windowSize(recallK)
            .query(rq -&gt; rq
                .queryWeight(0.2d)
                .rescoreQueryWeight(1.0d)
                .query(rqq -&gt; rqq.match(m -&gt; m
                    .field("textContent").query(query).operator(Operator.And)
                ))
            )
        );

        s.size(topK);
        return s;
    }, EsDocument.class);

    // 4. 解析结果 + 补充文件名
    List&lt;SearchResult&gt; results = response.hits().hits().stream()
        .map(hit -&gt; new SearchResult(...))
        .toList();
    attachFileNames(results);  // 根据 fileMd5 查 MySQL 补充文件名
    return results;
}</code></pre>
<p><strong>降级策略</strong></p>
<pre><code class="language-java">// 如果向量生成失败（比如 Embedding API 不可用），降级为纯文本搜索
private List&lt;SearchResult&gt; textOnlySearchWithPermission(String query, ...) {
    SearchResponse&lt;EsDocument&gt; response = esClient.search(s -&gt; s
        .index("knowledge_base")
        .query(q -&gt; q.bool(b -&gt; b
            .must(m -&gt; m.match(ma -&gt; ma.field("textContent").query(query)))
            .filter(f -&gt; f.bool(...))  // 同样的权限过滤
        ))
        .minScore(0.3d)  // 最低相关性阈值，过滤噪声
        .size(topK),
        EsDocument.class
    );
}</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>混合搜索三阶段：KNN 向量召回（语义相似，150条候选）→ 关键词 must 过滤 + 权限 filter
（精确匹配 + 数据隔离）→ BM25 重排序（0.2×KNN + 1.0×BM25，取 top5），向量生成失败
时自动降级为纯 BM25 文本搜索。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：KNN 和 query 同时使用时，ES 怎么合并结果？</strong>
A：在 ES 8.x 中，knn 和 query 同时使用时，ES 会分别计算 KNN 分数和 query 分数，
然后取并集（union）。最终分数由 rescore 阶段重新计算。</p>
<p><strong>Q2：权限过滤为什么用 filter 而不是 must？</strong>
A：filter 不参与评分（只是"是否可见"的判断），且 ES 会缓存 filter 结果（因为权限
条件变化不频繁），性能更好。must 既参与评分又参与过滤，不适合权限判断。</p>
<p><strong>Q3：如果用户搜的关键词完全不在知识库中会怎样？</strong>
A：KNN 可能召回语义接近的结果，但 must 要求关键词匹配，如果所有文档都不含关键词
→ 结果为空。降级策略会尝试纯文本搜索，如果还是空则返回空列表。</p>
<hr>` },
      { "t": "技术点 20：ES Bulk API 批量索引", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么不用单条写入？</strong></p>
<pre><code class="language-java">// ❌ 低效：一条一条写
for (EsDocument doc : documents) {
    esClient.index(i -&gt; i.index("knowledge_base").document(doc));
    // 每条都是一次 HTTP 请求 → 6000 条 = 6000 次网络往返 → 极慢
}</code></pre>
<pre><code class="language-java">// ✅ 高效：批量写
BulkRequest request = BulkRequest.of(b -&gt; b.operations(operations));
esClient.bulk(request);
// 6000 条打包成一次 HTTP 请求 → 1 次网络往返 → 快几十倍</code></pre>
<p><strong>核心代码</strong></p>
<pre><code class="language-java">// ElasticsearchService.java - bulkIndex()

public void bulkIndex(List&lt;EsDocument&gt; documents) {
    // 构建批量操作列表
    List&lt;BulkOperation&gt; bulkOperations = documents.stream()
        .map(doc -&gt; BulkOperation.of(op -&gt; op.index(idx -&gt; idx
            .index("knowledge_base")  // 目标索引
            .id(doc.getId())          // 文档 ID（UUID）
            .document(doc)            // 文档内容
        )))
        .toList();

    // 执行批量请求
    BulkRequest request = BulkRequest.of(b -&gt; b.operations(bulkOperations));
    BulkResponse response = esClient.bulk(request);

    // 检查是否有部分失败
    if (response.errors()) {
        for (BulkResponseItem item : response.items()) {
            if (item.error() != null) {
                logger.error("文档索引失败 - ID: {}, 错误: {}",
                    item.id(), item.error().reason());
            }
        }
        throw new RuntimeException("批量索引部分失败");
    }
}</code></pre>
<p><strong>删除文档也用 Bulk</strong></p>
<pre><code class="language-java">// 按 fileMd5 删除一个文件的所有分片
public void deleteByFileMd5(String fileMd5) {
    esClient.deleteByQuery(d -&gt; d
        .index("knowledge_base")
        .query(q -&gt; q.term(t -&gt; t.field("fileMd5").value(fileMd5)))
    );
    // DELETE FROM knowledge_base WHERE fileMd5 = 'a1b2c3...'
}</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>使用 ES Bulk API 将多条索引操作打包成一次 HTTP 请求，显著减少网络往返次数；批量
写入后逐条检查响应，发现部分失败时记录错误并抛异常。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：Bulk 一次最多能写多少条？</strong>
A：ES 没有硬性限制，但建议单次 Bulk 不超过 5-15MB 或 500-1000 条。太大可能导致
ES 节点内存压力。本项目的 batchSize=100 在合理范围内。</p>
<p><strong>Q2：如果 Bulk 中有一条失败了，其他条会怎样？</strong>
A：Bulk 是"部分成功"语义——一条失败不影响其他条。所以代码中检查 <code>response.errors()</code>
并遍历每条结果，找出具体失败的文档。</p>
<hr>` },
      { "t": "完整链路总结", "tag": "我的整理", "p": "core", "html": `<pre><code class="language-text">[MySQL document_vectors 表]
  │  子切片文本 + 元数据
  ▼
[VectorizationService]
  │ 16. 从 MySQL 查出所有子切片
  │     → 每 100 条一批调 Embedding API → 生成 2048 维向量
  │
  ▼
[ElasticsearchService]
  │ 20. Bulk API 批量写入 ES
  │     → knowledge_base 索引（15. IK 分词器 + dense_vector）
  │
  ▼
[用户提问]
  │
  │ 16. 问题 → Embedding API → 2048 维查询向量
  │
  ▼
[HybridSearchService]
  │ 17. 阶段1：KNN 向量召回（topK×30 = 150 条候选）
  │ 19. 阶段2：关键词 must 过滤 + 权限 filter
  │ 18. 阶段3：BM25 重排序（0.2×KNN + 1.0×BM25）
  │     → 取 top 5 条返回
  │
  ▼
[5 条最相关的知识片段] → 送入 RAG Prompt → LLM 生成回答</code></pre>` }
    ]
  });

  mine.chapters.push({
    "no": "4",
    "title": "四、RAG 对话与 Agent 智能体（9个技术点）（技术点 21–29 · 10 节）",
    "questions": [
      { "t": "技术点 21：ReAct Agent 循环", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：什么是 ReAct？</strong></p>
<p>ReAct（Reasoning + Acting）= 推理 + 行动。</p>
<p>传统的 RAG 是"一条直线"：</p>
<pre><code class="language-text">用户提问 → 检索 → 把结果拼进 Prompt → LLM 生成回答</code></pre>
<p>ReAct Agent 是"一个循环"：</p>
<pre><code class="language-text">用户提问
  → LLM 思考：我需要先检索知识库
  → 调用 search_knowledge 工具 → 拿到检索结果
  → LLM 思考：结果还不够，我需要生成摘要
  → 调用 generate_summary 工具 → 拿到摘要
  → LLM 思考：信息够了，直接回答
  → 输出最终回答 → 循环结束</code></pre>
<p><strong>核心区别</strong>：普通 RAG 是"先检索再回答"的固定流程，ReAct 让 <strong>LLM 自己决定下一步
做什么</strong>——可以多次检索、可以调用多个工具、可以边推理边调整。</p>
<p><strong>核心代码：ReAct 循环主流程</strong></p>
<pre><code class="language-java">// ChatHandler.java - runReActLoop()

private void runReActLoop(String userId, String userMessage, String conversationId,
                          String generationId, List&lt;Map&lt;String, String&gt;&gt; history,
                          CompletableFuture&lt;String&gt; responseFuture) {

    // 1. 构建初始 messages（System Prompt + 历史 + 用户问题）
    List&lt;Map&lt;String, Object&gt;&gt; messages = llmProviderRouter.buildReActMessages(
        userMessage, "", history, buildRecentFeedbackGuidance(userId)
    );

    int executedToolCalls = 0;  // 已执行的工具调用次数
    int totalPromptTokens = 0;  // 累计 Prompt Token
    int totalCompletionTokens = 0;

    // 2. 最多循环 MAX_REACT_ROUNDS（4）轮
    for (int round = 1; round &lt;= MAX_REACT_ROUNDS; round++) {
        // 2.1 检查用户是否点了"停止"
        if (finishCancelledGeneration(generationId, responseFuture, responseBuilders.get(generationId))) {
            return;  // 已停止，直接结束
        }

        // 2.2 调用 LLM，拿到这一轮的"决策"（可能调工具，也可能直接回答）
        LlmProviderRouter.ReActTurn turn = streamReActTurnBlocking(
            userId, conversationId, generationId, messages, agentToolRegistry.getTools()
        );

        if (turn.toolCalls().isEmpty()) {
            // ★ LLM 决定不再调工具 → 这就是最终回答 → 收尾
            finalizeResponse(userId, userMessage, conversationId, generationId,
                responseFuture, responseBuilders.get(generationId), completion);
            return;
        }

        // 2.3 LLM 决定调工具 → 把 assistant 的消息加入对话
        messages.add(turn.assistantMessage());

        // 2.4 逐个执行工具调用
        for (LlmProviderRouter.ToolCallDecision toolCall : turn.toolCalls()) {
            ExecutedToolResult result;
            if (executedToolCalls &gt;= MAX_REACT_TOOL_CALLS) {
                // 工具调用预算用尽（8次）→ 不让执行了
                result = new ExecutedToolResult("工具调用预算已用尽，请基于已有结果给出最终回答。", false);
            } else {
                result = executeToolForReAct(userId, userMessage, generationId, conversationId, toolCall);
                executedToolCalls++;
            }
            // 把工具结果作为 tool message 加入对话
            messages.add(toolMessage(toolCall.id(), result.content()));
        }
        // 回到第 2 步，进入下一轮循环
    }

    // 3. 4 轮都用完了还没给出最终回答 → 强制收尾
    messages.add(Map.of("role", "user",
        "content", "ReAct 轮次预算已用尽，请不要再调用工具，直接基于已有 tool 结果给出最终回答。"));
    LlmProviderRouter.ReActTurn finalTurn = streamReActTurnBlocking(
        userId, conversationId, generationId, messages, List.of()  // 不再提供工具
    );
    finalizeResponse(...);
}</code></pre>
<p><strong>用数据走一遍完整对话</strong></p>
<p><strong>用户提问</strong>："帮我总结一下知识库里关于文件上传的内容"</p>
<pre><code class="language-text">┌─────────────────────────────────────────────────────────────┐
│ 第1轮：LLM 收到问题，思考："总结内容需要先查知识库"          │
│   决定：调用 search_knowledge(query="文件上传", topK=5)     │
│   → 执行工具 → 返回 5 个检索片段                           │
│   → 片段作为 tool message 加入 messages                    │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ 第2轮：LLM 看到检索结果，思考："片段够了，需要生成结构化摘要" │
│   决定：调用 generate_summary(topic="文件上传", maxDocs=5)  │
│   → 执行工具 → DeepSeek 内部生成摘要 → 流式输出给前端        │
│   → 摘要作为 tool message 加入 messages                    │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ 第3轮：LLM 看到摘要，思考："摘要已生成，直接回答"            │
│   决定：不再调用工具（toolCalls 为空）                      │
│   → 输出最终回答 → 循环结束                                  │
└─────────────────────────────────────────────────────────────┘</code></pre>
<p><strong>两个关键预算限制</strong></p>
<pre><code class="language-java">private static final int MAX_REACT_ROUNDS = 4;      // 最多 4 轮推理
private static final int MAX_REACT_TOOL_CALLS = 8;  // 最多 8 次工具调用</code></pre>
<p>为什么要限制？
- LLM 可能陷入死循环（反复调同一个工具）
- 每轮都要花钱（Token 消耗）
- 用户等太久体验差</p>
<p>预算用尽时的兜底：</p>
<pre><code class="language-java">// 4 轮用完 → 强制要求 LLM 直接回答
messages.add(Map.of("role", "user",
    "content", "ReAct 轮次预算已用尽，请不要再调用工具，直接基于已有 tool 结果给出最终回答。"));
// 并且不再传 tools → LLM 想调也没得调</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>ReAct Agent 循环让 LLM 自主决策：每轮先推理（决定做什么），再行动（调用工具），
把工具结果作为 tool message 反馈给模型，直到模型决定直接回答为止；用最大 4 轮推理
+ 8 次工具调用的预算防止死循环，预算用尽时强制模型基于已有结果收尾。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：ReAct 和普通 RAG 的本质区别？</strong>
A：普通 RAG 是固定的"检索→生成"两段式流程，检索词由程序硬编码。ReAct 由 LLM 动态
决策：它可以决定检索什么、检索几次、是否调用其他工具（如生成摘要、记录反馈），
最后再回答。相当于把"决定怎么做"的能力交给了模型。</p>
<p><strong>Q2：为什么不限制轮次？不限制会怎样？</strong>
A：LLM 有时会陷入循环（比如反复调用同一个工具），导致无限消耗 Token、用户无限等待。
限制 4 轮 + 8 次工具调用是成本和体验的平衡。</p>
<p><strong>Q3：工具执行失败了怎么办？</strong>
A：不会中断整个循环。失败信息会作为 tool message 返回给模型，模型看到错误后可以
决定重试、换一种 query 或者直接基于已有结果回答。代码中还有"摘要已部分流式输出"
的特殊处理：直接收尾，避免拼接出"半个摘要+新摘要"。</p>
<hr>` },
      { "t": "技术点 22：OpenAI Function Calling 工具协议", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：什么是 Function Calling？</strong></p>
<p>Function Calling（函数调用）是 OpenAI 定义的一种协议：<strong>把工具的描述告诉 LLM，
LLM 决定是否调用、调用哪个、传什么参数</strong>。</p>
<pre><code class="language-text">请求（包含工具描述）：
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "search_knowledge",
        "description": "在知识库中搜索相关文档片段...",
        "parameters": {
          "type": "object",
          "properties": {
            "query": { "type": "string", "description": "检索语句" },
            "topK": { "type": "integer", "description": "返回数量" }
          },
          "required": ["query"]
        }
      }
    }
  ],
  "tool_choice": "auto"
}

LLM 响应（决定调用）：
{
  "message": {
    "content": null,
    "tool_calls": [
      {
        "id": "call_123",
        "function": {
          "name": "search_knowledge",
          "arguments": "{\\"query\\": \\"文件上传\\", \\"topK\\": 5}"
        }
      }
    ]
  }
}</code></pre>
<p><strong>核心代码：构建 tools 请求</strong></p>
<pre><code class="language-java">// LlmProviderRouter.java - buildReActRequest()

private Map&lt;String, Object&gt; buildReActRequest(String model,
        List&lt;Map&lt;String, Object&gt;&gt; messages,
        List&lt;AgentToolRegistry.AgentTool&gt; tools,
        int maxCompletionTokens, boolean stream) {
    Map&lt;String, Object&gt; request = new LinkedHashMap&lt;&gt;();
    request.put("model", model);
    request.put("messages", messages);
    request.put("stream", stream);
    request.put("max_tokens", Math.max(maxCompletionTokens, 1));

    if (tools != null &amp;&amp; !tools.isEmpty()) {
        // 把工具列表转换为 OpenAI 格式
        request.put("tools", buildOpenAiTools(tools));
        request.put("tool_choice", "auto");
        // tool_choice: auto = 让 LLM 自己决定是否调用工具
        // 另一种是 "required" = 强制调用工具
    }
    return request;
}</code></pre>
<p><strong>核心代码：把 AgentTool 转成 OpenAI 格式</strong></p>
<pre><code class="language-java">// LlmProviderRouter.java - buildOpenAiTools()

private List&lt;Map&lt;String, Object&gt;&gt; buildOpenAiTools(List&lt;AgentToolRegistry.AgentTool&gt; tools) {
    List&lt;Map&lt;String, Object&gt;&gt; openAiTools = new ArrayList&lt;&gt;();

    for (AgentToolRegistry.AgentTool tool : tools) {
        Map&lt;String, Object&gt; function = new LinkedHashMap&lt;&gt;();
        function.put("name", tool.name());              // 工具名
        function.put("description", tool.description()); // 工具描述
        function.put("parameters", tool.parameters());   // 参数 JSON Schema

        Map&lt;String, Object&gt; toolSchema = new LinkedHashMap&lt;&gt;();
        toolSchema.put("type", "function");              // 类型：function
        toolSchema.put("function", function);
        openAiTools.add(toolSchema);
    }
    return openAiTools;
}</code></pre>
<p><strong>核心代码：解析 LLM 返回的 tool_calls</strong></p>
<pre><code class="language-java">// LlmProviderRouter.java - parseReActTurn()

List&lt;ToolCallDecision&gt; toolCalls = new ArrayList&lt;&gt;();
JsonNode toolCallsNode = messageNode.path("tool_calls");

if (toolCallsNode.isArray()) {
    for (JsonNode call : toolCallsNode) {
        JsonNode function = call.path("function");
        String name = function.path("name").asText("");
        String argumentsJson = function.path("arguments").asText("{}");

        // 参数是 JSON 字符串，需要反序列化
        Map&lt;String, Object&gt; arguments = objectMapper.readValue(
            argumentsJson, new TypeReference&lt;Map&lt;String, Object&gt;&gt;() {}
        );

        toolCalls.add(new ToolCallDecision(
            call.path("id").asText(""),  // tool_call_id
            name,                        // 工具名
            arguments                    // 参数 Map
        ));
    }
}</code></pre>
<p><strong>流式 tool_calls 的拼接</strong></p>
<pre><code class="language-java">// LlmProviderRouter.java - ReActStreamAccumulator.appendToolCallDelta()

private void appendToolCallDelta(JsonNode delta) {
    // 流式响应中 tool_calls 是分片到达的，需要按 index 拼接
    int index = delta.path("index").asInt(toolCalls.size());

    // 同一个 index 的多次 delta 会拼到同一个 StreamingToolCall
    StreamingToolCall toolCall = toolCalls.computeIfAbsent(index, ignored -&gt; new StreamingToolCall());

    // 名字可能分片到达：["search_", "knowledge"] → "search_knowledge"
    toolCall.name.append(function.path("name").asText(""));

    // 参数也是分片到达：["{\\"query\\":\\"文", "件上传\\"}"] → 完整 JSON
    toolCall.arguments.append(function.path("arguments").asText(""));
}</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>项目采用 OpenAI Function Calling 协议：把工具的名称、描述、参数 Schema 传给 LLM，
LLM 自主决定是否调用及传什么参数；响应中的 tool_calls 包含工具名和 JSON 参数，
流式响应时按 index 拼接分片到达的工具名和参数。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：<code>tool_choice: auto</code> 和 <code>required</code> 的区别？</strong>
A：auto 让 LLM 自己判断是否需要调工具（可以只聊天不调工具）。required 强制 LLM
必须调用工具，适合"每个问题都必须检索"的场景。本项目用 auto + Prompt 引导（告诉
模型"默认必须先检索"）。</p>
<p><strong>Q2：流式 tool_calls 拼接会不会出问题？</strong>
A：可能。流式响应中一个工具的名字和参数会被拆成多个 delta，必须按 index 分组拼接。
如果不拼接，只取最后一个 delta，会得到残缺的工具名和参数（解析 JSON 失败）。</p>
<p><strong>Q3：如果 LLM 返回了不存在的工具名怎么办？</strong>
A：AgentToolRegistry.executeTool() 会抛 <code>IllegalArgumentException("未注册的工具")</code>，
被上层 catch 后作为失败信息返回给模型，模型看到错误后会重新决策。</p>
<hr>` },
      { "t": "技术点 23：AgentToolRegistry 工具注册表", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：什么是工具注册表？</strong></p>
<p>Agent 需要"知道自己有哪些工具可用"。工具注册表就是一个<strong>工具列表 + 工具执行器的
映射表</strong>：通过工具名找到对应的执行函数。</p>
<p><strong>核心代码：注册 4 个工具</strong></p>
<pre><code class="language-java">// AgentToolRegistry.java - 构造方法

public AgentToolRegistry(...) {
    // 1. 工具列表（发给 LLM 的描述信息）
    this.tools = List.of(
        searchKnowledgeTool(),     // 知识库搜索
        generateSummaryTool(),     // 生成摘要
        submitFeedbackTool(),      // 提交反馈
        knowledgeStatsTool()       // 知识库统计
    );

    // 2. 工具名 → 执行器的映射
    this.handlers = Map.of(
        "search_knowledge",  this::executeSearchKnowledge,
        "generate_summary",  this::executeGenerateSummary,
        "submit_feedback",   this::executeSubmitFeedback,
        "knowledge_stats",   this::executeKnowledgeStats
    );
}</code></pre>
<p><strong>核心代码：工具执行入口</strong></p>
<pre><code class="language-java">// AgentToolRegistry.java - executeTool()

public ToolExecutionResult executeTool(String name, Map&lt;String, Object&gt; arguments,
                                       String userId, Consumer&lt;String&gt; onChunk) {
    ToolHandler handler = handlers.get(name);
    if (handler == null) {
        throw new IllegalArgumentException("未注册的工具: " + name);
    }
    return handler.execute(
        arguments == null ? Collections.emptyMap() : arguments,
        userId, onChunk
    );
}</code></pre>
<p><strong>4 个工具的详细定义</strong></p>
<p><strong>工具1：search_knowledge（知识库搜索）</strong></p>
<pre><code class="language-java">private AgentTool searchKnowledgeTool() {
    return new AgentTool(
        "search_knowledge",  // 工具名
        "在知识库中搜索与用户问题相关的文档片段。当用户问题的答案可能依赖已上传资料、"
        + "企业/项目/产品/系统内部信息、专有名词、事实依据...时应调用；"
        + "普通问候、闲聊、纯创作、翻译、通用代码/常识问题...时不要调用。",
        // ↑ description 描述得非常详细，引导 LLM 正确决定是否调用

        objectSchema(Map.of(
            "query", stringSchema("用于知识库检索的查询语句。应保留用户原话中的核心实体..."),
            "topK", integerSchema("返回的片段数量，默认 5。")
        ), List.of("query"))  // query 是必填参数
    );
}</code></pre>
<p>执行逻辑：</p>
<pre><code class="language-java">private ToolExecutionResult executeSearchKnowledge(Map&lt;String, Object&gt; arguments,
        String userId, Consumer&lt;String&gt; onChunk) {
    requireUserId(userId);  // 必须登录
    String query = getRequiredString(arguments, "query");  // 必填参数
    int topK = getInt(arguments, "topK", 5, 1, 20);  // 默认5，范围1-20

    // 调用混合搜索（带权限过滤）
    List&lt;SearchResult&gt; results = hybridSearchService.searchWithPermission(query, userId, topK);

    return new ToolExecutionResult(
        "search_knowledge", true,
        formatSearchResults(results),  // 格式化后的文本（给 LLM 看）
        Map.of("query", query, "topK", topK, "results", results)  // 原始数据（给系统用）
    );
}</code></pre>
<p><strong>工具2：generate_summary（生成摘要）</strong></p>
<pre><code class="language-java">private ToolExecutionResult executeGenerateSummary(Map&lt;String, Object&gt; arguments,
        String userId, Consumer&lt;String&gt; onChunk) {
    String topic = getRequiredString(arguments, "topic");
    int maxDocs = getInt(arguments, "maxDocs", 5, 1, 20);

    // 1. 先检索相关片段
    List&lt;SearchResult&gt; results = hybridSearchService.searchWithPermission(topic, userId, maxDocs);

    // 2. 再调 DeepSeek 生成结构化摘要（内部二次调用 LLM）
    String summary = deepSeekClient.summarize(userId, topic, results, onChunk);

    return new ToolExecutionResult("generate_summary", true,
        "主题：" + topic + "\\n检索片段数：" + results.size() + "\\n\\n" + summary,
        Map.of("topic", topic, "sourceCount", results.size(), "sources", results),
        onChunk != null  // 摘要是否已流式输出给用户
    );
}</code></pre>
<p><strong>工具3：submit_feedback（记录用户反馈）</strong></p>
<pre><code class="language-java">private ToolExecutionResult executeSubmitFeedback(Map&lt;String, Object&gt; arguments,
        String userId, Consumer&lt;String&gt; onChunk) {
    String rating = getRequiredString(arguments, "rating").toLowerCase();
    if (!"good".equals(rating) &amp;&amp; !"bad".equals(rating)) {
        throw new IllegalArgumentException("rating 只允许 good 或 bad");
    }
    String reason = getOptionalString(arguments, "reason");

    // 存到 Redis Hash：feedback:{userId} → field=时间戳, value=评价内容
    String key = "feedback:" + userId;
    String field = String.valueOf(System.currentTimeMillis());
    String value = reason == null ? "rating=" + rating : "rating=" + rating + "; reason=" + reason;
    stringRedisTemplate.opsForHash().put(key, field, value);

    return new ToolExecutionResult("submit_feedback", true, "已记录用户反馈: " + value, data);
}</code></pre>
<p><strong>工具4：knowledge_stats（知识库统计）</strong></p>
<pre><code class="language-java">private ToolExecutionResult executeKnowledgeStats(Map&lt;String, Object&gt; arguments,
        String userId, Consumer&lt;String&gt; onChunk) {
    // 查询 ES 索引统计信息
    IndicesStatsResponse stats = elasticsearchClient.indices().stats(s -&gt; s.index("knowledge_base"));
    long documentCount = fileUploadRepository.count();       // MySQL 文档数
    long fragmentCount = docStats.count();                   // ES 片段数
    Long storeSize = storeStats.sizeInBytes();               // ES 存储大小

    return new ToolExecutionResult("knowledge_stats", true,
        "知识库统计：\\n- MySQL 文档总数：" + documentCount
        + "\\n- ES 片段总数：" + fragmentCount
        + "\\n- ES 存储大小：" + storeSize, data);
}</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>AgentToolRegistry 以"工具名 → 执行器"映射表的形式注册了 4 个工具：search_knowledge
（混合检索）、generate_summary（检索+二次调LLM生成摘要）、submit_feedback（反馈入
Redis Hash）、knowledge_stats（查询ES/MySQL统计），每个工具都包含给 LLM 看的描述
和给程序执行的处理器。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么工具的描述要写得那么详细？</strong>
A：LLM 根据 description 决定是否调用工具。描述写得模糊，LLM 可能该调不调、不该调
乱调。详细描述（什么时候该调、什么时候不该调、参数怎么填）能显著提高工具调用的
准确率。</p>
<p><strong>Q2：新增一个工具需要改哪些地方？</strong>
A：三步：① 写一个 <code>xxxTool()</code> 方法定义工具描述和参数 Schema；② 写一个
<code>executeXxx()</code> 方法实现执行逻辑；③ 把工具加进 <code>tools</code> 列表和 <code>handlers</code> 映射。
得益于注册表模式，新增工具不需要改其他任何代码（开闭原则）。</p>
<p><strong>Q3：工具执行结果为什么要同时返回格式化文本和原始数据？</strong>
A：格式化文本给 LLM 看（作为 tool message 内容，模型能理解）；原始数据给系统用
（比如 search_knowledge 的 results 列表要用于构建引用映射 referenceMappings）。</p>
<hr>` },
      { "t": "技术点 24：强制检索策略 + 白名单例外", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：RAG 系统的一个常见问题</strong></p>
<p>很多 RAG 系统回答质量问题来自"模型没检索就回答"：
- 模型基于自己的训练数据回答，而不是知识库内容
- 用户问"我们公司的报销流程" → 模型凭想象编造流程</p>
<p>解决思路：<strong>通过 System Prompt 强制模型先检索知识库，再基于检索结果回答。</strong></p>
<p><strong>核心代码：System Prompt 中的强制检索规则</strong></p>
<pre><code class="language-java">// LlmProviderRouter.java - buildReActMessages()

StringBuilder sysBuilder = new StringBuilder();
if (promptCfg.getRules() != null) {
    sysBuilder.append(promptCfg.getRules()).append("\\n\\n");
}

sysBuilder.append("本系统是「知识库优先」的问答助手：你的首要职责是基于本系统已收录的资料回答用户。"
    + "除非命中下方明确的白名单，否则**每一个用户问题都必须先调用 search_knowledge**，"
    + "再基于检索结果作答。\\n\\n")

    .append("强制检索原则（默认行为）：\\n")
    .append("1. 默认调用 search_knowledge：只要问题涉及任何实体、名称、缩写、产品、项目、"
        + "术语、流程、功能、实现、背景、对比、引用，或包含「这/它/该/上述/这个/那个」"
        + "等上下文指代，无论你是否自认为已知答案，都必须先检索。\\n")
    .append("2. 构造 query 时严格保留用户原话中的核心名词、缩写和限定词，禁止替换为泛化关键词。\\n")
    .append("3. 用户要求整理、总结、归纳、提炼知识库内容时，先用 search_knowledge 圈定材料，"
        + "再调用 generate_summary 生成总结。\\n\\n")

    .append("可以跳过 search_knowledge 的白名单（必须严格匹配其一，否则一律检索）：\\n")
    .append("- 纯打招呼或寒暄（你好/谢谢/再见等）；\\n")
    .append("- 纯翻译请求（把 X 翻译为 Y），且不涉及本系统术语；\\n")
    .append("- 与本系统材料无关的纯创作请求（写诗、写段子等）；\\n")
    .append("- 通用编程语法、数学计算等完全不依赖任何专有信息的常识题；\\n")
    .append("- 用户在本轮明确表示「不要查知识库 / 直接回答」。\\n\\n")

    .append("回答与异常处理：\\n")
    .append("- 只要 search_knowledge 返回了片段，必须基于片段作答并按来源编号标注，"
        + "禁止回答「知识库暂无相关信息」。\\n")
    .append("- 只有工具明确返回零片段时，才说明暂无相关材料并提示用户补充线索。\\n")
    .append("- 工具失败时根据错误信息决定下一步（重试 / 换 query / 继续推理），不要直接中断。\\n")
    .append("拿到 tool 结果后继续推理并给出最终回答。\\n\\n");</code></pre>
<p><strong>这个 Prompt 的设计逻辑</strong></p>
<pre><code class="language-text">┌────────────────────────────────────────────┐
│ 默认行为：必须检索                          │
│  - 涉及实体/名称/术语/流程/指代词 → 先检索   │
│  - "无论你是否自认为已知答案"               │
├────────────────────────────────────────────┤
│ 白名单例外：可以不检索                      │
│  - 打招呼："你好"                          │
│  - 翻译请求："把X翻译成Y"                  │
│  - 创作请求："写首诗"                      │
│  - 常识题："1+1等于几"                     │
│  - 用户明确说"不要查知识库"                 │
├────────────────────────────────────────────┤
│ 回答规范：                                  │
│  - 有片段 → 必须基于片段 + 标注来源编号     │
│  - 零片段 → 才可以说"暂无相关信息"          │
│  - 工具失败 → 重试/换query，不中断          │
└────────────────────────────────────────────┘</code></pre>
<p><strong>为什么白名单很重要？</strong></p>
<p>如果"一律强制检索"（tool_choice: required），会出现：</p>
<pre><code class="language-text">用户："你好" → LLM 被迫调用 search_knowledge("你好") → 检索一堆无关内容 → 浪费
用户："帮我写首关于春天的诗" → 被迫检索"春天" → 返回无关片段 → 写诗质量下降</code></pre>
<p>白名单让模型对"明显不需要知识库的问题"跳过检索，<strong>节省 Token 并提升体验</strong>。</p>
<p><strong>检索词构造规范</strong></p>
<p>Prompt 里还规定了检索词的构造方法：</p>
<pre><code class="language-text">"构造 query 时严格保留用户原话中的核心名词、缩写和限定词，禁止替换为泛化关键词"

用户问："我们系统的分片上传是怎么实现的？"
好的 query："分片上传 实现"（保留核心名词）
坏的 query："系统 功能"（泛化，检索不到具体内容）</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>通过 System Prompt 实现"知识库优先"策略：默认强制 LLM 先调用 search_knowledge
再回答（即使模型自认为知道答案），同时设置白名单例外（寒暄/翻译/创作/常识/用户明确
要求），并规范检索词构造和回答格式，避免模型凭空编造。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：Prompt 引导和代码强制哪个更好？</strong>
A：Prompt 引导灵活但不可靠（LLM 可能不遵守），代码强制可靠但不灵活。本项目用
Prompt 为主 + tool_choice: auto 的组合：靠详细规则引导 LLM 判断，保留 auto 让模型
有跳过检索的自由度（配合白名单）。</p>
<p><strong>Q2：如果模型就是不检索直接回答怎么办？</strong>
A：这是 Prompt 工程的局限。可以用 tool_choice: "required" 强制，但会误伤白名单
场景。更稳妥的做法是在输出后校验：如果检索结果为空且回答中没有任何引用标注，
提示用户"该回答未基于知识库"。</p>
<p><strong>扩展方案</strong></p>
<ul>
<li><strong>路由层判断</strong>：在进入 ReAct 前，先用一个小模型或规则判断"这个问题是否需要检索"，</li><ul><li>不需要的直接走普通对话，减少 LLM 轮次消耗。</li></ul>
<hr>` },
      { "t": "技术点 25：RAG Prompt 拼装", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：RAG 的 Prompt 结构</strong></p>
<pre><code class="language-text">System Message（系统角色）：
  "你是企业知识库助手，请基于以下参考资料回答..."
  &lt;&lt;REF&gt;&gt;
  [1] (文件A.pdf | 第3页) RAG是一种检索增强生成技术...
  [2] (文件B.docx) 其核心流程分为三步...
  &lt;&lt;END&gt;&gt;

History（历史对话）：
  user: "什么是RAG？"
  assistant: "RAG是..."

User Message（当前问题）：
  "RAG的核心流程是什么？"</code></pre>
<p>检索结果被包裹在 <code>&lt;&lt;REF&gt;&gt;...&lt;&lt;END&gt;&gt;</code> 标记中，LLM 看到标记就知道这是"参考资料"。</p>
<p><strong>核心代码：拼装 System Message</strong></p>
<pre><code class="language-java">// LlmProviderRouter.java - buildMessages()

private List&lt;Map&lt;String, String&gt;&gt; buildMessages(String userMessage,
        String context, List&lt;Map&lt;String, String&gt;&gt; history) {
    List&lt;Map&lt;String, String&gt;&gt; messages = new ArrayList&lt;&gt;();
    AiProperties.Prompt promptCfg = aiProperties.getPrompt();

    StringBuilder sysBuilder = new StringBuilder();
    if (promptCfg.getRules() != null) {
        sysBuilder.append(promptCfg.getRules()).append("\\n\\n");
    }

    // 检索结果包裹在 &lt;&lt;REF&gt;&gt; ... &lt;&lt;END&gt;&gt; 中
    String refStart = promptCfg.getRefStart() != null ? promptCfg.getRefStart() : "&lt;&lt;REF&gt;&gt;";
    String refEnd = promptCfg.getRefEnd() != null ? promptCfg.getRefEnd() : "&lt;&lt;END&gt;&gt;";

    sysBuilder.append(refStart).append("\\n");
    if (context != null &amp;&amp; !context.isEmpty()) {
        sysBuilder.append(context);  // 检索结果片段
    } else {
        sysBuilder.append(promptCfg.getNoResultText() != null
            ? promptCfg.getNoResultText() : "（本轮无检索结果）").append("\\n");
    }
    sysBuilder.append(refEnd);

    messages.add(Map.of("role", "system", "content", sysBuilder.toString()));

    // 历史对话（原样加入）
    if (history != null &amp;&amp; !history.isEmpty()) {
        messages.addAll(history);
    }

    // 当前用户问题
    messages.add(Map.of("role", "user", "content", userMessage));
    return messages;
}</code></pre>
<p><strong>核心代码：格式化检索片段（含页码和编号）</strong></p>
<pre><code class="language-java">// ChatHandler.java - buildContext()

private String buildContext(List&lt;SearchResult&gt; searchResults, String generationId, String userMessage) {
    if (searchResults == null || searchResults.isEmpty()) {
        return "";  // 无结果 → 走"无检索结果"逻辑
    }

    StringBuilder context = new StringBuilder();
    for (int i = 0; i &lt; searchResults.size(); i++) {
        SearchResult result = searchResults.get(i);

        // 截断过长的片段（最多 300 字符）
        String snippet = result.getTextContent();
        if (snippet.length() &gt; MAX_CONTEXT_SNIPPET_LEN) {
            snippet = snippet.substring(0, MAX_CONTEXT_SNIPPET_LEN) + "…";
        }

        String fileLabel = result.getFileName() != null ? result.getFileName() : "unknown";
        Integer pageNum = result.getPageNumber();

        // 格式：[1] (文件A.pdf | 第3页) 内容...
        if (pageNum != null &amp;&amp; pageNum &gt; 0) {
            context.append(String.format("[%d] (%s | 第%d页) %s\\n", i + 1, fileLabel, pageNum, snippet));
        } else {
            context.append(String.format("[%d] (%s) %s\\n", i + 1, fileLabel, snippet));
        }
    }
    return context.toString();
}</code></pre>
<p><strong>最终发给 LLM 的完整请求体</strong></p>
<pre><code class="language-json">{
  "model": "deepseek-chat",
  "messages": [
    {
      "role": "system",
      "content": "你是企业知识库问答助手，请基于以下资料回答用户问题，并在回答中标注来源编号。\\n\\n&lt;&lt;REF&gt;&gt;\\n[1] (技术手册.pdf | 第3页) RAG是一种检索增强生成技术，它通过从知识库中检索相关文档片段来增强生成质量。\\n[2] (架构说明.docx) 其核心流程分为三步：查询理解、文档检索、答案生成。\\n&lt;&lt;END&gt;&gt;"
    },
    {
      "role": "user",
      "content": "RAG的核心流程是什么？"
    }
  ],
  "stream": true,
  "temperature": 0.7
}</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>RAG Prompt 拼装把检索结果格式化为 <code>[编号] (文件名 | 页码) 片段内容</code> 的格式，
用 <code>&lt;&lt;REF&gt;&gt;...&lt;&lt;END&gt;&gt;</code> 标记包裹后放入 System Message，与历史对话和当前问题一起
发给 LLM，无检索结果时替换为"无结果"提示文案。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么检索结果要放进 System Message 而不是 User Message？</strong>
A：System Message 表示系统级指令和背景信息，LLM 会把它当作"事实来源"；User Message
是用户的话。把资料放 System 里，模型更倾向于基于资料回答而非与用户对话。另外
System Message 在 API 中通常不占用上下文窗口的历史配额。</p>
<p><strong>Q2：片段为什么要截断到 300 字符？</strong>
A：每轮对话可用的上下文窗口（如 8K token）有限。5 个片段 × 300 字符 ≈ 1500 字符，
加上历史对话和问题，要控制在窗口内。截断过长片段可以塞进更多片段。</p>
<p><strong>Q3：<code>[编号]</code> 格式有什么用？</strong>
A：LLM 回答时会引用编号（"根据资料[1]...")，系统把编号映射到具体的 fileMd5、页码
（技术点28引用溯源），前端可以展示可点击的引用。</p>
<hr>` },
      { "t": "技术点 26：WebSocket 实时双向通信", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：HTTP vs WebSocket</strong></p>
<pre><code class="language-text">HTTP（一问一答）：
  浏览器 → 请求 → 服务器 → 响应 → 连接关闭
  下次需要再发新请求 → 服务器不能主动推送

WebSocket（双向长连接）：
  浏览器 ←→ 服务器（建立一次连接，长期保持）
  浏览器可以随时发消息
  服务器也可以随时推送（无需等待请求）</code></pre>
<p>聊天场景为什么用 WebSocket？
- LLM 生成回答是流式的（一个字一个字输出），服务器要<strong>主动推送</strong>每个字
- HTTP 做不到服务器主动推送（除非用 SSE 或轮询）</p>
<p><strong>核心代码：连接建立 + JWT 鉴权</strong></p>
<pre><code class="language-java">// ChatWebSocketHandler.java - afterConnectionEstablished()

@Override
public void afterConnectionEstablished(WebSocketSession session) {
    // 1. 从 URL 中提取 JWT Token
    // 前端连接地址：ws://localhost:8081/chat/{jwtToken}
    String jwtToken = extractToken(session);

    // 2. 校验 Token 有效性
    if (!jwtUtils.validateToken(jwtToken)) {
        session.close(CloseStatus.POLICY_VIOLATION);  // 无效 → 关闭连接
        return;
    }

    // 3. 提取用户 ID
    String userId = extractUserId(jwtToken);

    // 4. 注册会话（userId → WebSocketSession 映射）
    chatSessionRegistry.registerSession(userId, session);

    // 5. 发送连接确认消息
    session.sendMessage(new TextMessage(
        "{\\"type\\":\\"connection\\",\\"sessionId\\":\\"...\\",\\"message\\":\\"连接已建立\\"}"
    ));
}</code></pre>
<p><strong>核心代码：接收消息（心跳 + 停止指令 + 普通消息）</strong></p>
<pre><code class="language-java">// ChatWebSocketHandler.java - handleTextMessage()

protected void handleTextMessage(WebSocketSession session, TextMessage message) {
    String userId = extractUserId(extractToken(session));
    String payload = message.getPayload();

    // 1. 心跳消息：只用于保活连接，不进入聊天链路
    if (HEARTBEAT_PING.equals(payload)) {  // "__chat_ping__"
        session.sendMessage(new TextMessage(HEARTBEAT_PONG));  // 回 "__chat_pong__"
        return;
    }

    // 2. JSON 格式 → 可能是系统指令
    if (payload.trim().startsWith("{")) {
        Map&lt;String, Object&gt; jsonMessage = objectMapper.readValue(payload, Map.class);
        String messageType = (String) jsonMessage.get("type");
        String internalToken = (String) jsonMessage.get("_internal_cmd_token");

        // 只有带正确内部令牌的 stop 指令才处理（防止伪造）
        if ("stop".equals(messageType) &amp;&amp; INTERNAL_CMD_TOKEN.equals(internalToken)) {
            chatHandler.stopResponse(userId, generationId);  // 停止生成
            return;
        }
    }

    // 3. 普通聊天消息 → 交给 ChatHandler 处理
    chatHandler.processMessage(userId, payload, session);
}</code></pre>
<p><strong>核心代码：向用户推送消息</strong></p>
<pre><code class="language-java">// ChatSessionRegistry.java - sendJsonToUser()

private final ConcurrentHashMap&lt;String, WebSocketSession&gt; sessions = new ConcurrentHashMap&lt;&gt;();
// ConcurrentHashMap：线程安全的 Map（多个线程同时推送时不会冲突）

public void sendJsonToUser(String userId, Map&lt;String, ?&gt; payload) {
    WebSocketSession session = sessions.get(userId);
    if (session == null || !session.isOpen()) {
        return;  // 用户离线，跳过
    }

    synchronized (session) {  // 同一连接的消息按顺序发送
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(payload)));
    }
}</code></pre>
<p><strong>消息类型一览</strong></p>
<div class="table-wrap"><table>
<thead><tr><th>类型</th><th>方向</th><th>内容</th></tr></thead>
<tbody>
<tr><td><code>connection</code></td><td>服务器→客户端</td><td>连接建立确认 + sessionId</td></tr>
<tr><td><code>start</code></td><td>服务器→客户端</td><td>生成任务开始（含 generationId）</td></tr>
<tr><td><code>chunk</code></td><td>服务器→客户端</td><td>LLM 流式输出的文本片段</td></tr>
<tr><td><code>tool_call</code></td><td>服务器→客户端</td><td>工具调用状态（executing/success/failed）</td></tr>
<tr><td><code>completion</code></td><td>服务器→客户端</td><td>生成完成（含引用映射）</td></tr>
<tr><td><code>error</code></td><td>服务器→客户端</td><td>错误信息</td></tr>
<tr><td><code>stop</code></td><td>服务器→客户端</td><td>停止确认</td></tr>
<tr><td><code>__chat_ping__</code></td><td>客户端→服务器</td><td>心跳</td></tr>
<tr><td><code>__chat_pong__</code></td><td>服务器→客户端</td><td>心跳响应</td></tr>
<tr><td>stop 指令</td><td>客户端→服务器</td><td>用户点停止按钮</td></tr>
</tbody></table></div>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>基于 Spring WebSocket 实现实时双向通信：连接建立时校验 JWT 并注册 userId→Session
映射，服务器通过该映射随时向用户推送流式文本、工具状态、完成通知等消息；消息分为
心跳保活、内部停止指令（带防伪令牌）和普通聊天消息三类。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么用 WebSocket 而不是 SSE？</strong>
A：SSE（Server-Sent Events）是单向的（只能服务器→浏览器），适合纯流式输出。
WebSocket 是双向的，本项目还需要前端发"停止"指令给服务器，所以需要双向能力。</p>
<p><strong>Q2：心跳机制的作用？</strong>
A：WebSocket 长连接可能被中间的网络设备（防火墙、负载均衡）空闲断开。心跳消息
定期发送，让连接保持活跃状态，也用来检测连接是否真的断了。</p>
<p><strong>Q3：一个用户开多个标签页会怎样？</strong>
A：<code>sessions</code> 是 <code>ConcurrentHashMap&lt;String, WebSocketSession&gt;</code>，一个 userId 只能
对应一个 session，后打开的标签页会覆盖前一个。如果要多标签页支持，需要改成
<code>Map&lt;String, List&lt;WebSocketSession&gt;&gt;</code> 并广播给所有连接。</p>
<hr>` },
      { "t": "技术点 27：LLM 流式生成 + 主动取消 + 超时控制", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：流式生成是什么？</strong></p>
<p>普通请求（一次性）：</p>
<pre><code class="language-text">浏览器 → 请求 → [等待 5 秒...] → 收到完整回答（2000字）→ 白屏 5 秒</code></pre>
<p>流式请求（SSE）：</p>
<pre><code class="language-text">浏览器 → 请求 → 收到"你" → 收到"好" → 收到"，我" → ...（边生成边显示）</code></pre>
<p>用户体验：流式让用户感觉"AI 在打字"，不用干等。</p>
<p><strong>核心代码：WebClient 流式接收</strong></p>
<pre><code class="language-java">// LlmProviderRouter.java - streamResponse()

Disposable subscription = buildClient(provider)
    .post()
    .uri("/chat/completions")
    .contentType(MediaType.APPLICATION_JSON)
    .bodyValue(request)          // stream: true
    .retrieve()
    .bodyToFlux(String.class)     // ★ 响应体是 Flux（响应式流）
    .subscribe(
        chunk -&gt; processChunk(chunk, usageTracker, onChunk),  // 每个数据块
        error -&gt; { settleUsage(usageTracker); onError.accept(error); },  // 出错
        () -&gt; { settleUsage(usageTracker); onComplete.accept(completion); }  // 完成
    );</code></pre>
<p><code>bodyToFlux(String.class)</code> 会把 SSE 流拆成一个个数据块（chunk），每收到一个就回调
<code>processChunk</code>。这就是"边生成边推送"的基础。</p>
<p><strong>核心代码：解析 SSE 数据块</strong></p>
<pre><code class="language-java">// LlmProviderRouter.java - processChunk()

private void processChunk(String rawChunk, StreamUsageTracker usageTracker, Consumer&lt;String&gt; onChunk) {
    // SSE 格式：
    // data: {"choices":[{"delta":{"content":"你"}}]}
    // data: {"choices":[{"delta":{"content":"好"}}]}
    // data: [DONE]

    for (String payload : extractPayloads(rawChunk)) {
        if ("[DONE]".equals(payload)) continue;  // 流结束标记

        JsonNode node = objectMapper.readTree(payload);
        String content = node.path("choices").path(0)
            .path("delta").path("content").asText("");

        if (!content.isEmpty()) {
            usageTracker.responseContent.append(content);  // 累积完整响应
            onChunk.accept(content);  // 推送给前端
        }
    }
}</code></pre>
<p><strong>核心代码：超时控制（120 秒）</strong></p>
<pre><code class="language-java">// ChatHandler.java - streamReActTurnBlocking()

CompletableFuture&lt;LlmProviderRouter.ReActTurn&gt; turnFuture = new CompletableFuture&lt;&gt;();
LlmProviderRouter.StreamHandle streamHandle = llmProviderRouter.streamReActTurn(..., turnFuture::complete);
activeStreams.put(generationId, streamHandle);

long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(120);  // 120秒截止

while (true) {
    if (isGenerationCancelled(generationId)) {
        streamHandle.cancel();  // 用户停止了 → 取消上游请求
        return null;
    }

    long remaining = deadline - System.nanoTime();
    if (remaining &lt;= 0) {
        streamHandle.cancel();  // 超时 → 取消
        throw new RuntimeException("模型响应超时，请稍后重试");
    }

    try {
        // 每 200ms 轮询一次（短轮询用于及时响应停止操作）
        return turnFuture.get(Math.min(remaining/1000000, 200), TimeUnit.MILLISECONDS);
    } catch (TimeoutException ignored) {
        // 超时未完成 → 继续循环检查停止标志
    }
}</code></pre>
<p><strong>核心代码：主动取消（用户点停止）</strong></p>
<pre><code class="language-java">// ChatHandler.java - stopResponse()

public void stopResponse(String userId, String generationId) {
    // 1. 设置取消标记
    cancelledGenerations.add(generationId);
    stopFlags.put(generationId, true);
    chatGenerationStateService.markCancelled(generationId);

    // 2. 取消上游 LLM 请求（WebClient 的 Disposable）
    LlmProviderRouter.StreamHandle streamHandle = activeStreams.get(generationId);
    if (streamHandle != null) {
        streamHandle.cancel();  // subscription.dispose() → 断开上游连接
    }

    // 3. 完成 future（标记取消）
    CompletableFuture&lt;String&gt; responseFuture = responseFutures.get(generationId);
    if (responseFuture != null &amp;&amp; !responseFuture.isDone()) {
        responseFuture.completeExceptionally(new CancellationException("响应已停止"));
    }

    // 4. 通知前端
    chatSessionRegistry.sendJsonToUser(userId, Map.of("type", "stop", ...));
}</code></pre>
<p><strong>取消的完整链路</strong></p>
<pre><code class="language-text">用户点"停止"按钮
  │
  ▼
前端 → WebSocket 发送 stop 指令（带内部令牌）
  │
  ▼
ChatWebSocketHandler 校验令牌 → chatHandler.stopResponse()
  │
  ├── 1. 设置 cancelledGenerations + stopFlags（内存标记）
  ├── 2. activeStreams.get(generationId).cancel() → subscription.dispose()
  │      → 断开与 LLM API 的连接（停止上游扣费）
  ├── 3. responseFuture.completeExceptionally() → 异步任务感知取消
  │
  ▼
ReAct 循环中各处检查 isGenerationCancelled()
  → 返回提前结束 → cleanupGenerationState() 清理内存</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>用 WebClient 的 bodyToFlux 流式接收 LLM 的 SSE 响应，每收到一个 chunk 就推送给
前端；通过 CompletableFuture + 200ms 短轮询实现 120 秒超时控制；用户点停止时
通过 Disposable 断开上游请求并标记取消状态，各层异步任务检查标记后优雅退出。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么用 200ms 短轮询而不是直接阻塞等待 future？</strong>
A：如果 <code>future.get(120s)</code> 直接阻塞，用户在这 120 秒内点"停止"，也要等 get 返回
才能处理。200ms 轮询可以每 200ms 检查一次停止标志，最大 200ms 延迟响应停止操作。</p>
<p><strong>Q2：取消上游请求有什么好处？</strong>
A：LLM API 按 Token 计费。如果用户停止但不断开上游连接，模型还会继续生成，白白
消耗 Token 和费用。dispose() 断开连接可以立即停止上游计费。</p>
<p><strong>Q3：cancelledGenerations 和 stopFlags 有什么区别？</strong>
A：两者都是取消标记，stopFlags 是历史遗留的简单方案，cancelledGenerations 是
ConcurrentHashMap.newKeySet() 线程安全的集合。代码中两个都检查（OR 关系），
属于"双保险"设计。</p>
<hr>` },
      { "t": "技术点 28：引用溯源映射", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么需要引用溯源？</strong></p>
<p>LLM 回答如果只是"纯文本"，用户无法验证答案是否正确、来自哪份文档。</p>
<pre><code class="language-text">没有引用： "文件上传支持分片和断点续传。"
有引用：   "文件上传支持分片和断点续传。[1]"
            ↑ 用户点击 [1] → 查看来源文档、页码、定位到原文</code></pre>
<p>引用溯源 = 让 AI 的每个回答都能"追根溯源"。</p>
<p><strong>核心代码：检索时建立编号映射</strong></p>
<pre><code class="language-java">// ChatHandler.java - buildContext()

Map&lt;Integer, ReferenceInfo&gt; referenceMapping = new HashMap&lt;&gt;();

for (int i = 0; i &lt; searchResults.size(); i++) {
    SearchResult result = searchResults.get(i);
    String snippet = ...;  // 截断到 300 字符

    // 格式：[1] (文件名 | 第X页) 内容...
    context.append(String.format("[%d] (%s | 第%d页) %s\\n", i + 1, fileLabel, pageNum, snippet));

    // ★ 建立编号 → 来源信息的映射
    if (result.getFileMd5() != null) {
        ReferenceInfo detail = buildReferenceInfo(result, fileLabel, userMessage);
        referenceMapping.put(i + 1, detail);  // [1] → fileMd5 + 页码 + ...
    }
}

// 保存到内存 Map 和 Redis
generationReferenceMappings.put(generationId, referenceMapping);
chatGenerationStateService.updateReferenceMappings(generationId, toSerializableReferenceMappings(referenceMapping));</code></pre>
<p><strong>核心代码：ReferenceInfo 记录的内容</strong></p>
<pre><code class="language-java">// ChatHandler.java - buildReferenceInfo()

private ReferenceInfo buildReferenceInfo(SearchResult result, String fileLabel, String userMessage) {
    String matchedChunkText = trimToMaxLength(
        result.getMatchedChunkText() != null ? result.getMatchedChunkText() : result.getTextContent(),
        800  // 匹配片段最多 800 字符
    );
    String evidenceSnippet = buildEvidenceSnippet(userMessage, result.getAnchorText(), matchedChunkText);

    return new ReferenceInfo(
        result.getFileMd5(),       // 文件 MD5（唯一标识）
        fileLabel,                 // 文件名
        result.getPageNumber(),    // 页码
        result.getAnchorText(),    // 锚点文本
        result.getRetrievalMode(), // 检索方式（HYBRID / TEXT_ONLY）
        buildRetrievalLabel(result.getRetrievalMode()),  // "混合召回" / "关键词召回"
        normalizeEvidenceText(userMessage),  // 用户问题
        matchedChunkText,          // 命中的片段文本
        evidenceSnippet,           // 证据摘要（用于展示）
        result.getScore(),         // 相关度分数
        result.getChunkId()        // 分块 ID
    );
}</code></pre>
<p><strong>核心代码：前端点击引用 → 查 MD5</strong></p>
<pre><code class="language-java">// ChatHandler.java - getReferenceDetail()

public ReferenceInfo getReferenceDetail(String generationId, int referenceNumber) {
    // 1. 先查内存 Map
    Map&lt;Integer, ReferenceInfo&gt; mapping = generationReferenceMappings.get(generationId);
    if (mapping == null) {
        // 2. 内存没有 → 查 Redis（生成状态服务里存了一份）
        mapping = chatGenerationStateService.getGeneration(generationId)
            .map(GenerationSnapshot::referenceMappings)
            .filter(m -&gt; !m.isEmpty())
            .map(this::toReferenceInfoMap)
            .orElse(null);
    }

    // 3. 按编号取出
    return mapping != null ? mapping.get(referenceNumber) : null;
}</code></pre>
<p><strong>数据流转全景</strong></p>
<pre><code class="language-text">检索结果（5条）
  │
  ▼
buildContext() 拼 Prompt 时：
  [1] (技术手册.pdf | 第3页) RAG是一种...
  [2] (架构说明.docx) 核心流程分为三步...
  [3] ...
  │
  ▼
referenceMapping = {1: {fileMd5, fileName, page, ...}, 2: {...}, 3: {...}}
  │
  ├── 存入内存 ConcurrentHashMap（generationReferenceMappings）
  ├── 存入 Redis（chatGenerationStateService，30分钟TTL）
  └── 生成完成后序列化存入 MySQL（conversation 表的 referenceMappingsJson）
  │
  ▼
前端收到完成通知时拿到 referenceMappings
  │
  ▼
用户点击回答中的 [1] → 前端调接口 → 后端 getReferenceDetail() → 返回文件+页码+锚点
  → 前端打开 PDF 预览定位到第 3 页</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>检索结果拼入 Prompt 时按 <code>[编号]</code> 格式标注，同时建立"编号 → fileMd5+文件名+页码+
锚点+分数"的引用映射，保存在内存、Redis 和 MySQL 三层；用户点击回答中的引用编号
即可定位到来源文档的具体位置。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：引用映射为什么存三份？</strong>
A：内存 Map 最快（生成进行中实时查询）；Redis 有 30 分钟 TTL（生成结束后短时间内
还能查）；MySQL 永久（历史对话中引用仍然可点击）。三层对应三种时效需求。</p>
<p><strong>Q2：如果模型回答时引用了不存在的编号怎么办？</strong>
A：getReferenceDetail() 返回 null，前端处理为"引用不可用"。模型一般会引用 Prompt
中提供的编号，如果编造编号就无法溯源。</p>
<hr>` },
      { "t": "技术点 29：用户反馈闭环", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：什么是反馈闭环？</strong></p>
<pre><code class="language-text">用户回答质量差
  → 用户点"踩" + 写原因
  → 系统记录反馈
  → 下次对话时把反馈注入 Prompt
  → 模型参考反馈调整回答方式
  → 回答质量提升 → 新的反馈...</code></pre>
<p>这是一个持续优化的循环：<strong>AI 从用户的评价中学习，调整自己的回答行为。</strong></p>
<p><strong>第一步：记录反馈（submit_feedback 工具）</strong></p>
<pre><code class="language-java">// AgentToolRegistry.java - executeSubmitFeedback()

private ToolExecutionResult executeSubmitFeedback(Map&lt;String, Object&gt; arguments,
        String userId, Consumer&lt;String&gt; onChunk) {
    String rating = getRequiredString(arguments, "rating").toLowerCase();
    if (!"good".equals(rating) &amp;&amp; !"bad".equals(rating)) {
        throw new IllegalArgumentException("rating 只允许 good 或 bad");
    }
    String reason = getOptionalString(arguments, "reason");

    // 存 Redis Hash：feedback:{userId}
    // field = 当前时间戳（用于排序）
    // value = "rating=good; reason=很准确"
    String key = "feedback:" + userId;
    String field = String.valueOf(System.currentTimeMillis());
    String value = reason == null
        ? "rating=" + rating
        : "rating=" + rating + "; reason=" + reason;
    stringRedisTemplate.opsForHash().put(key, field, value);

    return new ToolExecutionResult("submit_feedback", true, "已记录用户反馈: " + value, data);
}</code></pre>
<p><strong>第二步：读取反馈并注入 Prompt</strong></p>
<pre><code class="language-java">// ChatHandler.java - buildRecentFeedbackGuidance()

private String buildRecentFeedbackGuidance(String userId) {
    // 从 Redis 读取该用户最近的反馈
    Map&lt;Object, Object&gt; feedbackEntries = redisTemplate.opsForHash().entries("feedback:" + userId);
    if (feedbackEntries.isEmpty()) return "";

    StringBuilder guidance = new StringBuilder("近期用户对回答的显式反馈如下，按时间倒序排列，越靠前越新。")
        .append("good 表示用户认可这类回答方式，bad 表示需要避免类似问题；")
        .append("如果同一轮回答既有 good 又有 bad，以最新一条为准。\\n");

    feedbackEntries.entrySet().stream()
        .sorted(Comparator.comparingLong(entry -&gt; -parseFeedbackTimestamp(entry.getKey())))
        // 按时间戳倒序（最新在前）
        .limit(5)  // 只取最近 5 条
        .forEach(entry -&gt; guidance.append("- feedbackTime=").append(entry.getKey())
            .append("; ").append(entry.getValue()).append("\\n"));

    return guidance.toString().trim();
}</code></pre>
<p><strong>第三步：注入 ReAct 的 System Prompt</strong></p>
<pre><code class="language-java">// ChatHandler.java - runReActLoop()

List&lt;Map&lt;String, Object&gt;&gt; messages = llmProviderRouter.buildReActMessages(
    userMessage,
    "",
    history,
    buildRecentFeedbackGuidance(userId)  // ★ 反馈作为 feedbackGuidance 传入
);</code></pre>
<pre><code class="language-java">// LlmProviderRouter.java - buildReActMessages()

public List&lt;Map&lt;String, Object&gt;&gt; buildReActMessages(String userMessage, String context,
        List&lt;Map&lt;String, String&gt;&gt; history, String feedbackGuidance) {
    ...
    if (feedbackGuidance != null &amp;&amp; !feedbackGuidance.isBlank()) {
        sysBuilder.append(feedbackGuidance.trim()).append("\\n\\n");
        // "近期用户对回答的显式反馈如下，按时间倒序排列..."
        // "- feedbackTime=1712345678; rating=bad; reason=回答太冗长"
        // 模型看到后会调整回答风格
    }
    ...
}</code></pre>
<p><strong>完整闭环流程</strong></p>
<pre><code class="language-text">① 用户提问
  │
  ▼
② 读取 Redis 最近 5 条反馈 → 注入 System Prompt
  │  "近期用户反馈：bad - 回答太冗长" → 模型知道要简洁
  ▼
③ 生成回答 → 流式推送
  │
  ▼
④ 用户点赞/点踩（前端按钮）
  │
  ▼
⑤ 前端 → WebSocket/HTTP → LLM 调用 submit_feedback 工具
  │  或直接调反馈接口
  ▼
⑥ Redis Hash 记录：feedback:{userId} → {时间戳: "rating=bad; reason=太冗长"}
  │
  ▼
⑦ 回到② → 下次对话时新的反馈生效</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>用户点赞/点踩通过 submit_feedback 工具写入 Redis Hash（时间戳作 field 便于排序），
每次对话前读取最近 5 条反馈注入 System Prompt，让 LLM 参考用户偏好调整回答方式，
形成"反馈→学习→改进→再反馈"的闭环。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：反馈为什么不存 MySQL 只存 Redis？</strong>
A：反馈是"短期行为偏好"数据，时效性要求高（最近的反馈才重要），Redis Hash 支持
按时间戳排序和快速读写。如果需要长期分析（比如统计回答质量趋势），可以加定时任务
把 Redis 数据同步到 MySQL。</p>
<p><strong>Q2：反馈如何影响回答？真的有效吗？</strong>
A：反馈以文本形式注入 Prompt，模型会参考"用户不喜欢冗长回答"这类信息调整输出。
效果取决于模型的理解能力，但这是 Prompt 层面最直接的"个性化"手段。更深层的方式
是用反馈数据微调模型，成本高很多。</p>
<p><strong>扩展方案</strong></p>
<ul>
<li><strong>反馈驱动检索重排</strong>：如果用户频繁对某类问题点踩，可以降低该类片段的检索权重。</li><li><strong>人工标注管理后台</strong>：管理员查看所有用户的反馈，人工分析质量问题并优化检索/Prompt。</li></ul>
<hr>` },
      { "t": "完整链路总结", "tag": "我的整理", "p": "core", "html": `<pre><code class="language-text">用户提问
  │
  ▼
[ChatWebSocketHandler] 26. WebSocket 接收消息
  │ 校验 JWT → 心跳 → 普通消息
  ▼
[ChatHandler.processMessage]
  │ 限流检查 → 创建会话 → 创建 generation（Redis 状态）
  │ 29. 读取用户反馈 → 注入 Prompt
  ▼
[runReActLoop] 21. ReAct 循环（最多4轮）
  │
  ├── 22. 构建 OpenAI tools 请求 → 24. System Prompt（强制检索+白名单）
  │    → 25. 检索片段 [N] 格式拼入 &lt;&lt;REF&gt;&gt;...&lt;&lt;END&gt;&gt;
  │    → 27. 流式调用 LLM（bodyToFlux）
  │
  ├── LLM 决定调工具 → 23. AgentToolRegistry 执行
  │    → search_knowledge → 28. 建立引用映射
  │    → generate_summary → 流式输出摘要
  │    → 工具结果作为 tool message 返回模型
  │
  ├── LLM 决定回答 → 26. chunk 消息推送前端
  │
  └── 用户点停止 → 27. Disposable 取消上游 + 标记取消
  │
  ▼
[finalizeResponse]
  │ 28. 引用映射 → MySQL 持久化（含引用JSON）
  │ → Redis 会话历史更新 → 完成通知推送给前端</code></pre>` }
    ]
  });

  mine.chapters.push({
    "no": "5",
    "title": "五、对话历史管理（5个技术点）（技术点 30–34 · 6 节）",
    "questions": [
      { "t": "技术点 30：Redis + MySQL 双层存储", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么要存两层？</strong></p>
<p>对话历史有两种不同的使用场景，对存储的要求完全不同：</p>
<div class="table-wrap"><table>
<thead><tr><th>场景</th><th>要求</th><th>适合的存储</th></tr></thead>
<tbody>
<tr><td><strong>多轮对话上下文</strong>：下一轮对话要引用之前的对话</td><td>读取快、更新频繁、只要最近几条</td><td>Redis（内存）</td></tr>
<tr><td><strong>历史记录查询</strong>：用户翻看昨天的对话</td><td>永久保存、量大、偶尔查询</td><td>MySQL（磁盘）</td></tr>
</tbody></table></div>
<p>只用一个存储的问题：
- 只存 Redis：重启/淘汰就丢，用户历史记录没了
- 只存 MySQL：每轮对话都要查库，多轮对话频繁读写性能差</p>
<p>所以项目用双层存储：
- <strong>Redis</strong>：<code>conversation:{conversationId}</code> → 短期上下文（7天TTL），供多轮对话使用
- <strong>MySQL</strong>：<code>conversations</code> 表 → 永久持久化，供历史记录查询</p>
<p><strong>Redis 层：会话上下文</strong></p>
<pre><code class="language-java">// ChatHandler.java - getConversationHistoryRecords()

private List&lt;Map&lt;String, Object&gt;&gt; getConversationHistoryRecords(String conversationId) {
    String key = "conversation:" + conversationId;
    String json = redisTemplate.opsForValue().get(key);
    // Redis Key 举例：conversation:uuid-xxxxx
    // Value 是一个 JSON 数组：
    // [{"role":"user","content":"什么是RAG？","timestamp":"..."},
    //  {"role":"assistant","content":"RAG是...","timestamp":"..."}]

    if (json == null) {
        return new ArrayList&lt;&gt;();  // 没有历史
    }
    return objectMapper.readValue(json, new TypeReference&lt;List&lt;Map&lt;String, Object&gt;&gt;&gt;() {});
}</code></pre>
<p><strong>Redis 层：写入并设置 TTL</strong></p>
<pre><code class="language-java">// ChatHandler.java - updateConversationHistory()

private void updateConversationHistory(String conversationId, String userMessage,
        String response, Map&lt;Integer, ReferenceInfo&gt; referenceMapping) {
    String key = "conversation:" + conversationId;

    // 1. 读出旧历史
    List&lt;Map&lt;String, Object&gt;&gt; history = getConversationHistoryRecords(conversationId);

    // 2. 追加用户消息
    Map&lt;String, Object&gt; userMsgMap = new HashMap&lt;&gt;();
    userMsgMap.put("role", "user");
    userMsgMap.put("content", userMessage);
    userMsgMap.put("timestamp", now);
    history.add(userMsgMap);

    // 3. 追加助手回复（带引用映射）
    Map&lt;String, Object&gt; assistantMsgMap = new HashMap&lt;&gt;();
    assistantMsgMap.put("role", "assistant");
    assistantMsgMap.put("content", response);
    assistantMsgMap.put("timestamp", now);
    if (referenceMapping != null &amp;&amp; !referenceMapping.isEmpty()) {
        assistantMsgMap.put("referenceMappings", toSerializableReferenceMappings(referenceMapping));
    }
    history.add(assistantMsgMap);

    // 4. 限制历史长度：最多 20 条
    if (history.size() &gt; 20) {
        history = history.subList(history.size() - 20, history.size());
    }

    // 5. 序列化写回 Redis，TTL = 7 天
    String json = objectMapper.writeValueAsString(history);
    redisTemplate.opsForValue().set(key, json, Duration.ofDays(7));
}</code></pre>
<p><strong>MySQL 层：Conversation 实体</strong></p>
<pre><code class="language-java">// Conversation.java

@Entity
@Table(name = "conversations", indexes = {
    @Index(name = "idx_user_id", columnList = "user_id"),
    @Index(name = "idx_timestamp", columnList = "timestamp"),
    @Index(name = "idx_conversation_id", columnList = "conversation_id")
})
public class Conversation {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;                    // 自增主键

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;                  // 关联用户

    @Column(nullable = false, columnDefinition = "TEXT")
    private String question;            // 用户提问

    @Column(nullable = false, columnDefinition = "TEXT")
    private String answer;              // 系统回答

    @Column(name = "conversation_id", length = 64)
    private String conversationId;      // 逻辑会话ID

    @Column(name = "reference_mappings_json", columnDefinition = "LONGTEXT")
    private String referenceMappingsJson;  // 引用映射（JSON字符串）

    @CreationTimestamp
    private LocalDateTime timestamp;    // 对话时间
}</code></pre>
<p><strong>MySQL 层：写入</strong></p>
<pre><code class="language-java">// ConversationService.java - saveConversation()

@Transactional
public void recordConversation(Long userId, String question, String answer,
        String conversationId, Map&lt;String, Map&lt;String, Object&gt;&gt; referenceMappings) {
    User user = userRepository.findById(userId)
        .orElseThrow(() -&gt; new CustomException("User not found", HttpStatus.NOT_FOUND));

    Conversation conversation = new Conversation();
    conversation.setUser(user);
    conversation.setQuestion(question);
    conversation.setAnswer(answer);
    conversation.setConversationId(conversationId);
    conversation.setReferenceMappingsJson(writeReferenceMappings(referenceMappings));

    conversationRepository.save(conversation);
    // 一条消息一行：用户问 + 系统答 作为一条记录

    updateSessionTitleIfDefault(conversationId, question);  // 更新会话标题
    touchSessionUpdatedAt(conversationId);                  // 更新时间戳
}</code></pre>
<p><strong>MySQL 数据示例</strong></p>
<pre><code class="language-text">conversations 表：
┌────┬─────────┬────────────────────┬────────────────────┬──────────────────┬────────────────────────┐
│ id │ user_id │ question           │ answer             │ conversation_id  │ reference_mappings_json│
├────┼─────────┼────────────────────┼────────────────────┼──────────────────┼────────────────────────┤
│ 1  │ 1       │ 什么是RAG？        │ RAG是检索增强生成… │ uuid-a1b2        │ {"1":{"fileMd5":"...",…}}│
│ 2  │ 1       │ 文件怎么上传？     │ 支持分片上传…      │ uuid-a1b2        │ {"1":{"fileMd5":"...",…}}│
│ 3  │ 1       │ RAG的核心流程？    │ 分为三步…          │ uuid-c3d4        │ null                     │
└────┴─────────┴────────────────────┴────────────────────┴──────────────────┴────────────────────────┘</code></pre>
<p><strong>双层存储对比</strong></p>
<div class="table-wrap"><table>
<thead><tr><th>维度</th><th>Redis</th><th>MySQL</th></tr></thead>
<tbody>
<tr><td>Key/表</td><td><code>conversation:{id}</code></td><td><code>conversations</code> 表</td></tr>
<tr><td>存储内容</td><td>最近 20 条消息的完整 JSON</td><td>每条对话一行</td></tr>
<tr><td>生命周期</td><td>7 天 TTL</td><td>永久</td></tr>
<tr><td>读取频率</td><td>每轮对话都读（上下文）</td><td>用户打开历史页时读</td></tr>
<tr><td>数据结构</td><td>JSON 数组（整存整取）</td><td>关系型（可按用户/时间查询）</td></tr>
</tbody></table></div>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>对话历史双层存储：Redis 存最近 20 条消息的 JSON 数组（7 天 TTL）供多轮对话快速
读取上下文，MySQL 的 conversations 表永久保存每条问答（含引用映射 JSON）供历史
记录查询，各司其职。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么 Redis 存 JSON 数组而不是每条消息一个 Key？</strong>
A：多轮对话的上下文需要"一次读取全部"（整存整取），JSON 数组一次 GET 就拿到全部
历史。如果每条消息一个 Key，读上下文要 N 次查询或用到 Hash/Lua 脚本，复杂度高。
更新也是整数组重写，简单直接。</p>
<p><strong>Q2：Redis 数据丢了怎么办？</strong>
A：MySQL 有永久数据。Redis 丢失后，如果用户重新进入该会话，可以<strong>从 MySQL 重建</strong>
Redis 缓存（按 conversationId 查 MySQL，序列化写入 Redis）。本项目当前没有实现这个
重建逻辑，是一个可改进点。</p>
<p><strong>Q3：为什么 TTL 设 7 天？</strong>
A：多轮对话是短期行为，超过 7 天的会话基本不会继续聊。7 天后 Redis 自动清理，
节省内存。如果用户想继续旧会话，可以从 MySQL 加载历史。</p>
<hr>` },
      { "t": "技术点 31：MySQL 优先 + Redis 补充（一致性保证）", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：分布式系统的数据一致性问题</strong></p>
<p>写两份数据（Redis + MySQL）时最大的坑是<strong>不一致</strong>：</p>
<pre><code class="language-text">场景1（先写 Redis 后写 MySQL）：
  Redis 写入成功 → MySQL 写入失败
  → Redis 有新对话，MySQL 没有 → 历史记录缺失

场景2（先写 MySQL 后写 Redis）：
  MySQL 写入成功 → Redis 写入失败
  → MySQL 有记录，Redis 上下文缺失 → 下一轮对话上下文不完整

场景3（并发写）：
  两个线程同时写 → 顺序混乱</code></pre>
<p><strong>本项目的一致性策略：MySQL 成功才写 Redis</strong></p>
<pre><code class="language-java">// ChatHandler.java - finalizeResponse()

// 1. 先把消息落 MySQL（事务）
boolean persisted = persistConversation(
    userId, userMessage, completeResponse, conversationId, referenceMappings
);
// persistConversation 内部调 conversationService.recordConversation()
// 失败返回 false

// 2. 只有 MySQL 成功后才写 Redis
if (persisted) {
    updateConversationHistory(conversationId, userMessage, completeResponse, referenceMappings);
} else {
    logger.warn("MySQL 落库失败，跳过 Redis 会话历史写入以保持两端一致");
    // ★ MySQL 失败 → Redis 也不写 → 两端都不会有新对话 → 数据一致
}</code></pre>
<p><strong>设计逻辑</strong>：</p>
<pre><code class="language-text">MySQL 成功 + Redis 成功 = 完整存储 ✅
MySQL 成功 + Redis 失败 = MySQL 有、Redis 没有（下次对话缺上下文，但历史完整）
MySQL 失败 + Redis 不写  = 两端都没有（本次对话丢失，但不会出现"一边有一边没有"）</code></pre>
<p>为什么"MySQL 失败就跳过 Redis"是正确的？
- 如果 MySQL 失败但 Redis 写了：下一轮对话用 Redis 上下文正常回答，但用户刷新历史
  页发现这条对话"消失"了 → 数据不一致，用户体验困惑
- 两边都不写：本轮对话丢失，但至少<strong>数据源之间保持一致</strong>，且 MySQL 是"事实来源"，
  以它为准</p>
<p><strong>失败时的用户体验</strong></p>
<pre><code class="language-java">// ChatHandler.java - finalizeResponse() 中

sendCompletionNotification(userId, generationId, conversationId, false, !persisted);
// 第 5 个参数 persistenceDegraded = !persisted = true

// sendCompletionNotification 内部：
if (persistenceDegraded) {
    notification.put("persistenceDegraded", true);
    notification.put("persistenceWarning", "本次回复未能持久化到数据库，刷新后可能无法在历史中找到。");
}
// → 前端弹提示："本次回复未能持久化到数据库，刷新后可能无法在历史中找到。"</code></pre>
<p><strong>用户至少被诚实告知</strong>，不会出现"对话莫名其妙消失"的困惑。</p>
<p><strong>一致性保证的完整策略</strong></p>
<div class="table-wrap"><table>
<thead><tr><th>层</th><th>保证</th></tr></thead>
<tbody>
<tr><td>代码顺序</td><td>先 MySQL 后 Redis，MySQL 失败则 Redis 不写</td></tr>
<tr><td>事务</td><td>recordConversation 有 @Transactional，MySQL 内部要么全成要么全败</td></tr>
<tr><td>引用映射</td><td>同样在 persistConversation 里一起落库</td></tr>
<tr><td>用户告知</td><td>persistenceDegraded 标志通知前端</td></tr>
</tbody></table></div>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>采用"MySQL 优先"策略保证一致性：先把对话落 MySQL（事务），只有成功后才写 Redis
上下文；MySQL 失败时跳过 Redis 写入并向用户提示"未持久化"，避免两个数据源出现
一边有记录一边没有的不一致状态。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么不引入分布式事务（如 Seata）？</strong>
A：分布式事务（两阶段提交）成本高、性能损耗大，且这个场景的一致性要求不是绝对的。
"MySQL 成功才写 Redis，失败就两边都不写"是一种<strong>最终一致性</strong>的务实做法：允许
偶发丢失，但绝不允许数据源之间不一致。</p>
<p><strong>Q2：还有哪些保证一致性的方案？</strong>
A：① 消息队列：把"写 Redis"作为消息发到 MQ，MySQL 提交后异步消费写 Redis，天然
解耦；② 补偿任务：定时扫描 MySQL 和 Redis 的差异，自动补齐；③ 让 MySQL 成为唯一
事实来源，Redis 只是可重建的缓存（丢失后从 MySQL 重建）。</p>
<p><strong>Q3：Redis 写入失败会怎样？</strong>
A：updateConversationHistory 内部有 try-catch，Redis 异常只记日志不抛异常，不影响
主流程。结果是"MySQL 有记录但 Redis 上下文缺失"，下一轮对话历史不完整，但用户历史
记录查询正常。</p>
<hr>` },
      { "t": "技术点 32：多会话管理（ConversationSession）", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：什么是多会话？</strong></p>
<p>用户可以开启多个对话（类似 ChatGPT 的多个对话窗口）：</p>
<pre><code class="language-text">左侧会话列表：
  ├── "如何上传文件？"（会话1，进行中）
  ├── "RAG的原理"（会话2，已归档）
  └── "报销流程"（会话3，进行中）</code></pre>
<p>每个会话有独立的：
- conversationId（逻辑 ID）
- 标题（自动从第一句话生成）
- 状态（ACTIVE 进行中 / ARCHIVED 已归档）
- 时间戳</p>
<p><strong>核心代码：创建会话</strong></p>
<pre><code class="language-java">// ConversationService.java - createConversationSession()

public Map&lt;String, Object&gt; createConversationSession(Long userId) {
    User user = userRepository.findById(userId).orElseThrow(...);

    // 1. 生成唯一的 conversationId
    String conversationId = UUID.randomUUID().toString();

    // 2. 创建会话记录（MySQL）
    ConversationSession session = new ConversationSession();
    session.setUser(user);
    session.setConversationId(conversationId);
    session.setTitle("新对话");              // 默认标题
    session.setStatus(ConversationSession.SessionStatus.ACTIVE);
    sessionRepository.save(session);

    // 3. 更新 Redis 中的"当前会话"指针
    String redisKey = "user:" + userId + ":current_conversation";
    redisTemplate.opsForValue().set(redisKey, conversationId, Duration.ofDays(7));
    // 后续该用户的消息都会进入这个新会话

    return result;  // 返回 conversationId + title + status + 时间戳
}</code></pre>
<p><strong>核心代码：会话切换</strong></p>
<pre><code class="language-java">// ConversationService.java - switchCurrentConversation()

public void switchCurrentConversation(Long userId, String conversationId) {
    // 校验会话存在
    if (!sessionRepository.existsByConversationId(conversationId)) {
        throw new CustomException("对话不存在", HttpStatus.NOT_FOUND);
    }

    // 更新 Redis 指针
    String redisKey = "user:" + userId + ":current_conversation";
    redisTemplate.opsForValue().set(redisKey, conversationId, Duration.ofDays(7));
}</code></pre>
<p><strong>核心代码：自动创建会话（ChatHandler 调用）</strong></p>
<pre><code class="language-java">// ChatHandler.java - getOrCreateConversationId()

private String getOrCreateConversationId(String userId) {
    String key = "user:" + userId + ":current_conversation";
    String conversationId = redisTemplate.opsForValue().get(key);

    if (conversationId == null) {
        // Redis 没有"当前会话" → 创建新的
        conversationId = UUID.randomUUID().toString();
        redisTemplate.opsForValue().set(key, conversationId, Duration.ofDays(7));
    }
    return conversationId;
}

// 然后确保 MySQL 中有对应的会话记录
conversationService.ensureConversationSession(
    Long.parseLong(userId), conversationId, userMessage
);</code></pre>
<pre><code class="language-java">// ConversationService.java - ensureConversationSession()

public void ensureConversationSession(Long userId, String conversationId, String title) {
    if (sessionRepository.existsByConversationId(conversationId)) {
        return;  // 已存在，跳过（幂等）
    }
    // 不存在 → 创建，标题用第一条消息的前 50 字符
    ConversationSession session = new ConversationSession();
    session.setUser(user);
    session.setConversationId(conversationId);
    session.setTitle(title != null &amp;&amp; !title.isBlank() ? title : "新对话");
    session.setStatus(ConversationSession.SessionStatus.ACTIVE);
    sessionRepository.save(session);
}</code></pre>
<p><strong>核心代码：归档与取消归档</strong></p>
<pre><code class="language-java">// ConversationService.java

// 归档（不再显示在会话列表中，但数据还在）
public void archiveConversationSession(String conversationId) {
    ConversationSession session = sessionRepository.findByConversationId(conversationId)
        .orElseThrow(() -&gt; new CustomException("对话不存在", HttpStatus.NOT_FOUND));
    session.setStatus(ConversationSession.SessionStatus.ARCHIVED);
    sessionRepository.save(session);
}

// 取消归档（恢复显示）
public void unarchiveConversationSession(String conversationId) {
    ConversationSession session = sessionRepository.findByConversationId(conversationId)
        .orElseThrow(() -&gt; new CustomException("对话不存在", HttpStatus.NOT_FOUND));
    session.setStatus(ConversationSession.SessionStatus.ACTIVE);
    sessionRepository.save(session);
}</code></pre>
<p><strong>核心代码：标题自动更新</strong></p>
<pre><code class="language-java">// ConversationService.java - updateSessionTitleIfDefault()

public void updateSessionTitleIfDefault(String conversationId, String title) {
    if (title == null || title.isBlank()) return;

    // 只取前 50 字符作为标题
    String trimmed = title.length() &gt; 50 ? title.substring(0, 50) : title;

    sessionRepository.findByConversationId(conversationId).ifPresent(session -&gt; {
        // 只有标题还是"新对话"时才更新（第一条消息决定标题）
        if ("新对话".equals(session.getTitle())) {
            session.setTitle(trimmed);
            sessionRepository.save(session);
        }
    });
}</code></pre>
<p><strong>会话列表查询</strong></p>
<pre><code class="language-java">// ConversationService.java - getConversationSessions()

public List&lt;Map&lt;String, Object&gt;&gt; getConversationSessions(Long userId) {
    List&lt;ConversationSession&gt; sessions =
        sessionRepository.findByUserIdOrderByUpdatedAtDesc(userId);
    // 按更新时间倒序：最新会话在最上面

    // 转换为前端需要的格式
    // [{id, conversationId, title, status, createdAt, updatedAt}, ...]
}</code></pre>
<p><strong>"当前会话"指针的作用</strong></p>
<pre><code class="language-text">Redis Key: user:{userId}:current_conversation

用户 A 打开会话2 → Redis: user:1:current_conversation = "uuid-c3d4"
  → 用户 A 发消息 → ChatHandler 读 Redis → 消息进入会话2

用户 A 新建会话 → Redis: user:1:current_conversation = "uuid-e5f6"
  → 用户 A 再发消息 → 消息进入新会话</code></pre>
<p>这个"指针"让前后端不用每次请求都传 conversationId，由 Redis 记住用户当前在哪个会话。</p>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>通过 conversation_sessions 表管理多会话（创建/切换/归档/恢复，标题自动取第一条
消息前 50 字），Redis 中维护"当前会话"指针决定新消息进入哪个会话，消息落库时幂等
确保会话记录存在。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么"当前会话"存 Redis 而不存 MySQL？</strong>
A：它是高频读写的"状态"数据（每次发消息都要读），Redis 内存读写快且自动过期（7天
TTL）。MySQL 适合保存会话的"事实"（标题、状态、时间），Redis 保存"当前指针"。</p>
<p><strong>Q2：Redis 中"当前会话"指针丢了会怎样？</strong>
A：getOrCreateConversationId() 发现 Redis 没有 → 生成新的 conversationId → 自动创建
新会话。用户会"掉"回一个新对话，但历史会话数据都在 MySQL，可以手动切换回去。</p>
<p><strong>Q3：一个会话最多存多少条消息？</strong>
A：MySQL 不限（历史完整保存）。Redis 限制最近 20 条（上下文窗口，技术点33）。</p>
<hr>` },
      { "t": "技术点 33：对话历史窗口截取", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么不能把全部历史给 LLM？</strong></p>
<p>对话越多，历史越长：</p>
<pre><code class="language-text">第 1 轮：问"你好" → 答"你好"
第 2 轮：问"什么是RAG" → 答 200 字
...
第 100 轮：历史可能有 5 万 token</code></pre>
<p>LLM 上下文窗口有限（如 8K/32K/128K token），且历史越长：
- 成本越高（Prompt Token 按量计费）
- 响应越慢（模型要处理更多输入）
- 效果越差（模型"注意力"被长历史稀释，只记得最近的对话）</p>
<p>所以必须<strong>截取</strong>：只给 LLM 最近的部分历史。</p>
<p><strong>第一种截取：Redis 上限 20 条</strong></p>
<pre><code class="language-java">// ChatHandler.java - updateConversationHistory()

// 限制历史记录长度，保留最近的 20 条消息（10 轮对话）
if (history.size() &gt; 20) {
    history = history.subList(history.size() - 20, history.size());
    // 只保留最后 20 条
}</code></pre>
<p><strong>第二种截取：ReAct 模式 6 条 + 每条 800 字符</strong></p>
<pre><code class="language-java">// LlmProviderRouter.java - buildReActMessages()

public List&lt;Map&lt;String, Object&gt;&gt; buildReActMessages(String userMessage, String context,
        List&lt;Map&lt;String, String&gt;&gt; history, String feedbackGuidance) {

    if (history != null &amp;&amp; !history.isEmpty()) {
        // 只取最近 6 条
        int start = Math.max(0, history.size() - REACT_HISTORY_MAX_MESSAGES);  // 6
        for (Map&lt;String, String&gt; message : history.subList(start, history.size())) {
            String role = message.get("role");
            String content = message.get("content");

            // 每条内容截断到 800 字符
            messages.add(newMessage(role, limitText(content, REACT_HISTORY_MAX_CONTENT_CHARS)));
        }
    }
    messages.add(newMessage("user", userMessage));
}</code></pre>
<pre><code class="language-java">private static final int REACT_HISTORY_MAX_MESSAGES = 6;        // 最多 6 条消息
private static final int REACT_HISTORY_MAX_CONTENT_CHARS = 800; // 每条最多 800 字符</code></pre>
<p><strong>为什么 ReAct 模式截取得更狠（6条 vs 20条）？</strong></p>
<p>因为 ReAct 每轮循环还会产生大量 <strong>tool_calls + tool 结果</strong> 消息：</p>
<pre><code class="language-text">messages 列表内容：
  [0] system: 强制检索规则 + 检索片段
  [1] user: "帮我总结文件上传"
  [2] assistant: tool_calls=[search_knowledge]     ← ReAct 产生
  [3] tool: 检索结果 5 个片段                        ← ReAct 产生
  [4] assistant: tool_calls=[generate_summary]      ← ReAct 产生
  [5] tool: 摘要内容                                 ← ReAct 产生
  [6] assistant: "文件上传支持分片..."               ← 最终回答</code></pre>
<p>一次问答可能产生 5+ 条消息。如果历史给 20 条，加上本轮的 tool 消息，很快就会撑爆
上下文窗口。所以 ReAct 模式只保留最近 6 条历史。</p>
<p><strong>截取策略对比</strong></p>
<div class="table-wrap"><table>
<thead><tr><th>场景</th><th>策略</th><th>原因</th></tr></thead>
<tbody>
<tr><td>Redis 存储</td><td>最多 20 条</td><td>覆盖最近 10 轮对话，兼顾上下文完整</td></tr>
<tr><td>ReAct 输入</td><td>最多 6 条 + 每条 800 字符</td><td>ReAct 会产生大量工具消息，必须更狠地截取</td></tr>
<tr><td>generate_summary</td><td>不传历史（独立调用）</td><td>摘要生成不需要上下文</td></tr>
</tbody></table></div>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>对话历史窗口双层截取：Redis 上下文最多保留 20 条消息；送入 ReAct 模型时进一步
截取为最近 6 条且每条最多 800 字符，因为 ReAct 每轮会产生 tool_calls 和 tool
结果消息，必须严格控制上下文窗口避免超限。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：截取历史会不会丢失重要上下文？</strong>
A：会。但这是成本/效果/窗口限制的必然取舍。实践中最近 6-10 轮对话覆盖了绝大多数
连续上下文场景。更高级的方案是"摘要压缩"：把超出窗口的旧历史用 LLM 压缩成摘要
保留要点（类似 LangChain 的 summarize buffer memory）。</p>
<p><strong>Q2：800 字符的截断会不会切断句子？</strong>
A：会直接 <code>substring(0, 800) + "..."</code> 硬截断。对模型来说，"不完整的旧消息"影响
不大，因为最近的消息通常才是关键。如果要更精细，可以按句子边界截断。</p>
<p><strong>Q3：怎么判断截取参数是否合理？</strong>
A：看 Token 用量。假设 6 条 × 800 字符 ≈ 4800 字符 ≈ 2400-3600 token，加上 system
Prompt（含检索片段）和工具描述，总计约 5000-8000 token，在 8K 窗口内安全。如果模型
换成 32K 窗口，可以适当放宽。</p>
<p><strong>扩展方案</strong></p>
<ul>
<li><strong>摘要记忆</strong>：用 LLM 把窗口外的旧历史压缩成摘要，作为"长期记忆"注入 Prompt，</li><ul><li>兼顾上下文完整性和窗口限制。</li></ul>
<hr>` },
      { "t": "技术点 34：引用映射持久化与还原", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么引用映射要持久化？</strong></p>
<p>引用映射（编号 → 来源文档信息）在生成时存在内存/Redis 里，但：
- 内存 Map 在生成结束后会被 cleanupGenerationState() 清理
- Redis 只有 30 分钟 TTL
- 用户几天后查看历史对话，点击 [1] 应该还能定位到来源文档</p>
<p>所以引用映射必须<strong>永久保存</strong>：序列化成 JSON 存进 MySQL 的 conversations 表。</p>
<p><strong>核心代码：写入时序列化</strong></p>
<pre><code class="language-java">// ConversationService.java - writeReferenceMappings()

private String writeReferenceMappings(Map&lt;String, Map&lt;String, Object&gt;&gt; referenceMappings) {
    if (referenceMappings == null || referenceMappings.isEmpty()) {
        return null;
    }
    try {
        // Map → JSON 字符串
        return objectMapper.writeValueAsString(referenceMappings);
    } catch (Exception e) {
        logger.warn("序列化引用映射失败，将跳过持久化引用详情", e);
        return null;
    }
}</code></pre>
<p>存进 MySQL 的数据（reference_mappings_json 字段，LONGTEXT）：</p>
<pre><code class="language-json">{
  "1": {
    "fileMd5": "a1b2c3d4e5f6...",
    "fileName": "技术手册.pdf",
    "pageNumber": 3,
    "anchorText": "RAG是一种检索增强生成技术...",
    "retrievalMode": "HYBRID",
    "retrievalLabel": "混合召回（语义相关 + 关键词命中）",
    "retrievalQuery": "RAG核心流程",
    "matchedChunkText": "RAG是一种检索增强生成技术，它通过从知识库中...",
    "evidenceSnippet": "RAG是一种检索增强生成技术，它通过从知识库中检索相关文档片段...",
    "score": 0.8732,
    "chunkId": 5
  },
  "2": {
    "fileMd5": "f6e5d4c3b2a1...",
    "fileName": "架构说明.docx",
    "pageNumber": null,
    ...
  }
}</code></pre>
<p><strong>核心代码：查询时反序列化</strong></p>
<pre><code class="language-java">// ConversationService.java - parseReferenceMappings()

private Map&lt;String, Map&lt;String, Object&gt;&gt; parseReferenceMappings(String referenceMappingsJson) {
    if (referenceMappingsJson == null || referenceMappingsJson.isBlank()) {
        return null;
    }
    try {
        // JSON 字符串 → Map
        return objectMapper.readValue(referenceMappingsJson,
            new TypeReference&lt;Map&lt;String, Map&lt;String, Object&gt;&gt;&gt;() {});
    } catch (Exception e) {
        logger.warn("解析引用映射失败，将返回无引用详情的历史记录", e);
        return null;
    }
}</code></pre>
<p><strong>核心代码：历史查询时还原</strong></p>
<pre><code class="language-java">// ConversationService.java - toMessageHistory()

public List&lt;Map&lt;String, Object&gt;&gt; toMessageHistory(List&lt;Conversation&gt; conversations, boolean includeUsername) {
    List&lt;Map&lt;String, Object&gt;&gt; messages = new ArrayList&lt;&gt;();

    for (Conversation conversation : conversations) {
        // 用户消息
        messages.add(buildMessage("user", conversation.getQuestion(), timestamp, conversationId, null, username));

        // 助手消息（还原引用映射！）
        messages.add(buildMessage(
            "assistant",
            conversation.getAnswer(),
            timestamp,
            conversationId,
            parseReferenceMappings(conversation.getReferenceMappingsJson()),  // ★ 还原
            username
        ));
    }
    return messages;
}</code></pre>
<pre><code class="language-java">private Map&lt;String, Object&gt; buildMessage(String role, String content, String timestamp,
        String conversationId, Map&lt;String, Map&lt;String, Object&gt;&gt; referenceMappings, String username) {
    Map&lt;String, Object&gt; message = new HashMap&lt;&gt;();
    message.put("role", role);
    message.put("content", content);
    if (timestamp != null) message.put("timestamp", timestamp);
    if (conversationId != null) message.put("conversationId", conversationId);
    if (referenceMappings != null &amp;&amp; !referenceMappings.isEmpty()) {
        message.put("referenceMappings", referenceMappings);  // ★ 前端拿到引用映射
    }
    if (username != null) message.put("username", username);
    return message;
}</code></pre>
<p><strong>完整生命周期</strong></p>
<pre><code class="language-text">生成时：
  检索结果 → buildContext() 建立映射 → 内存 Map + Redis（30分钟）
  ↓
生成完成：
  finalizeResponse() → persistConversation() → 序列化为 JSON → MySQL conversations 表
  ↓
历史查询时：
  用户打开历史 → getMessagesByConversationId() → 读 MySQL
  → parseReferenceMappings() 反序列化 → 前端拿到引用映射
  → 用户点击 [1] → 前端展示来源文档 + 页码定位</code></pre>
<p><strong>引用映射在 Redis 中的生成状态</strong></p>
<pre><code class="language-java">// ChatGenerationStateService.java - 生成期间的状态管理

// 生成过程中（Redis，30分钟TTL）：
//   chat:generation:{id}:meta     → 元数据（状态、用户、问题）
//   chat:generation:{id}:content  → 已生成的内容
//   chat:generation:{id}:refs     → 引用映射

// 生成结束时：
//   markCompleted() → 状态改为 COMPLETED → 清理 active 指针
//   MySQL 持久化已完成（persistConversation 在 finalizeResponse 中调用）</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>引用映射在生成完成后序列化为 JSON 存入 MySQL conversations 表的
reference_mappings_json 字段（LONGTEXT），查询历史时反序列化还原并随消息返回前端，
保证用户几天后查看历史对话时引用仍然可点击、可定位到来源文档。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：引用映射为什么存 JSON 而不是单独建表？</strong>
A：引用映射是"对话的附属数据"，随对话一起读写，从不单独查询。存 JSON 字段最简单，
读写一次完成。如果要"按引用统计文档被引用次数"等分析需求，才需要拆成关系表。</p>
<p><strong>Q2：如果 JSON 解析失败怎么办？</strong>
A：parseReferenceMappings 捕获异常返回 null，历史消息仍能正常显示（只是引用不可
点击）。这是"降级"设计：核心数据（问答内容）不依赖附属数据（引用映射）。</p>
<p><strong>Q3：为什么生成期间还要在 Redis 存一份？</strong>
A：生成过程中用户可能刷新页面或前端需要实时查询引用状态（比如回答还没结束时就想
看引用）。Redis 存一份支持生成过程中的实时查询；MySQL 是生成完成后的最终落点。</p>
<hr>` },
      { "t": "完整链路总结", "tag": "我的整理", "p": "core", "html": `<pre><code class="language-text">[用户发消息]
  │ 32. getOrCreateConversationId() → Redis 指针 → 找到/创建会话
  ▼
[ReAct 循环生成回答]
  │ 33. 从 Redis 读历史（≤20条）→ ReAct 模式截取（≤6条×800字符）
  ▼
[finalizeResponse]
  │ 34. 构建引用映射（内存 + Redis）
  │ 31. ① 先落 MySQL（事务：问答 + 引用映射JSON）
  │    ② MySQL 成功 → 才写 Redis 历史（≤20条，7天TTL）
  │    ③ MySQL 失败 → 跳过 Redis + 提示用户"未持久化"
  ▼
[用户查看历史]
  │ 30. MySQL conversations 表 → toMessageHistory()
  │ 34. 反序列化引用映射 → 前端展示可点击引用
  ▼
[用户新建/切换/归档会话]
  │ 32. conversation_sessions 表 + Redis 当前会话指针</code></pre>` }
    ]
  });

  mine.chapters.push({
    "no": "6",
    "title": "六、安全与权限（6个技术点）（技术点 35–40 · 7 节）",
    "questions": [
      { "t": "技术点 35：JWT 无状态认证", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：Session 认证 vs JWT 认证</strong></p>
<p><strong>传统 Session 认证（有状态）：</strong></p>
<pre><code class="language-text">用户登录 → 服务器创建 Session，Session ID 存服务器内存 + 返回给浏览器 Cookie
用户请求 → 浏览器带 Cookie → 服务器查 Session → 验证通过

问题：服务器要记住每个用户的 Session → 内存开销大
     多台服务器时 Session 不共享（要引入 Redis 集中存储）</code></pre>
<p><strong>JWT 认证（无状态）：</strong></p>
<pre><code class="language-text">用户登录 → 服务器签发 JWT（包含用户信息+签名）→ 返回给前端
用户请求 → 前端带 Authorization: Bearer {JWT} → 服务器验签 → 验证通过

优势：服务器不存任何会话状态 → 天然支持水平扩展
     JWT 自带用户信息 → 不需要查库</code></pre>
<p><strong>JWT 的结构</strong></p>
<pre><code class="language-text">JWT = Header.Payload.Signature

Header（头部）：算法信息
  {"alg":"HS256","typ":"JWT"}

Payload（载荷）：用户信息
  {"sub":"admin","userId":"1","role":"ADMIN","orgTags":"default","exp":1712345678}

Signature（签名）：防篡改
  HMACSHA256(Header + "." + Payload, 密钥)</code></pre>
<p>签名的作用：Payload 虽然只是 Base64 编码（可被解码看到），但任何修改都会导致签名
不匹配 → 验签失败 → 拒绝。</p>
<p><strong>核心代码：登录时签发 JWT</strong></p>
<pre><code class="language-java">// JwtUtils.java - 生成 Token

public String generateToken(User user) {
    // 1. 设置 Claims（载荷）
    Map&lt;String, Object&gt; claims = new HashMap&lt;&gt;();
    claims.put("userId", user.getId().toString());   // 用户ID
    claims.put("role", user.getRole().name());        // 角色
    claims.put("orgTags", ...);                       // 组织标签
    claims.put("tokenId", generateTokenId());         // 唯一标识（用于黑名单）

    // 2. 构建 JWT
    return Jwts.builder()
        .setClaims(claims)
        .setSubject(user.getUsername())      // 主题：用户名
        .setExpiration(new Date(expireTime)) // 过期时间
        .signWith(key, SignatureAlgorithm.HS256)  // 用密钥签名
        .compact();                          // 生成字符串
}</code></pre>
<p><strong>核心代码：每次请求验签</strong></p>
<pre><code class="language-java">// JwtAuthenticationFilter.java - doFilterInternal()

protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
        FilterChain filterChain) {
    // 1. 从请求头提取 Token
    String token = extractToken(request);
    // Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...

    if (token != null) {
        // 2. 验证 Token（验签 + 检查过期）
        if (jwtUtils.validateToken(token)) {
            username = jwtUtils.extractUsernameFromToken(token);
        }

        // 3. 把认证信息设置到 Spring Security 上下文
        if (username != null) {
            UserDetails userDetails = userDetailsService.loadUserByUsername(username);
            UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(
                    userDetails, null, userDetails.getAuthorities());
            SecurityContextHolder.getContext().setAuthentication(authentication);
            // 后续的 @PreAuthorize / hasRole 判断就能用了
        }
    }
    filterChain.doFilter(request, response);
}</code></pre>
<p><strong>核心代码：Token 自动刷新（无感知续期）</strong></p>
<pre><code class="language-java">// JwtAuthenticationFilter.java

// 1. Token 有效但快过期了 → 主动刷新
if (jwtUtils.validateToken(token)) {
    if (jwtUtils.shouldRefreshToken(token)) {  // 剩余有效期 &lt; 阈值？
        newToken = jwtUtils.refreshToken(token);  // 签发新 Token
    }
    username = jwtUtils.extractUsernameFromToken(token);
}
// 2. Token 已过期但在宽限期内 → 允许刷新
else if (jwtUtils.canRefreshExpiredToken(token)) {
    newToken = jwtUtils.refreshToken(token);
    username = jwtUtils.extractUsernameFromToken(newToken);
}

// 3. 新 Token 通过响应头返回给前端
if (newToken != null) {
    response.setHeader("New-Token", newToken);
    // 前端拦截器检测到 New-Token 响应头 → 替换本地存储的 Token
    // → 用户无感知地续期，不用重新登录
}</code></pre>
<p><strong>核心代码：登出（Token 黑名单）</strong></p>
<pre><code class="language-java">// JwtUtils.java - invalidateToken()

public void invalidateToken(String token) {
    String tokenId = extractTokenIdFromToken(token);
    if (tokenId != null) {
        // 把 tokenId 加入 Redis 黑名单（TTL = Token 剩余有效期）
        tokenCacheService.blacklistToken(tokenId, expireTime);
        // 从 Token 缓存中移除
        tokenCacheService.removeToken(tokenId, userId);
    }
}
// 之后即使这个 Token 签名有效，也会在黑名单中查到 → 拒绝</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>使用 JWT 实现无状态认证：登录时签发带用户ID、角色、组织标签的签名 Token，
每次请求通过过滤器验签并注入 Spring Security 上下文；支持"快过期主动刷新 + 过期
宽限期刷新"的无感知续期（新 Token 通过响应头返回），登出时通过 Redis 黑名单
使 Token 失效。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：JWT 无状态有什么缺点？</strong>
A：① 无法主动让 Token 失效（签发后到过期前都有效），需要黑名单机制弥补；② Token
体积比 Session ID 大（每次请求都带）；③ Payload 只是 Base64 编码，不能放敏感信息
（需要 HTTPS + 签名防篡改）。</p>
<p><strong>Q2：为什么不用 Redis 存 Session？</strong>
A：JWT 方案服务器完全无状态，任何一台实例都能独立验证请求，水平扩展最简单。Session
方案即使存 Redis 也有单点风险和序列化开销。但 JWT 的"注销困难"是硬伤，所以项目
用 Redis 黑名单 + 短过期时间（如 2 小时）来缓解。</p>
<p><strong>Q3：Token 过期了前端怎么处理？</strong>
A：请求返回 401 → 前端拦截器捕获 → 尝试用 refreshToken 调刷新接口 → 成功则替换
Token 重发请求；失败则跳转登录页。本项目的"宽限期刷新"是另一种思路：后端在 Token
过期后的一段时间内允许直接刷新，通过 New-Token 响应头无感续期。</p>
<hr>` },
      { "t": "技术点 36：Spring Security 过滤链", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：什么是过滤器链？</strong></p>
<p>Spring Security 是一串过滤器（Filter）组成的链：</p>
<pre><code class="language-text">请求进入
  ↓
过滤器1：SecurityContextHolderFilter（读取已有认证信息）
  ↓
过滤器2：JwtAuthenticationFilter（本项目自定义：解析 JWT）★
  ↓
过滤器3：OrgTagAuthorizationFilter（本项目自定义：组织标签授权）★
  ↓
过滤器4：UsernamePasswordAuthenticationFilter（登录时用）
  ↓
...更多内置过滤器...
  ↓
过滤器N：AuthorizationFilter（最终授权检查：hasRole / authenticated）
  ↓
到达 Controller</code></pre>
<p>每个过滤器决定：放行（传给下一个）、拦截（返回 401/403）、或短路（直接响应）。</p>
<p><strong>核心代码：配置过滤链</strong></p>
<pre><code class="language-java">// SecurityConfig.java - securityFilterChain()

@Bean
public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    http
        // 1. 禁用 CSRF（前后端分离 + JWT，不需要 CSRF 防护）
        .csrf(csrf -&gt; csrf.disable())

        // 2. 配置请求授权规则
        .authorizeHttpRequests(authorize -&gt; authorize
            // 放行：静态资源
            .requestMatchers("/", "/static/**", "/*.js", "/*.css").permitAll()
            // 放行：WebSocket 连接（JWT 在 URL 里单独校验）
            .requestMatchers("/chat/**", "/ws/**").permitAll()
            // 放行：登录注册
            .requestMatchers("/api/v1/users/register", "/api/v1/users/login").permitAll()
            // USER 和 ADMIN 都能访问：上传、搜索、聊天
            .requestMatchers("/api/v1/upload/**", "/api/search/**", "/api/v1/chat/**")
                .hasAnyRole("USER", "ADMIN")
            // 只有 ADMIN：管理接口
            .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
            // 其他所有请求都需要认证
            .anyRequest().authenticated()
        )

        // 3. 无状态会话（不用 Session）
        .sessionManagement(session -&gt; session
            .sessionCreationPolicy(SessionCreationPolicy.STATELESS))

        // 4. 在 UsernamePasswordAuthenticationFilter 之前加入 JWT 过滤器
        .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
        // 5. 在 JWT 过滤器之后加入 OrgTag 过滤器
        .addFilterAfter(orgTagAuthorizationFilter, JwtAuthenticationFilter.class);

    return http.build();
}</code></pre>
<p><strong>三个关键配置的解释</strong></p>
<p><strong>① CSRF 为什么禁用？</strong></p>
<p>CSRF（跨站请求伪造）防护用于"Cookie 自动携带"的场景：</p>
<pre><code class="language-text">攻击者网站 &lt;img src="http://bank.com/transfer?to=hacker"&gt;
浏览器自动带上 bank.com 的 Cookie → 攻击成功</code></pre>
<p>本项目用 JWT（放在请求头，不自动携带）+ 前后端分离，CSRF 攻击不适用 → 禁用。</p>
<p><strong>② 无状态会话（STATELESS）为什么？</strong></p>
<pre><code class="language-text">有状态：服务器创建 HttpSession → 占内存 → 分布式不共享
无状态：不创建 Session → 每请求独立验证 JWT → 支持水平扩展</code></pre>
<p><strong>③ 过滤器的顺序为什么重要？</strong></p>
<pre><code class="language-text">JwtAuthenticationFilter 必须在 OrgTagAuthorizationFilter 之前：
  JWT 过滤器：解析 Token → 提取 userId/role/orgTags → 存入请求属性
       ↓（然后才轮到）
OrgTagAuthorizationFilter：读取请求属性里的 userId/orgTags → 做资源级授权

顺序反了：OrgTag 过滤器拿不到用户信息，无法做权限判断</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>Spring Security 配置了完整的过滤链：禁用 CSRF、无状态会话（STATELESS）、
URL 级授权规则（permitAll/hasAnyRole/hasRole/authenticated），自定义的
JwtAuthenticationFilter 负责解析 JWT 注入认证信息，OrgTagAuthorizationFilter
紧跟其后做组织标签授权，两者顺序固定。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：Spring Security 的过滤链和拦截器（Interceptor）有什么区别？</strong>
A：过滤器（Filter）在 Servlet 容器层面，先于 Spring MVC 执行，能拦截所有请求（包括
静态资源），适合做认证这种"最外层"的事。拦截器（Interceptor）在 Spring MVC 层面，
只能拦截 Controller 请求，适合做日志、参数校验等。认证必须在最外层 → 用过滤器。</p>
<p><strong>Q2：为什么 WebSocket 连接要 permitAll？</strong>
A：WebSocket 握手时没有标准的 Authorization 头（不同浏览器/库支持不一），项目把
JWT 放在连接 URL 里（ws://host/chat/{token}），在 ChatWebSocketHandler 中手动校验。
所以 Security 层面放行，业务层面自己鉴权。</p>
<p><strong>Q3：anyRequest().authenticated() 和 hasRole 的区别？</strong>
A：authenticated() 只要求"登录了"（有有效 JWT），不区分角色。hasRole("ADMIN")
要求登录且角色是 ADMIN。两者可以组合：大部分接口 authenticated，管理接口
hasRole("ADMIN")。</p>
<hr>` },
      { "t": "技术点 37：多租户数据隔离 OrgTag", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：什么是多租户？</strong></p>
<p>多租户（Multi-Tenant）= 一套系统服务多个组织（公司/部门），<strong>组织之间的数据必须
互相隔离</strong>：</p>
<pre><code class="language-text">组织A（研发部）上传的文档 → 组织B（销售部）不能看到
用户C 的私人文档 → 只有用户C 能看到
公开文档 → 所有人都能看到</code></pre>
<p><strong>三级权限模型</strong></p>
<pre><code class="language-text">┌─────────────────────────────────────┐
│ 第1级：私人空间（PRIVATE_ 前缀）      │
│   只有资源创建者自己能访问            │
│   例：orgTag = "PRIVATE_user1"       │
├─────────────────────────────────────┤
│ 第2级：组织空间（普通 orgTag）        │
│   同组织成员可访问                    │
│   例：orgTag = "tech-dept"           │
├─────────────────────────────────────┤
│ 第3级：公开空间（isPublic = true）    │
│   所有用户可访问                      │
│   例：isPublic = true                │
└─────────────────────────────────────┘</code></pre>
<p><strong>核心代码：上传时标记资源归属</strong></p>
<pre><code class="language-java">// UploadController.java - uploadChunk()

// 1. 如果前端没指定组织标签，取用户的主组织
if (orgTag == null || orgTag.isEmpty()) {
    String primaryOrg = userService.getUserPrimaryOrg(userId);
    orgTag = primaryOrg;
}

// 2. 存入 FileUpload（上传文件记录）
fileUpload.setOrgTag(orgTag);      // 资源归属的组织
fileUpload.setUserId(userId);      // 资源创建者
fileUpload.setPublic(isPublic);    // 是否公开</code></pre>
<p><strong>核心代码：JWT 中携带组织标签</strong></p>
<pre><code class="language-java">// 登录时把用户的组织标签写入 JWT Claims
Map&lt;String, Object&gt; claims = new HashMap&lt;&gt;();
claims.put("userId", user.getId().toString());
claims.put("role", user.getRole().name());
claims.put("orgTags", "tech-dept,research");  // 用户的组织标签列表（逗号分隔）</code></pre>
<p><strong>核心代码：过滤器中的三级判断</strong></p>
<pre><code class="language-java">// OrgTagAuthorizationFilter.java - doFilterInternal()

// 1. 拿到资源的组织标签
String resourceOrgTag = resourceInfo.getOrgTag();

// 2. 一级判断：公开资源 / 无标签 / 默认组织 → 放行
if (resourceInfo.isPublic()
    || resourceOrgTag == null
    || resourceOrgTag.isEmpty()
    || DEFAULT_ORG_TAG.equals(resourceOrgTag)) {
    filterChain.doFilter(request, response);
    return;
}

// 3. 二级判断：资源拥有者 → 放行
if (username.equals(resourceInfo.getOwner())) {
    filterChain.doFilter(request, response);
    return;
}

// 4. 三级判断：管理员 → 放行
if ("ADMIN".equals(role)) {
    filterChain.doFilter(request, response);
    return;
}

// 5. 四级判断：私人资源且不是拥有者 → 拒绝
if (resourceOrgTag.startsWith(PRIVATE_TAG_PREFIX)) {
    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
    return;
}

// 6. 五级判断：组织标签匹配 → 放行，否则拒绝
String userOrgTags = jwtUtils.extractOrgTagsFromToken(token);
if (isUserAuthorized(userOrgTags, resourceOrgTag)) {
    filterChain.doFilter(request, response);
} else {
    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
}</code></pre>
<pre><code class="language-java">// 组织标签匹配逻辑
private boolean isUserAuthorized(String userOrgTags, String resourceOrgTag) {
    Set&lt;String&gt; userTags = Arrays.stream(userOrgTags.split(","))
        .collect(Collectors.toSet());
    return userTags.contains(resourceOrgTag);
    // 用户的标签集合包含资源的标签 → 有权限
}</code></pre>
<p><strong>决策树（数据示例）</strong></p>
<pre><code class="language-text">用户B 想访问 文档X（owner=用户A, orgTag=tech-dept, isPublic=false）

文档X 是公开的吗？ → false
用户B 是文档X 的拥有者吗？ → false
用户B 是 ADMIN 吗？ → false
文档X 是私人资源吗（PRIVATE_ 前缀）？ → false
用户B 的组织标签包含 tech-dept 吗？
  → 包含 → 放行 ✅
  → 不包含 → 403 拒绝 ❌</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>基于组织标签（OrgTag）实现三级多租户隔离：私人资源（PRIVATE_前缀）仅创建者可
访问，组织资源仅同组织成员可访问，公开资源所有人可访问；过滤器按"公开→拥有者→
管理员→私人→组织匹配"五级顺序判断，资源归属信息在上传时写入。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么用 orgTag 字符串而不是外键关联组织表？</strong>
A：orgTag 是一个轻量的标签字符串，支持灵活的组合和层级（比如"总公司&gt;研发部"可以
表示为层级路径）。用字符串标签避免引入复杂的组织表结构和多表 JOIN，权限判断直接
字符串匹配，性能好。</p>
<p><strong>Q2：如果用户属于多个组织怎么办？</strong>
A：JWT 的 orgTags 是一个逗号分隔的字符串列表，isUserAuthorized 会把字符串 split
成 Set 然后 contains 判断。多组织用户只要包含资源的组织标签就能访问。</p>
<p><strong>Q3：组织标签存在 JWT 里有什么问题？</strong>
A：JWT 签发后不可变（直到过期）。如果用户中途被移出组织，旧 Token 里的 orgTags
还是旧的 → 仍然能访问（最多到 Token 过期）。缓解方案：缩短 Token 有效期，或者每次
请求都查数据库确认（失去无状态优势）。</p>
<hr>` },
      { "t": "技术点 38：ES 查询层权限注入", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么权限过滤要在 ES 查询里做？</strong></p>
<p>两种实现思路：</p>
<pre><code class="language-text">思路A（代码层过滤）：
  查询 ES 拿到 100 条 → 在 Java 代码里逐个判断权限 → 保留 20 条
  问题：先查后滤，权限无关的数据也查出来了 → 数据泄露风险 + 浪费性能

思路B（查询层注入）★ 本项目：
  在 ES 查询条件里直接加权限 Filter → ES 只返回有权限的
  问题：无。安全且高效</code></pre>
<p><strong>思路A 最大的风险</strong>：如果查询逻辑有漏洞（比如分页），可能把无权限数据发给前端。
思路B 从源头隔离。</p>
<p><strong>核心代码：在 ES Query 中注入权限 Filter</strong></p>
<pre><code class="language-java">// HybridSearchService.java - searchWithPermission()

s.query(q -&gt; q.bool(b -&gt; b
    // must：关键词匹配（检索相关性）
    .must(mst -&gt; mst.match(m -&gt; m.field("textContent").query(query)))

    // filter：权限过滤（不参与评分，只决定是否可见）
    .filter(f -&gt; f.bool(bf -&gt; bf
        // 条件1：用户自己的文档
        .should(s1 -&gt; s1.term(t -&gt; t.field("userId").value(userDbId)))
        // 条件2：公开文档
        .should(s2 -&gt; s2.term(t -&gt; t.field("isPublic").value(true)))
        // 条件3：用户所属组织的文档（可能多个标签）
        .should(s3 -&gt; {
            if (userEffectiveTags.isEmpty()) {
                return s3.matchNone(mn -&gt; mn);  // 没有组织标签 → 条件3永不满足
            } else if (userEffectiveTags.size() == 1) {
                return s3.term(t -&gt; t.field("orgTag").value(userEffectiveTags.get(0)));
            } else {
                return s3.bool(inner -&gt; {
                    userEffectiveTags.forEach(tag -&gt;
                        inner.should(sh -&gt; sh.term(t -&gt; t.field("orgTag").value(tag)))
                    );
                    return inner;
                });
            }
        })
    ))
));</code></pre>
<p><strong>ES Query 等价 JSON</strong></p>
<pre><code class="language-json">{
  "query": {
    "bool": {
      "must": [
        { "match": { "textContent": "RAG" } }
      ],
      "filter": [
        {
          "bool": {
            "should": [
              { "term": { "userId": "1" } },          // 自己的
              { "term": { "isPublic": true } },        // 公开的
              { "bool": {                              // 同组织的
                "should": [
                  { "term": { "orgTag": "tech-dept" } },
                  { "term": { "orgTag": "research" } }
                ]
              } }
            ]
          }
        }
      ]
    }
  }
}</code></pre>
<p><strong>should 的语义</strong>：三个条件满足任意一个即可（OR 关系）。</p>
<p><strong>有效组织标签（含层级）</strong></p>
<pre><code class="language-java">// OrgTagCacheService - 获取用户的有效组织标签（含层级关系）

// 如果组织标签有层级（parent-child）：
//   用户属于 "tech-dept" 且 "tech-dept" 是 "company" 的子级
//   则用户的有效标签 = [tech-dept, company]
//   → 可以访问 tech-dept 和 company 两个组织的资源

List&lt;String&gt; effectiveTags = orgTagCacheService.getUserEffectiveOrgTags(username);</code></pre>
<p><strong>为什么 filter 用 should 而不用 must？</strong></p>
<ul>
<li>must：必须满足，且<strong>参与评分</strong>（影响相关度分数）</li><li>filter：必须满足，但<strong>不参与评分</strong>，且 ES 会缓存 filter 结果</li></ul>
<p>权限条件变化不频繁（用户身份在 Token 有效期内基本不变），缓存命中率高 → 性能好。
而且权限不该影响相关度排序（不能因为"是自己的文档"就排前面）→ 用 filter。</p>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>权限过滤直接注入 ES 查询的 filter 子句：<code>should(userId=自己, isPublic=true,
orgTag in 用户有效组织标签)</code> 三者满足其一即可，支持组织层级展开，filter 不参与
评分且可缓存，从查询源头保证用户只能检索到有权访问的文档。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：如果权限条件写进 must 会怎样？</strong>
A：must 参与评分，可能影响相关度排序（比如"自己的文档"被加分排前面，不公平）。
且 must 结果不缓存，每次查询都重新计算。所以权限用 filter 是正确做法。</p>
<p><strong>Q2：如何防止用户通过构造请求绕过权限？</strong>
A：权限条件在服务端拼接，用户无法控制。userDbId 和 orgTags 都从 JWT/数据库获取，
用户传的参数只有 query 和 topK。即使直接调 ES 接口（如果能连上），ES 本身没有
权限概念，所以服务端是唯一入口。</p>
<p><strong>Q3：搜索结果里的 fileMd5 会泄露无权限文档的信息吗？</strong>
A：不会。ES 只返回通过 filter 的文档。attachFileNames 也是根据结果的 fileMd5 查
MySQL 补文件名，查不到就跳过，不会额外泄露。</p>
<hr>` },
      { "t": "技术点 39：RBAC 角色控制", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：什么是 RBAC？</strong></p>
<p>RBAC（Role-Based Access Control）= 基于角色的访问控制：</p>
<pre><code class="language-text">用户 → 角色 → 权限
用户A → USER 角色 → 可以上传文件、搜索、聊天
用户B → ADMIN 角色 → 用户A的权限 + 管理知识库、看所有用户活动</code></pre>
<p><strong>核心代码：角色枚举</strong></p>
<pre><code class="language-java">// User.java

public enum Role {
    USER,   // 普通用户
    ADMIN   // 管理员
}</code></pre>
<p><strong>核心代码：Spring Security 的角色检查</strong></p>
<pre><code class="language-java">// SecurityConfig.java - URL 级角色控制

.authorizeHttpRequests(authorize -&gt; authorize
    // 登录注册放行
    .requestMatchers("/api/v1/users/register", "/api/v1/users/login").permitAll()

    // USER 和 ADMIN 都能访问
    .requestMatchers(
        "/api/v1/upload/**",
        "/api/v1/parse",
        "/api/v1/documents/download",
        "/api/v1/documents/preview",
        "/api/v1/documents/page-preview"
    ).hasAnyRole("USER", "ADMIN")

    // 仅 ADMIN
    .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")

    // 其他都要登录
    .anyRequest().authenticated()
);</code></pre>
<p><strong>注意</strong>：Spring Security 的 hasRole("ADMIN") 实际上检查的是 authority
"ROLE_ADMIN"（会自动加 ROLE_ 前缀）。</p>
<p><strong>核心代码：角色从 JWT 提取并注入</strong></p>
<pre><code class="language-java">// JwtAuthenticationFilter.java

// 1. JWT 里存了 role
claims.put("role", user.getRole().name());  // "ADMIN" 或 "USER"

// 2. 解析时加载 UserDetails（含 authorities）
UserDetails userDetails = userDetailsService.loadUserByUsername(username);
// UserDetails.getAuthorities() = [ROLE_ADMIN] 或 [ROLE_USER]

// 3. 注入 SecurityContext
UsernamePasswordAuthenticationToken authentication =
    new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());
SecurityContextHolder.getContext().setAuthentication(authentication);
// → hasRole("ADMIN") 判断时就能读到 ROLE_ADMIN</code></pre>
<p><strong>核心代码：代码中的角色判断</strong></p>
<pre><code class="language-java">// UploadController.java - 管理员不受上传大小限制

if (!userService.isAdminUser(userId)) {
    // 非管理员：检查组织上传大小限制
    Long uploadMaxSizeBytes = uploadOrg.getUploadMaxSizeBytes();
    if (totalSize &gt; uploadMaxSizeBytes) {
        return 413;  // 超过限制拒绝
    }
}
// 管理员：跳过大小限制</code></pre>
<pre><code class="language-java">// ConversationService.java - 管理员可以查看所有用户对话

if (user.getRole() == User.Role.ADMIN &amp;&amp; "all".equals(username)) {
    // 管理员查看全部
    return conversationRepository.findAllByOrderByTimestampAsc();
} else {
    // 普通用户只看自己的
    return conversationRepository.findByUserIdOrderByTimestampAsc(user.getId());
}</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>采用 RBAC 角色控制：用户表定义 USER/ADMIN 两种角色，登录时角色写入 JWT，
Spring Security 的 hasRole/hasAnyRole 在 URL 层做接口级控制，代码中通过
isAdminUser 等判断做逻辑级控制（如管理员豁免上传大小限制）。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：URL 级控制（hasRole）和代码级控制（if 判断）的区别？</strong>
A：URL 级控制是"粗粒度"的——整个接口要么能访问要么不能。代码级是"细粒度"的——
同一接口内不同角色的行为可以不同（比如管理员不限上传大小）。两者结合使用。</p>
<p><strong>Q2：如果需要一个"运营"角色怎么办？</strong>
A：在 Role 枚举加 OPERATOR，配置 hasAnyRole("USER","ADMIN","OPERATOR")，再在
CustomUserDetailsService 中把角色映射为 authority。改动点集中在枚举 + 授权配置。</p>
<p><strong>Q3：前端怎么知道用户是什么角色？</strong>
A：登录接口返回用户信息（含 role），前端存储在 Pinia/本地，用于控制菜单显示
（管理员看到"系统管理"菜单）。但前端控制只是体验优化，真正的权限控制在后端。</p>
<hr>` },
      { "t": "技术点 40：资源级权限验证", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：接口级 vs 资源级</strong></p>
<pre><code class="language-text">接口级（URL级）：POST /api/v1/admin/** → 只有 ADMIN 能访问
资源级（对象级）：DELETE /api/v1/documents/{md5} → 是 ADMIN 也要看这个文档是不是你的

// 假设有个文档 md5="a1b2c3"，是用户A上传的
用户A 删除 → 允许 ✅
用户B 删除 → 拒绝 ❌（不是你的文档）
ADMIN 删除 → 允许 ✅</code></pre>
<p>资源级权限：判断"当前用户对这个特定资源有没有操作权"。</p>
<p><strong>核心代码：从 URL 提取资源 ID</strong></p>
<pre><code class="language-java">// OrgTagAuthorizationFilter.java - extractResourceIdFromPath()

private String extractResourceIdFromPath(HttpServletRequest request) {
    String path = request.getRequestURI();

    // 1. 文件资源：/api/v1/files/{fileMd5}
    if (path.matches(".*/files/[^/]+.*")) {
        return path.replaceAll(".*/files/([^/]+).*", "$1");
    }

    // 2. 文档删除：/api/v1/documents/{32位MD5}
    if (path.matches(".*/documents/[a-fA-F0-9]{32}.*")) {
        return path.replaceAll(".*/documents/([a-fA-F0-9]{32}).*", "$1");
    }

    // 3. 文档资源：/api/v1/documents/{数字ID}
    if (path.matches(".*/documents/\\\\d+.*")) {
        return path.replaceAll(".*/documents/(\\\\d+).*", "$1");
    }

    // 4. 分片上传：从请求头 X-File-MD5 提取
    if (path.matches(".*/upload/chunk.*")) {
        return request.getHeader("X-File-MD5");
    }

    // 5. 知识库资源：/api/v1/knowledge/{resourceId}
    if (path.matches(".*/knowledge/[^/]+.*")) {
        return path.replaceAll(".*/knowledge/([^/]+).*", "$1");
    }

    return null;  // 不匹配任何资源模式 → 放行（不需要资源级校验）
}</code></pre>
<p><strong>核心代码：根据资源 ID 查归属</strong></p>
<pre><code class="language-java">// OrgTagAuthorizationFilter.java - getResourceInfo()

private ResourceInfo getResourceInfo(String resourceId) {
    // 从 file_upload 表查资源的归属信息
    Optional&lt;FileUpload&gt; fileUpload =
        fileUploadRepository.findFirstByFileMd5OrderByCreatedAtDesc(resourceId);

    if (fileUpload.isPresent()) {
        FileUpload file = fileUpload.get();
        return new ResourceInfo(
            file.getUserId(),   // 资源拥有者
            file.getOrgTag(),   // 资源所属组织
            file.isPublic()     // 是否公开
        );
    }
    return null;  // 资源不存在
}</code></pre>
<p><strong>核心代码：完整授权流程</strong></p>
<pre><code class="language-java">// OrgTagAuthorizationFilter.java - doFilterInternal()

// 1. 不需要资源级检查的 API（只需要登录）：直接放行并注入 userId
if (path.matches(".*/upload/chunk.*") || path.matches(".*/search/hybrid.*") || ...) {
    request.setAttribute("userId", userId);  // 注入用户ID供 Controller 使用
    filterChain.doFilter(request, response);
    return;
}

// 2. 提取资源 ID
String resourceId = extractResourceIdFromPath(request);
if (resourceId == null) {
    filterChain.doFilter(request, response);  // 没有资源 → 直接放行
    return;
}

// 3. 查资源归属
ResourceInfo resourceInfo = getResourceInfo(resourceId);
if (resourceInfo == null) {
    // 分片上传且资源不存在（首次上传）→ 放行
    if (isChunkUpload) { filterChain.doFilter(request, response); return; }
    response.setStatus(404);  // 资源不存在
    return;
}

// 4. 按顺序判断：公开 → 拥有者 → 管理员 → 私人 → 组织匹配（技术点37）
...</code></pre>
<p><strong>数据示例</strong></p>
<pre><code class="language-text">场景1：用户B 删除 用户A 的文档
  请求：DELETE /api/v1/documents/a1b2c3d4e5f6...
  提取资源ID：a1b2c3d4e5f6...
  查归属：owner=用户A, orgTag=tech-dept, isPublic=false
  判断：不是公开 → 不是拥有者 → 不是管理员 → 不是私人 → 组织匹配？
    B 的 orgTags=[sales] 不包含 tech-dept → 403 拒绝 ✅

场景2：管理员删除任何文档
  请求：DELETE /api/v1/documents/a1b2c3d4e5f6...
  判断：角色是 ADMIN → 放行 ✅

场景3：用户A 下载自己的文档
  请求：GET /api/v1/files/a1b2c3d4e5f6...
  判断：拥有者匹配 → 放行 ✅</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>资源级权限通过自定义过滤器实现：从 URL 正则提取资源 ID（文件MD5/数字ID/请求头），
查 file_upload 表拿到资源的拥有者、组织、公开属性，按"公开→拥有者→管理员→私人→
组织匹配"顺序判断，无法提取资源 ID 的请求直接放行。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：如果 URL 同时匹配多个资源模式怎么办？</strong>
A：extractResourceIdFromPath 按 if-else 顺序匹配，先匹配先返回。模式之间做了区分
（32位十六进制的 MD5 和纯数字 ID 不会冲突），正则设计上避免歧义。</p>
<p><strong>Q2：资源级校验为什么不放在 Controller 里？</strong>
A：过滤器在 Controller 之前统一执行，避免每个 Controller 重复写权限代码（DRY
原则）。而且过滤器可以访问原始 URL 和请求头，做正则匹配更自然。缺点是过滤器里
写业务查询（查 file_upload），如果资源类型变多，过滤器会膨胀。</p>
<p><strong>Q3：第一次分片上传时资源还不存在，怎么放行？</strong>
A：代码专门处理了这个边界：<code>isChunkUpload &amp;&amp; resourceInfo == null → 放行</code>。
因为第一个分片到达时 file_upload 表还没有记录（上传成功后才会创建），如果此时
拦截返回 404，上传根本无法开始。</p>
<p><strong>扩展方案</strong></p>
<ul>
<li><strong>Spring Security 的 @PreAuthorize 注解</strong>：可以配合 SpEL 表达式做方法级权限，</li><ul><li>比如 <code>@PreAuthorize("@docPermission.check(#fileMd5, authentication.name)")</code>，</li><li>比过滤器更灵活，但需要每个方法都标注。</li></ul><li><strong>ACL（访问控制列表）</strong>：如果权限模型更复杂（协作者、只读/可写等），可以引入</li><ul><li>Spring Security ACL 或 Shiro 的授权模型。</li></ul>
<hr>` },
      { "t": "完整链路总结", "tag": "我的整理", "p": "core", "html": `<pre><code class="language-text">[请求进入]
  │
  ▼
[SecurityConfig 过滤链]
  │
  ├── 35. JwtAuthenticationFilter：解析 JWT → 验签 → 注入认证信息
  │        → 快过期自动刷新 → New-Token 响应头
  │
  ├── 36. 内置过滤器链（无状态会话）
  │
  ├── 40. OrgTagAuthorizationFilter：资源级授权
  │        ├── 无需资源检查的 API → 注入 userId 放行
  │        ├── 提取资源ID → 查归属 → 37. 五级判断（公开/拥有者/管理员/私人/组织）
  │        └── 未通过 → 401/403/404
  │
  ├── 39. AuthorizationFilter：URL 级 RBAC 检查
  │        ├── hasAnyRole("USER","ADMIN") → 上传/搜索/聊天
  │        ├── hasRole("ADMIN") → 管理接口
  │        └── authenticated() → 其他
  │
  ▼
[Controller / Service]
  │
  ├── 38. 搜索时：ES 查询注入权限 filter（userId/isPublic/orgTag）
  │
  ▼
[响应返回]</code></pre>` }
    ]
  });

  mine.chapters.push({
    "no": "7",
    "title": "七、Token 经济与计费（5个技术点）（技术点 41–45 · 6 节）",
    "questions": [
      { "t": "技术点 41：Token 预估 → 预留 → 结算三阶段", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么需要三阶段？</strong></p>
<p>调用 LLM API 是<strong>按 Token 计费</strong>的（比如 DeepSeek：输入 1 元/百万 token，输出 2 元/
百万 token）。系统需要管好每一分钱：</p>
<pre><code class="language-text">用户无限调用 → Token 账单爆炸
某个用户耗尽配额 → 拒绝服务
并发高峰 → 全局预算超支</code></pre>
<p>"预估→预留→结算"是一种<strong>先扣款后多退少补</strong>的思路（类似酒店押金）：</p>
<pre><code class="language-text">预估：调用前估算大概要花多少钱（押金金额）
预留：先把这笔额度扣掉（冻结押金）→ 防止超支
结算：调用完成后按实际用量多退少补（退押金/补差额）
失败：调用失败 → 全额退款（释放预留）</code></pre>
<p><strong>第一阶段：预估 Token</strong></p>
<pre><code class="language-java">// UsageQuotaService.java - estimateTextTokens()

public int estimateTextTokens(String text) {
    // 按字符类型分别估算（中英文 Token 比例不同）
    int ascii = 0;  // 英文字符数
    int cjk = 0;    // 中文字符数
    int other = 0;  // 其他字符数

    for (char current : text.toCharArray()) {
        if (Character.isWhitespace(current)) continue;

        Character.UnicodeScript script = Character.UnicodeScript.of(current);
        if (script == HAN || script == HIRAGANA || script == KATAKANA || script == HANGUL) {
            cjk++;        // 中日韩文字
        } else if (current &lt;= 0x7F) {
            ascii++;      // ASCII 字符
        } else {
            other++;      // 其他（如 emoji）
        }
    }

    // 经验比例：
    //   ASCII ≈ 3.3 字符/token（英文单词平均）
    //   中文  ≈ 1.05 字符/token（一个汉字 ≈ 1 token）
    double estimated = ascii * 0.30 + cjk * 0.95 + other * 0.55 + 12;
    // +12 是固定开销（消息格式、特殊标记等）

    return Math.max(1, (int) Math.ceil(estimated));
}</code></pre>
<p><strong>为什么中英文比例不同？</strong></p>
<pre><code class="language-text">英文："Hello world, this is a test."
  → 英文单词平均 3-4 个字符 = 1 token
  → 30 个字符 ≈ 10 token → 比例 0.30

中文："检索增强生成是一种技术"
  → 一个汉字 ≈ 1 token（BPE 词表里中文按字/词切分）
  → 12 个汉字 ≈ 12 token → 比例 0.95（略小于1是因为有些双字词合1个token）</code></pre>
<p><strong>对话 Token 预估（多消息）</strong></p>
<pre><code class="language-java">// UsageQuotaService.java - estimateChatTokens()

public int estimateChatTokens(List&lt;Map&lt;String, String&gt;&gt; messages) {
    int total = 0;
    for (Map&lt;String, String&gt; message : messages) {
        total += 8;  // 每条消息固定开销（role标记、格式等）
        total += estimateTextTokens(message.get("role"));     // "system"/"user"
        total += estimateTextTokens(message.get("content"));  // 消息内容
    }
    return total;
}</code></pre>
<p><strong>第二阶段：预留额度</strong></p>
<pre><code class="language-java">// UsageQuotaService.java - reserveLlmTokens()

public TokenReservation reserveLlmTokens(String userId, int estimatedPromptTokens, int maxCompletionTokens) {
    if (!isQuotaManaged(userId) || !properties.getLlm().isEnabled()) {
        return TokenReservation.noop("llm", userId);  // 不管理配额 → 空操作
    }

    // 预留 = 预估输入 + 最大输出（按最坏情况预留）
    int reserveTokens = Math.max(estimatedPromptTokens, 0) + Math.max(maxCompletionTokens, 0);
    reserveTokens = Math.max(reserveTokens, 1);

    return reserveDailyTokens("llm", userId, reserveTokens,
        properties.getLlm().getDayMaxTokens(),  // 用户日限额（如 300000）
        "LLM当日Token额度已达上限");
}</code></pre>
<pre><code class="language-java">// 核心：Redis INCR 原子操作预留

private TokenReservation reserveDailyTokens(String scope, String userId,
        int reserveTokens, long dailyLimit, String message) {
    // Redis Key：quota:llm:2026-08-07:user:1
    String quotaKey = buildQuotaKey(scope, userId);

    // INCR 是原子操作：并发预留不会互相覆盖
    Long total = stringRedisTemplate.opsForValue().increment(quotaKey, reserveTokens);
    ensureExpiry(quotaKey, secondsUntilEndOfDay());  // 设置当天过期

    if (total != null &amp;&amp; total &gt; dailyLimit) {
        // 预留后超过限额 → 回滚本次预留 → 抛异常
        stringRedisTemplate.opsForValue().increment(quotaKey, -reserveTokens);
        throw new RateLimitExceededException(message, expiresInSeconds);
    }

    return new TokenReservation(scope, userId, quotaKey, ..., reserveTokens, dailyLimit, ...);
}</code></pre>
<p><strong>第三阶段：结算（多退少补）</strong></p>
<pre><code class="language-java">// UsageQuotaService.java - settleReservation()

public void settleReservation(TokenReservation reservation, int actualTokens) {
    // 实际用量 - 预留量 = 差额
    // 实际 &lt; 预留 → 负数 → 退额度（多退）
    // 实际 &gt; 预留 → 正数 → 补扣（少补）
    long delta = (long) actualTokens - reservation.reservedTokens();

    if (delta == 0) return;  // 正好用完，不用动

    // INCR 原子增减
    stringRedisTemplate.opsForValue().increment(reservation.quotaKey(), delta);
}</code></pre>
<p><strong>失败时的释放（退款）</strong></p>
<pre><code class="language-java">// UsageQuotaService.java - abortReservation()

public void abortReservation(TokenReservation reservation) {
    // 把预留的额度全部退回去
    stringRedisTemplate.opsForValue().increment(
        reservation.quotaKey(), -reservation.reservedTokens()
    );
}

// 调用处：LLM 调用失败时
} catch (Exception exception) {
    usageQuotaService.abortReservation(reservation);  // 全额退款
    throw exception;
}</code></pre>
<p><strong>完整时间线（数据示例）</strong></p>
<pre><code class="language-text">用户发起一次对话，预估输入 500 token，最大输出 2000 token

① 预估：estimateChatTokens(messages) = 500
② 预留：INCR quota:llm:2026-08-07:user:1 by 2500
     → 之前已用 1000 → 现在 3500
     → 日限额 300000 → 3500 &lt; 300000 ✅ 放行
③ 实际调用：LLM 实际用了 输入 480 + 输出 1600 = 2080 token
④ 结算：delta = 2080 - 2500 = -420
     → INCR quota:llm:2026-08-07:user:1 by -420 → 现在 3080
     → 多预留的 420 token 退回

如果③调用失败（网络错误）：
④ 释放：INCR by -2500 → 回到 1000 → 全部退回</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>Token 管控采用"预估→预留→结算"三阶段：调用前按消息内容估算 Token 并通过 Redis
INCR 原子预留（预留 = 预估输入 + 最大输出），调用成功后按实际用量多退少补（INCR
差额），调用失败全额释放预留，防止用户超额消费和并发超支。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么预留时要按"最大输出"而不是"预估输出"？</strong>
A：因为输出 token 数是动态的，无法预知（取决于模型生成多长）。按最大输出预留
（max_completion_tokens 上限）可以保证"即使模型输出到上限，也不会超支"。实际
结算时用真实值多退少补。</p>
<p><strong>Q2：INCR 和"先 GET 再 SET"有什么区别？</strong>
A：INCR 是 Redis 原子操作（单命令），并发环境下多个请求同时 INCR 不会丢失更新。
GET+SET 是两步操作，并发时可能互相覆盖（两个请求都读到 100，都写成 150，丢了一次
+50）。计数场景必须用原子命令。</p>
<p><strong>Q3：估算不准确怎么办？</strong>
A：没关系。估算只用于"预留"（防止超支），最终扣费以结算时的实际用量为准。估算
误差只影响"多退少补"的金额，不影响正确性。文本里中文多就用 0.95，英文多就用 0.30。</p>
<hr>` },
      { "t": "技术点 42：Embedding Token 预估算", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么 Embedding 需要估算？</strong></p>
<p>用户上传一个文件，系统要向量化所有子切片 → 会产生大量 Embedding Token 消耗。</p>
<pre><code class="language-text">一个 1000 页的文档 → 可能产生 5 万个子切片
5 万子切片 × 平均 300 token = 1500 万 token
→ 这是一笔不小的开销！用户上传前应该知道大概花多少</code></pre>
<p>所以系统在<strong>合并完成时</strong>先对文件做一次"预估算"，告诉用户"这个文件向量化大约
消耗 X Tokens，产生 Y 个切片"，让用户心里有数。</p>
<p><strong>核心代码：合并后立即估算</strong></p>
<pre><code class="language-java">// UploadController.java - mergeFile()

// 1. 合并成功后，打开合并文件的流
try (GetObjectResponse mergedFileStream = uploadService.getMergedFileStream(fileMd5)) {

    // 2. 预估算：流式读取并分块，统计预估 Token
    EmbeddingEstimate embeddingEstimate = parseService.estimateEmbeddingUsage(mergedFileStream);

    // 3. 保存到数据库
    fileUpload.setEstimatedEmbeddingTokens(embeddingEstimate.estimatedTokens());
    fileUpload.setEstimatedChunkCount(embeddingEstimate.estimatedChunkCount());
    fileUploadRepository.save(fileUpload);
}
// 估算失败不影响合并主流程（catch 后只记日志）</code></pre>
<p><strong>核心代码：流式预估算</strong></p>
<pre><code class="language-java">// ParseService.java - StreamingEstimateHandler（和正式解析共用了父块逻辑）

private class StreamingEstimateHandler extends BodyContentHandler {
    private final StringBuilder buffer = new StringBuilder();
    private long estimatedTokens = 0L;
    private int estimatedChunkCount = 0;

    // 和正式解析一样：积累 1MB 父块 → 切子切片
    @Override
    public void characters(char[] ch, int start, int length) {
        buffer.append(ch, start, length);
        if (buffer.length() &gt;= parentChunkSize) {
            processParentChunk();
        }
    }

    private void processParentChunk() {
        // 切成子切片
        List&lt;String&gt; childChunks = splitTextIntoChunksWithSemantics(buffer.toString(), chunkSize);
        estimatedChunkCount += childChunks.size();
        // 用和正式解析相同的估算逻辑
        estimatedTokens += usageQuotaService.estimateEmbeddingTokens(childChunks);
        buffer.setLength(0);
    }
}

// Embedding Token 估算（比文本略高，含特殊标记开销）
public int estimateEmbeddingTokens(List&lt;String&gt; texts) {
    int total = 0;
    for (String text : texts) {
        total += estimateTextTokens(text) + 4;  // 每条 +4 token（格式开销）
    }
    return (int) Math.ceil(total * 1.15d);  // +15% 安全系数（冗余）
}</code></pre>
<p><strong>前端展示</strong></p>
<pre><code class="language-typescript">// knowledge-base/index.ts - mergeFile()

if (data?.estimatedEmbeddingTokens) {
    const tokenLabel = Number(data.estimatedEmbeddingTokens).toLocaleString();
    const chunkLabel = Number(data.estimatedChunkCount || 0).toLocaleString();
    window.$message?.success(
        \`上传完成，预计向量化消耗 \${tokenLabel} Tokens（\${chunkLabel} 个切片）\`
    );
}
// 用户看到："上传完成，预计向量化消耗 12,345 Tokens（2,100 个切片）"</code></pre>
<p><strong>预估算 vs 实际</strong></p>
<pre><code class="language-java">// FileUpload 实体中有两套字段：
//   预估：estimated_embedding_tokens, estimated_chunk_count
//   实际：actual_embedding_tokens, actual_chunk_count

// 向量化完成后写入实际值（VectorizationService.vectorizeWithUsage 返回）
documentService.markVectorizationCompleted(fileMd5, vectorizationResult);
// vectorizationResult = { actualEmbeddingTokens, actualChunkCount, modelVersion }</code></pre>
<p>用户可以在文档列表看到"预估 vs 实际"的对比。</p>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>文件合并成功后立即对合并文件做一次流式预估算（复用父块切分逻辑统计子切片数量和
预估 Token，含 15% 安全系数），保存到 file_upload 表并返回给前端提示用户，向量化
完成后写入实际消耗，形成"预估-实际"对照。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：预估算会不会很慢？</strong>
A：预估算需要完整解析一遍文档（Tika 跑一遍），耗时和正式解析差不多。但它的好处
值得这个成本：① 用户上传前知道消耗；② 预估数据可用于后续的配额校验。对超大文件
可以考虑只采样前 N 页估算然后按比例推算（更快但有误差）。</p>
<p><strong>Q2：为什么 +15% 安全系数？</strong>
A：实际 API 返回的 token 数可能比估算略高（模型词表、特殊字符处理等差异）。加
15% 冗余可以避免"预估够用，实际超支"的情况。估算宁高勿低。</p>
<p><strong>Q3：预估的 Token 会计入用户配额吗？</strong>
A：不会直接扣，只做展示。真正扣费是向量化时通过 reserveEmbeddingUploadUsage 预留
+ settleReservation 结算。</p>
<hr>` },
      { "t": "技术点 43：LLM + Embedding 双维度配额", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么配额要分维度？</strong></p>
<p>系统消耗 Token 的渠道不止一个：</p>
<pre><code class="language-text">LLM Token：对话生成（deepseek-chat 等）→ 每次问答都消耗
Embedding Token：向量化（text-embedding-v3）→ 上传文件 + 每次搜索都消耗</code></pre>
<p>两者价格不同、消耗速度不同、用途不同。所以配额必须分开管理：
- LLM 配额用完了 → 不能对话，但还能搜索
- Embedding 配额用完了 → 不能上传新文件，但已有知识库还能问答</p>
<p><strong>配置</strong></p>
<pre><code class="language-yaml"># application.yml
usage-quota:
  llm:
    enabled: true
    day-max-tokens: 300000        # 用户 LLM 日限额 30 万 token
    init-tokens: 10000            # 新用户初始可用 LLM token
  embedding:
    enabled: true
    day-max-tokens: 1000000       # 用户 Embedding 日限额 100 万 token
    init-tokens: 10000            # 新用户初始可用 Embedding token
    admin-init-tokens: 100000     # 管理员初始 Embedding token</code></pre>
<p><strong>核心代码：双维度预留</strong></p>
<pre><code class="language-java">// RateLimitService.java

// LLM 维度
public TokenReservationBundle reserveLlmUsage(String userId,
        int estimatedPromptTokens, int maxCompletionTokens) {
    return usageQuotaService.reserveLlmTokensWithGlobalBudget(
        userId, estimatedPromptTokens, maxCompletionTokens,
        limit.minuteMax(), limit.minuteWindowSeconds(),  // 分钟预算
        limit.dayMax(), limit.dayWindowSeconds()          // 日预算
    );
}

// Embedding 维度（还区分上传/查询两种场景！）
public TokenReservationBundle reserveEmbeddingUploadUsage(String userId, List&lt;String&gt; texts) {
    // 上传向量化：scope = "embedding-upload"
}
public TokenReservationBundle reserveEmbeddingQueryUsage(String userId, List&lt;String&gt; texts) {
    // 搜索向量化：scope = "embedding-query"
}</code></pre>
<p><strong>核心代码：用户级 + 全局级双层预算</strong></p>
<pre><code class="language-java">// UsageQuotaService.java - reserveLlmTokensWithGlobalBudget()

public TokenReservationBundle reserveLlmTokensWithGlobalBudget(...) {
    List&lt;TokenReservation&gt; reservations = new ArrayList&lt;&gt;(3);
    try {
        // ① 用户日限额（个人维度）
        addIfActive(reservations, reserveLlmTokens(userId, ...));

        // ② 全网分钟预算（全局维度，防止瞬间高峰）
        addIfActive(reservations, reserveGlobalRollingTokens("llm", "minute",
            reserveTokens, minuteLimit, minuteWindowSeconds, "LLM全网分钟Token预算已达上限"));

        // ③ 全网日预算（全局维度，防止每天超支）
        addIfActive(reservations, reserveGlobalRollingTokens("llm", "day",
            reserveTokens, dayLimit, dayWindowSeconds, "LLM全网当日Token预算已达上限"));
    } catch (RuntimeException exception) {
        abortReservedTokens(reservations);  // 任意一个失败 → 全部回滚
        throw exception;
    }
    return TokenReservationBundle.of("llm", userId, reservations);
}</code></pre>
<pre><code class="language-text">三层配额检查：
┌─────────────────────────────────┐
│ 用户A 日限额：30万 token          │ ← 个人维度（quota:llm:2026-08-07:user:1）
├─────────────────────────────────┤
│ 全网分钟预算：5万 token/分钟      │ ← 全局维度（budget:llm:global:minute）
├─────────────────────────────────┤
│ 全网日预算：500万 token/天        │ ← 全局维度（budget:llm:global:day）
└─────────────────────────────────┘
三层都通过 → 放行
任意一层失败 → 全部回滚（前面预留的也退回去）</code></pre>
<p><strong>全局滚动窗口（sliding window）</strong></p>
<pre><code class="language-java">// UsageQuotaService.java - reserveGlobalRollingTokens()

private TokenReservation reserveGlobalRollingTokens(String scope, String windowLabel,
        int reserveTokens, long limit, long windowSeconds, String message) {
    String quotaKey = "budget:" + scope + ":global:" + windowLabel;

    Long total = stringRedisTemplate.opsForValue().increment(quotaKey, reserveTokens);

    // 第一次创建 key → 设置过期时间（窗口长度）
    if (total != null &amp;&amp; total == reserveTokens) {
        stringRedisTemplate.expire(quotaKey, windowSeconds, TimeUnit.SECONDS);
    }

    if (total != null &amp;&amp; total &gt; limit) {
        // 超限 → 回滚 + 抛异常
        stringRedisTemplate.opsForValue().increment(quotaKey, -reserveTokens);
        throw new RateLimitExceededException(message, ttl);
    }
    return new TokenReservation(...);
}</code></pre>
<p><strong>滚动窗口</strong>的原理：Key 的 TTL = 窗口长度，每次 INCR 后如果超限就回滚。窗口内所有
请求共享这个计数器，窗口过期自动清零。虽然不是严格意义的"滑动窗口"（没有按时间
分桶），但简单有效。</p>
<p><strong>管理员特殊配额</strong></p>
<pre><code class="language-java">// UsageQuotaProperties
admin-init-tokens: 100000  // 管理员初始 Embedding Token 比普通用户多 10 倍

// 新用户初始化时
if (user.getRole() == User.Role.ADMIN) {
    // 管理员：100000
} else {
    // 普通用户：10000
}</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>配额按 LLM / Embedding 双维度独立管理（Embedding 还细分上传/查询场景），每维
度叠加"用户日限额 + 全网分钟预算 + 全网日预算"三层检查，任一层超限则全部回滚；
Redis Key 按天/按窗口设置 TTL 自动过期，管理员有更高初始额度。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么要区分上传和查询两种 Embedding 场景？</strong>
A：上传向量化是"大额、一次性"消耗（一个文件几千到几万 token），查询向量化是
"小额、频繁"消耗（一次搜索几 token）。两者消耗特征差异大，预算单独控制更合理：
上传预算能防大文件刷爆，查询预算能防搜索接口被刷。</p>
<p><strong>Q2：全局预算和用户限额的关系？</strong>
A：用户限额防"单个用户"超支，全局预算防"所有用户加起来"超支。比如 100 个用户
各用了 290 万（都没超个人 30 万日限），但全网日预算 500 万早就爆了。必须两层
都检查。</p>
<p><strong>Q3：如果预留成功但调用失败会怎样？</strong>
A：abortReservation 把所有预留退回（用户级和全局级都退）。这样失败的操作不会
白白消耗配额。</p>
<hr>` },
      { "t": "技术点 44：速率限制 Rate Limiting", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：什么是限流？</strong></p>
<p>限流 = 控制单位时间内的请求次数，防止：
- 恶意刷接口（暴力破解登录）
- 意外高峰打垮服务
- 滥用免费额度</p>
<pre><code class="language-text">注册接口：同一 IP 每分钟最多 5 次
登录接口：同一 IP 每分钟最多 10 次
聊天接口：同一用户每分钟最多 20 次
Embedding 查询：同一用户每分钟最多 30 次</code></pre>
<p><strong>核心代码：固定窗口限流</strong></p>
<pre><code class="language-java">// RateLimitService.java - checkSingleWindow()

private void checkSingleWindow(String key, long max, long windowSeconds, String message) {
    // 1. 计数器 +1（原子操作）
    Long current = stringRedisTemplate.opsForValue().increment(key);
    // Redis: INCR login:ip:192.168.1.1

    // 2. 第一次计数 → 设置过期时间（窗口长度）
    if (current == 1) {
        stringRedisTemplate.expire(key, windowSeconds, TimeUnit.SECONDS);
        // EXPIRE login:ip:192.168.1.1 60  → 60 秒窗口
    }

    // 3. 超过阈值 → 拒绝 + 告诉客户端多久后重试
    if (current &gt; max) {
        Long ttl = stringRedisTemplate.getExpire(key, TimeUnit.SECONDS);
        long retryAfterSeconds = ttl == null || ttl &lt; 0 ? windowSeconds : ttl;
        throw new RateLimitExceededException(message, retryAfterSeconds);
        // 前端收到 429 + retryAfterSeconds，显示"请 X 秒后重试"
    }
}</code></pre>
<p><strong>为什么 INCR + EXPIRE 是原子安全的？</strong>
- INCR 是 Redis 单命令，并发时不会丢失计数
- <code>if (current == 1)</code> 判断第一次，设置窗口过期
- 窗口内的所有请求共享计数器</p>
<p><strong>各场景的限流配置</strong></p>
<pre><code class="language-java">// RateLimitService.java

// 注册：按 IP 限流
public void checkRegisterByIp(String ip) {
    checkSingleWindow("register:ip:" + ip,
        properties.getRegister().getMax(),           // 最大次数
        properties.getRegister().getWindowSeconds(), // 窗口秒数
        "注册请求过于频繁");
}

// 登录：按 IP 限流
public void checkLoginByIp(String ip) {
    checkSingleWindow("login:ip:" + ip, ...);
}

// 聊天：按用户限流
public void checkChatByUser(String userId) {
    RateLimitConfigService.WindowLimitView limit = ...getCurrentSettings().chatMessage();
    checkSingleWindow("chat:user:" + userId, limit.max(), limit.windowSeconds(), "聊天请求过于频繁");
    usageQuotaService.recordChatRequest(userId);  // 顺带记录请求数（统计用）
}

// Embedding 查询：分钟 + 日 双窗口
public void checkEmbeddingQueryByUser(String userId) {
    checkSingleWindow("embedding:query:min:user:" + userId, limit.minuteMax(), limit.minuteWindowSeconds(), ...);
    checkSingleWindow("embedding:query:day:user:" + userId, limit.dayMax(), limit.dayWindowSeconds(), ...);
}</code></pre>
<p><strong>限流阈值动态可配置</strong></p>
<pre><code class="language-java">// RateLimitConfigService - 支持运行时修改限流参数
// 管理员可以在管理后台调整限流阈值，无需重启
RateLimitConfigService.WindowLimitView limit = rateLimitConfigService.getCurrentSettings().chatMessage();</code></pre>
<p><strong>固定窗口限流的缺陷</strong></p>
<pre><code class="language-text">窗口边界突刺问题：

窗口1（00:00-00:01）：59 次请求
窗口2（00:01-00:02）：59 次请求

虽然每个窗口都没超 60 次，
但 00:00:59 到 00:01:01 这 2 秒内实际有 118 次请求！</code></pre>
<p>解决思路：滑动窗口（按时间分桶）、令牌桶、漏桶。本项目用固定窗口（简单够用）。</p>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>基于 Redis INCR + EXPIRE 实现固定窗口限流：按 IP（注册/登录）和按用户（聊天/
Embedding 查询）维度计数，超过阈值返回 429 并附带 retryAfterSeconds 提示，
限流参数支持运行时动态调整，聊天限流顺带记录请求数用于统计。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：固定窗口的边界突刺问题怎么解决？</strong>
A：① 滑动窗口：把窗口分成小桶（如 1 秒一桶），滑动统计；② 令牌桶：以恒定速率
补充令牌，请求消耗令牌；③ 漏桶：请求进队列匀速处理。本项目用固定窗口是因为
限流场景简单、实现成本低，突刺影响可接受。</p>
<p><strong>Q2：为什么登录限流按 IP 而不是按用户？</strong>
A：攻击者可以试不同的用户名（暴力破解），按用户限流拦不住。按 IP 可以限制攻击
来源。缺点是同一 NAT 后的多个用户共享 IP 会被误伤，可以结合"IP + 用户名"双维度。</p>
<p><strong>Q3：限流返回什么状态码？</strong>
A：429 Too Many Requests（HTTP 标准语义），配合 Retry-After 响应头/字段告诉客户端
多久后重试。前端收到 429 显示"操作过于频繁，请 X 秒后重试"而不是"系统错误"。</p>
<hr>` },
      { "t": "技术点 45：Token Reservation Bundle", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么需要 Bundle（捆绑）？</strong></p>
<p>一次 LLM 调用可能需要同时检查<strong>多个配额</strong>（技术点43讲过）：
1. 用户 LLM 日限额
2. 全网 LLM 分钟预算
3. 全网 LLM 日预算</p>
<p>如果分别管理，会出现部分成功部分失败的问题：</p>
<pre><code class="language-text">先预留①成功，预留②成功，预留③失败
→ ①和②的额度已经被扣了，但调用被拒绝了
→ ①和②的预留成了"幽灵扣费"</code></pre>
<p><strong>Bundle 的解决思路</strong>：把多个预留打包成一个整体，要么全部成功，要么全部回滚。</p>
<p><strong>核心代码：Bundle 的定义</strong></p>
<pre><code class="language-java">// UsageQuotaService.java

// 单个预留
public record TokenReservation(
    String scope,        // 维度：llm / embedding
    String userId,
    String quotaKey,     // Redis Key
    String metricKey,
    long reservedTokens, // 预留数量
    long limit,          // 限额
    long expiresInSeconds,
    boolean noop,        // 是否空操作（不管理配额时）
    boolean retainHistory
) {}

// 预留捆绑包
public record TokenReservationBundle(
    String scope,
    String userId,
    List&lt;TokenReservation&gt; reservations,  // 一组预留
    boolean noop
) {}</code></pre>
<p><strong>核心代码：全部成功或全部回滚</strong></p>
<pre><code class="language-java">// UsageQuotaService.java - reserveLlmTokensWithGlobalBudget()

public TokenReservationBundle reserveLlmTokensWithGlobalBudget(...) {
    List&lt;TokenReservation&gt; reservations = new ArrayList&lt;&gt;(3);

    try {
        // 逐个预留（前一个成功后才尝试下一个）
        addIfActive(reservations, reserveLlmTokens(userId, ...));          // ①用户日限
        addIfActive(reservations, reserveGlobalRollingTokens("llm", "minute", ...));  // ②分钟预算
        addIfActive(reservations, reserveGlobalRollingTokens("llm", "day", ...));     // ③日预算
    } catch (RuntimeException exception) {
        // ★ 任意一个预留失败 → 把之前成功的全部回滚
        abortReservedTokens(reservations);
        throw exception;
    }
    return TokenReservationBundle.of("llm", userId, reservations);
}

// 回滚：从后往前逐个释放
private void abortReservedTokens(List&lt;TokenReservation&gt; reservations) {
    for (int index = reservations.size() - 1; index &gt;= 0; index--) {
        abortReservation(reservations.get(index));
        // INCR quotaKey by -reservedTokens
    }
}</code></pre>
<p><strong>核心代码：结算/释放整个 Bundle</strong></p>
<pre><code class="language-java">// UsageQuotaService.java

// 整体结算：每个预留都按实际用量多退少补
public void settleReservation(TokenReservationBundle bundle, int actualTokens) {
    for (TokenReservation reservation : bundle.reservations()) {
        settleReservation(reservation, actualTokens);
        // 用户级：delta = actual - reserved → INCR
        // 全局级：同样 INCR 差额
    }
}

// 整体释放（调用失败时）
public void abortReservation(TokenReservationBundle bundle) {
    for (TokenReservation reservation : bundle.reservations()) {
        abortReservation(reservation);
    }
}</code></pre>
<p><strong>完整调用流程（LLM 对话）</strong></p>
<pre><code class="language-java">// LlmProviderRouter.java - streamResponse()

// 1. 预估 Prompt Token
int estimatedPromptTokens = usageQuotaService.estimateChatTokens(messages);
int maxCompletionTokens = aiProperties.getGeneration().getMaxTokens();  // 2000

// 2. 预留 Bundle（三层：用户日限 + 全网分钟 + 全网日限）
TokenReservationBundle reservation = rateLimitService.reserveLlmUsage(
    requesterId, estimatedPromptTokens, maxCompletionTokens);

try {
    // 3. 流式调用 LLM
    Disposable subscription = buildClient(provider).post()...subscribe(
        chunk -&gt; ...,          // 流式处理
        error -&gt; { settleUsage(usageTracker); onError.accept(error); },
        () -&gt; { settleUsage(usageTracker); onComplete.accept(...); }
    );
    return new StreamHandle(subscription, () -&gt; settleUsage(usageTracker));
} catch (Exception exception) {
    usageQuotaService.abortReservation(reservation);  // 调用失败 → 整体释放
    throw exception;
}</code></pre>
<p><strong>noop 模式</strong></p>
<pre><code class="language-java">// 不管理配额的用户（如 system 内部调用）→ 空预留
public static TokenReservation noop(String scope, String userId) {
    return new TokenReservation(scope, userId, "", "", 0, 0, 0, true, false);
}

// noop 的预留/结算/释放都是空操作：
//   reserve → 不 INCR
//   settle  → 不处理
//   abort   → 不处理
// 用于统一代码路径：调用方不用区分"管不管配额"</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>TokenReservationBundle 把一次调用涉及的多个预留（用户日限 + 全网分钟/日预算）
捆绑成一个整体：逐个预留，任意一个失败就把前面成功的全部回滚（防止幽灵扣费）；
调用成功后整体结算多退少补，失败时整体释放；不管理配额的用户走 noop 空预留
统一代码路径。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：不用 Bundle，分别管理三个配额会有什么问题？</strong>
A：① 幽灵扣费：前两个预留成功、第三个失败，前两个的额度没有释放，用户被白白扣费；
② 代码重复：每个调用点都要写三段预留+三段回滚逻辑；③ 容易遗漏：失败路径忘了回滚
某些预留。Bundle 把这些封装成一个整体。</p>
<p><strong>Q2：noop 设计的意义？</strong>
A：让"配额管理"对调用方透明。调用方不用写 <code>if (quotaManaged) { reserve }</code> 这类
判断，直接调 <code>reserveLlmUsage()</code> 拿到 Bundle 就走统一流程。内部不管理的场景返回
noop，后续的 settle/abort 自动跳过。这是"空对象模式"（Null Object Pattern）。</p>
<p><strong>Q3：结算时用户级和全局级扣的是一样的实际用量吗？</strong>
A：是的。actualTokens 是实际消耗，每个预留都按同一个实际值结算差额。区别只是
Redis Key 不同（用户级 Key 按用户分，全局级 Key 全网共享）。</p>
<hr>` },
      { "t": "完整链路总结", "tag": "我的整理", "p": "core", "html": `<pre><code class="language-text">[用户发起对话 / 上传文件]
  │
  ▼
44. 限流检查（RateLimitService）
  │  按用户：聊天限流 / Embedding 查询限流
  │  按 IP：注册/登录限流
  │  → 超过阈值 → 429 + retryAfterSeconds
  │
  ▼
41. 预估 Token（UsageQuotaService.estimateXxx）
  │  ASCII × 0.30 + 中文 × 0.95 + 固定开销
  │
  ▼
45. 预留 Bundle（三层配额）
  │  ① 用户日限额（quota:{scope}:{day}:user:{id}）
  │  ② 全网分钟预算（budget:{scope}:global:minute）
  │  ③ 全网日预算（budget:{scope}:global:day）
  │  → 任意失败 → 全部回滚 → 拒绝调用
  │
  ▼
[调用 LLM / Embedding API]
  │
  ├── 成功 → 41. 结算：INCR 差额（多退少补）
  │
  ├── 失败 → 41. 释放：INCR -预留量（全额退款）
  │
  └── 上传场景 → 42. 合并时先预估算（+15%安全系数）
  │
  ▼
[42. 预估 vs 实际对照 → 43. 双维度配额管理（LLM/Embedding独立）]</code></pre>` }
    ]
  });

  mine.chapters.push({
    "no": "8",
    "title": "八、LLM 多模型路由（3个技术点）（技术点 46–48 · 4 节）",
    "questions": [
      { "t": "技术点 46：多模型 Provider 动态路由", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么需要多模型路由？</strong></p>
<p>企业级 AI 系统通常不止用一个模型服务商：</p>
<pre><code class="language-text">LLM 服务商（生成回答）：
  DeepSeek（deepseek-chat）     ← 默认
  通义千问（qwen-flash）
  智谱（glm-4.5-air）

Embedding 服务商（向量化）：
  阿里云（text-embedding-v4）   ← 默认
  智谱（embedding-3）</code></pre>
<p>多模型的好处：
- <strong>容灾</strong>：一个服务商挂了，切换到另一个
- <strong>成本优化</strong>：简单问题用便宜模型，复杂问题用贵模型
- <strong>灵活性</strong>：不同客户/场景用不同模型</p>
<p><strong>核心代码：默认配置（内置三套 LLM + 两套 Embedding）</strong></p>
<pre><code class="language-java">// ModelProviderConfigService.java - buildDefaultSettings()

private ModelProviderSettingsView buildDefaultSettings() {
    // LLM 配置组
    ScopeSettingsView llm = new ScopeSettingsView(
        SCOPE_LLM,                       // 配置组：llm
        "deepseek",                      // 默认激活：deepseek
        List.of(
            new ProviderConfigView(
                "deepseek", "DeepSeek",                    // providerCode, 显示名
                API_STYLE_OPENAI,                          // 协议风格：openai-compatible
                deepSeekApiUrl,                            // API 地址
                deepSeekModel,                             // 模型名：deepseek-chat
                null,                                      // 维度（LLM 不需要）
                true, true,                                // enabled=true, active=true
                hasValue(deepSeekApiKey),                  // 是否已配置 Key
                secretCryptoService.mask(deepSeekApiKey)   // 脱敏后的 Key（显示用）
            ),
            new ProviderConfigView("qwen", "Qwen", API_STYLE_OPENAI,
                "https://dashscope.aliyuncs.com/compatible-mode/v1",
                "qwen-flash", null, true, false, false, ""),   // active=false
            new ProviderConfigView("zhipu", "ZhipuAI", API_STYLE_OPENAI,
                "https://open.bigmodel.cn/api/paas/v4",
                "glm-4.5-air", null, true, false, false, "")   // active=false
        )
    );

    // Embedding 配置组
    ScopeSettingsView embedding = new ScopeSettingsView(
        SCOPE_EMBEDDING,
        "aliyun",                        // 默认激活：aliyun
        List.of(
            new ProviderConfigView("aliyun", "阿里云", API_STYLE_OPENAI,
                embeddingApiUrl, embeddingModel, embeddingDimension,  // 含 2048 维度
                true, true, ...),
            new ProviderConfigView("zhipu", "智谱AI", API_STYLE_OPENAI,
                "https://open.bigmodel.cn/api/paas/v4",
                "embedding-3", 2048, true, false, ...)
        )
    );
    return new ModelProviderSettingsView(llm, embedding);
}</code></pre>
<p><strong>核心代码：获取当前激活的 Provider</strong></p>
<pre><code class="language-java">// ModelProviderConfigService.java - getActiveProvider()

public ActiveProviderView getActiveProvider(String scope) {
    // scope = "llm" 或 "embedding"
    ScopeSettingsView settings = resolveScope(scope, currentSettings);

    return settings.providers().stream()
        .filter(ProviderConfigView::active)   // 只找 active=true 的
        .findFirst()                          // 取第一个
        .map(this::toActiveProvider)
        .orElseThrow(() -&gt; new CustomException(
            "未找到激活的模型配置: " + scope, HttpStatus.INTERNAL_SERVER_ERROR));
}</code></pre>
<p><strong>核心代码：数据库持久化 + 运行时覆盖</strong></p>
<pre><code class="language-java">// ModelProviderConfigService.java - mergeScope()

private ScopeSettingsView mergeScope(ScopeSettingsView defaults, List&lt;ModelProviderConfig&gt; configs) {
    // 1. 先复制默认配置
    Map&lt;String, ProviderConfigView&gt; merged = toProviderMap(defaults.providers());

    // 2. 数据库配置覆盖默认值
    for (ModelProviderConfig config : configs) {
        if (!defaults.scope().equals(config.getConfigScope())) continue;

        // 解密 API Key（数据库里是密文）
        String decryptedApiKey = secretCryptoService.decrypt(config.getApiKeyCiphertext());

        merged.put(config.getProviderCode(), new ProviderConfigView(
            config.getProviderCode(),
            config.getDisplayName(),
            config.getApiStyle(),
            normalizeOpenAiCompatibleBaseUrl(config.getApiBaseUrl()),  // 规范化 URL
            config.getModelName(),
            config.getEmbeddingDimension() != null ? config.getEmbeddingDimension() : fallback.dimension(),
            config.isEnabled(),
            config.isActive(),
            hasValue(decryptedApiKey),
            secretCryptoService.mask(decryptedApiKey)
        ));

        if (config.isActive()) {
            activeProvider = config.getProviderCode();  // 数据库激活的覆盖默认
        }
    }
    return new ScopeSettingsView(defaults.scope(), activeProvider, providers);
}

// 管理员在管理界面修改配置 → 保存到 MySQL → reloadSettings() 刷新内存
public synchronized void reloadSettings() {
    this.currentSettings = mergeOverrides(buildDefaultSettings(), repository.findAll());
    // volatile 变量：其他线程立即可见新配置
}</code></pre>
<p><strong>核心代码：API Key 加密存储</strong></p>
<pre><code class="language-java">// SecretCryptoService - API Key 不存明文

// 保存时：明文 → 加密 → 密文存 MySQL
entity.setApiKeyCiphertext(resolveCiphertext(item.apiKey(), fallback));

// 读取时：密文 → 解密 → 使用
String decryptedApiKey = secretCryptoService.decrypt(config.getApiKeyCiphertext());

// 展示时：脱敏（只显示部分字符）
secretCryptoService.mask(decryptedApiKey);  // "sk-abc***xyz"</code></pre>
<p><strong>Embedding 模型切换的保护</strong></p>
<pre><code class="language-java">// ModelProviderConfigService.java - updateScope()

if (SCOPE_EMBEDDING.equals(normalizedScope)
        &amp;&amp; !Objects.equals(request.activeProvider(), currentActiveProvider)) {

    // 切换 Embedding 模型 = 所有旧向量失效（不同模型的向量空间不兼容！）
    if (requiresEmbeddingReindex(currentActiveConfig, target)) {
        throw new CustomException(
            "Embedding 模型切换需要重嵌入任务，当前版本不支持直接切换 active provider",
            HttpStatus.CONFLICT);
    }
}
// ★ 关键设计：切换 Embedding 模型会导致所有历史向量无法检索
//   （不同模型的 2048 维向量不在同一个语义空间）
//   所以直接拒绝切换，必须走"重嵌入全部文档"流程</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>通过 ModelProviderConfigService 管理多模型路由：内置 DeepSeek/通义/智谱三套 LLM
和阿里/智谱两套 Embedding 配置（含 API Key 加密存储、脱敏展示），数据库配置可
运行时覆盖默认值并刷新 volatile 内存快照，调用时按 scope 过滤 active 配置获取
当前激活的 Provider；切换 Embedding 模型会拒绝（需重嵌入全部文档）。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：volatile 在这里起什么作用？</strong>
A：currentSettings 是 volatile 变量。reloadSettings() 在管理线程中更新它，其他
线程（请求处理线程）读它时保证看到最新值（volatile 保证可见性，防止线程缓存旧值）。</p>
<p><strong>Q2：为什么切换 Embedding 模型要拒绝？</strong>
A：不同 Embedding 模型生成的向量不在同一个语义空间。用 text-embedding-v4 生成的
向量和用 embedding-3 生成的向量无法直接比较相似度。切换模型后，ES 里所有旧向量
都"失效"了，必须重新向量化全部文档（重嵌入），这是一项大工程，所以当前版本直接
拒绝切换。</p>
<p><strong>Q3：API Key 为什么不存明文？</strong>
A：MySQL 如果泄露，明文 Key 会被盗用（调用方承担费用）。加密存储（密文）即使
数据库泄露，攻击者也拿不到原始 Key。解密只在内存中使用。展示时用 mask 脱敏，
防止管理界面截图泄露。</p>
<hr>` },
      { "t": "技术点 47：WebClient 响应式 HTTP 客户端", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：RestTemplate vs WebClient</strong></p>
<pre><code class="language-text">RestTemplate（传统阻塞式）：
  发请求 → 线程阻塞等待响应 → 拿到响应继续
  问题：每个请求占用一个线程，并发高时线程池耗尽

WebClient（响应式）：
  发请求 → 立即返回（不阻塞）→ 响应到达时回调处理
  优势：一个线程可以同时处理多个请求，天然支持流式</code></pre>
<p>本项目用 WebClient 的核心原因：<strong>LLM 的流式响应（SSE）需要逐步处理</strong>，
RestTemplate 做不到"边接收边处理"。</p>
<p><strong>核心代码：构建 WebClient</strong></p>
<pre><code class="language-java">// LlmProviderRouter.java - buildClient()

private WebClient buildClient(ActiveProviderView provider) {
    WebClient.Builder builder = WebClient.builder()
        .baseUrl(ModelProviderConfigService.normalizeOpenAiCompatibleBaseUrl(
            provider.apiBaseUrl()));  // 规范化 baseUrl

    if (provider.apiKey() != null &amp;&amp; !provider.apiKey().isBlank()) {
        builder.defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + provider.apiKey());
        // 所有请求自动带 Authorization: Bearer sk-xxx
    }
    return builder.build();
}</code></pre>
<p><strong>核心代码：一次性请求（bodyToMono）</strong></p>
<pre><code class="language-java">// LlmProviderRouter.java - completeReActTurn()（非流式 ReAct 回合）

String responseBody = buildClient(provider)
    .post()
    .uri("/chat/completions")
    .contentType(MediaType.APPLICATION_JSON)
    .bodyValue(request)                 // 请求体（model + messages + tools）
    .retrieve()                          // 发起请求
    .bodyToMono(String.class)            // 响应体转 Mono&lt;String&gt;（一次性）
    .block(Duration.ofSeconds(90));      // 阻塞等待，最多 90 秒
// Mono = 0 或 1 个元素的响应式流
// block() = 把响应式转为阻塞（简单场景用）</code></pre>
<p><strong>核心代码：流式请求（bodyToFlux）</strong></p>
<pre><code class="language-java">// LlmProviderRouter.java - streamResponse()

Disposable subscription = buildClient(provider)
    .post()
    .uri("/chat/completions")
    .contentType(MediaType.APPLICATION_JSON)
    .bodyValue(request)                  // stream: true
    .retrieve()
    .bodyToFlux(String.class)            // ★ 响应体转 Flux&lt;String&gt;（数据流）
    .subscribe(                          // 订阅：每个数据块都会回调
        chunk -&gt; processChunk(chunk, usageTracker, onChunk),  // 收到一个数据块
        error -&gt; { settleUsage(usageTracker); onError.accept(error); },  // 出错
        () -&gt; { settleUsage(usageTracker); onComplete.accept(completion); }  // 完成
    );

return new StreamHandle(subscription, () -&gt; settleUsage(usageTracker));
// StreamHandle 封装了 Disposable，供外部取消</code></pre>
<p><strong>响应式编程核心概念（面试要能讲）</strong></p>
<pre><code class="language-text">Mono&lt;T&gt;：0 或 1 个元素
  Mono&lt;String&gt; = 可能有一个字符串（一次性响应）

Flux&lt;T&gt;：0 到 N 个元素
  Flux&lt;String&gt; = 一串字符串（流式响应）

subscribe()：订阅（开始处理）
  onNext → 每个元素
  onError → 出错
  onComplete → 全部完成

Disposable：订阅句柄
  dispose() → 取消订阅（停止接收，断开连接）</code></pre>
<p><strong>核心代码：Embedding 的重试机制</strong></p>
<pre><code class="language-java">// EmbeddingClient.java - callApiOnce()

return buildClient(provider).post()
    .uri("/embeddings")
    .bodyValue(requestBody)
    .retrieve()
    .bodyToMono(String.class)
    .retryWhen(Retry.fixedDelay(3, Duration.ofSeconds(1))  // 固定延迟重试 3 次
        .filter(e -&gt; e instanceof WebClientResponseException)  // 只重试 HTTP 错误
        .doBeforeRetry(signal -&gt; logger.warn("重试API调用 - 尝试: {}, 错误: {}",
            signal.totalRetries() + 1, signal.failure().getMessage())))
    .block(Duration.ofSeconds(30));  // 整体超时 30 秒</code></pre>
<p><strong>缓冲区大小调整</strong></p>
<pre><code class="language-java">// EmbeddingClient.java - buildClient()

WebClient.Builder builder = WebClient.builder()
    .baseUrl(...)
    // WebClient 默认缓冲区大小限制 256KB！
    .codecs(configurer -&gt; configurer.defaultCodecs().maxInMemorySize(16 * 1024 * 1024));
    // 调高到 16MB：批量 Embedding 的响应可能超过 256KB</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>使用 WebClient 响应式客户端调用 LLM/Embedding API：普通调用用 bodyToMono +
block()，流式输出用 bodyToFlux + subscribe()（每个 SSE 数据块回调一次）；支持
fixedDelay 重试（只重试 HTTP 错误）和超时控制，通过 Disposable 句柄支持主动取消；
同时调大了默认缓冲区限制（256KB → 16MB）以容纳批量 Embedding 响应。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么不用 RestTemplate？</strong>
A：RestTemplate 是阻塞式的，无法处理流式响应（SSE 需要边接收边处理）。而且阻塞
模型在高并发下会耗尽线程池。WebClient 基于 Reactor 响应式模型，一个线程可处理
多个请求，天然支持流式。</p>
<p><strong>Q2：Mono 和 Flux 的区别？</strong>
A：Mono 是 0 或 1 个元素的流（一次性响应，如普通 API 返回），Flux 是 0 到 N 个
元素的流（如 SSE 流式响应，每个 chunk 是一个元素）。</p>
<p><strong>Q3：block() 是不是违背了响应式？</strong>
A：是。block() 把响应式流转回阻塞，会阻塞调用线程。项目中的 ReAct 回合（completeReActTurn）
用了 block()，因为需要拿到完整响应才能解析 tool_calls。但流式路径（streamResponse）
用的是 subscribe()，没有阻塞。简单场景用 block 简化代码是可以接受的。</p>
<hr>` },
      { "t": "技术点 48：OpenAI 兼容协议适配", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：什么是 OpenAI 兼容协议？</strong></p>
<p>OpenAI 定义了 LLM API 的标准格式（请求和响应结构）。大多数国产模型服务商
（DeepSeek、通义千问、智谱）都<strong>兼容 OpenAI 的协议</strong>：</p>
<pre><code class="language-text">请求格式统一：
  POST {baseUrl}/chat/completions
  { "model": "...", "messages": [...], "stream": true }

响应格式统一：
  {"choices":[{"delta":{"content":"..."}}]}

差异只在：baseUrl 不同、model 名不同、API Key 不同</code></pre>
<p>所以系统可以写一套代码，只切换 baseUrl/model/key 就能调用不同服务商。</p>
<p><strong>核心代码：URL 规范化</strong></p>
<pre><code class="language-java">// ModelProviderConfigService.java - normalizeOpenAiCompatibleBaseUrl()

public static String normalizeOpenAiCompatibleBaseUrl(String rawUrl) {
    if (rawUrl == null || rawUrl.isBlank()) {
        return rawUrl;
    }
    // 去掉末尾多余的斜杠
    String trimmed = rawUrl.trim();
    while (trimmed.endsWith("/")) {
        trimmed = trimmed.substring(0, trimmed.length() - 1);
    }
    return trimmed;
}
// 保证 baseUrl 是 "https://api.deepseek.com/v1" 格式（无尾斜杠）
// 这样 .uri("/chat/completions") 拼接后是 "https://api.deepseek.com/v1/chat/completions"
// 不会出现 "//chat/completions" 双斜杠问题</code></pre>
<p><strong>统一端点</strong></p>
<pre><code class="language-java">// ModelProviderConfigService.java

private static final String CHAT_COMPLETIONS_PATH = "/chat/completions";
private static final String EMBEDDINGS_PATH = "/embeddings";

// LLM 调用：POST {baseUrl}/chat/completions
// Embedding 调用：POST {baseUrl}/embeddings
// 所有服务商都实现了这两个端点（OpenAI 兼容）</code></pre>
<p><strong>不同服务商的实际配置</strong></p>
<div class="table-wrap"><table>
<thead><tr><th>服务商</th><th>baseUrl</th><th>模型名</th><th>端点</th></tr></thead>
<tbody>
<tr><td>DeepSeek</td><td>https://api.deepseek.com/v1</td><td>deepseek-chat</td><td>/chat/completions</td></tr>
<tr><td>通义千问</td><td>https://dashscope.aliyuncs.com/compatible-mode/v1</td><td>qwen-flash</td><td>/chat/completions</td></tr>
<tr><td>智谱</td><td>https://open.bigmodel.cn/api/paas/v4</td><td>glm-4.5-air</td><td>/chat/completions</td></tr>
<tr><td>阿里 Embedding</td><td>https://dashscope.aliyuncs.com/compatible-mode/v1</td><td>text-embedding-v4</td><td>/embeddings</td></tr>
</tbody></table></div>
<p><strong>注意</strong>：通义千问的地址是 <code>compatible-mode/v1</code>——"compatible-mode" 就是兼容模式，
阿里专门提供了 OpenAI 兼容的接入方式。</p>
<p><strong>核心代码：请求构造（OpenAI 格式）</strong></p>
<pre><code class="language-java">// LlmProviderRouter.java - buildReActRequest()

private Map&lt;String, Object&gt; buildReActRequest(String model,
        List&lt;Map&lt;String, Object&gt;&gt; messages, List&lt;AgentToolRegistry.AgentTool&gt; tools,
        int maxCompletionTokens, boolean stream) {
    Map&lt;String, Object&gt; request = new LinkedHashMap&lt;&gt;();
    request.put("model", model);
    request.put("messages", messages);
    request.put("stream", stream);
    request.put("max_tokens", Math.max(maxCompletionTokens, 1));

    if (stream) {
        request.put("stream_options", Map.of("include_usage", true));
        // 流式响应中携带 usage 字段（token 统计）
    }

    if (gen.getTemperature() != null) request.put("temperature", gen.getTemperature());
    if (gen.getTopP() != null) request.put("top_p", gen.getTopP());

    if (tools != null &amp;&amp; !tools.isEmpty()) {
        request.put("tools", buildOpenAiTools(tools));   // 工具列表（OpenAI 格式）
        request.put("tool_choice", "auto");
    }
    return request;
}</code></pre>
<p><strong>核心代码：响应解析（OpenAI 格式）</strong></p>
<pre><code class="language-java">// LlmProviderRouter.java - processChunk()（流式响应解析）

private void processChunk(String rawChunk, StreamUsageTracker usageTracker, Consumer&lt;String&gt; onChunk) {
    // SSE 原始格式：
    // data: {"choices":[{"delta":{"content":"你"}}],"usage":{...}}
    // data: [DONE]

    for (String payload : extractPayloads(rawChunk)) {  // 去掉 "data: " 前缀
        if ("[DONE]".equals(payload)) continue;          // 结束标记

        JsonNode node = objectMapper.readTree(payload);
        // OpenAI 流式响应结构：
        // { "choices": [ { "delta": { "content": "..." } } ] }
        String content = node.path("choices").path(0)
            .path("delta").path("content").asText("");

        // usage 字段（stream_options.include_usage=true 时返回）
        JsonNode usageNode = node.path("usage");
        if (usageNode.isObject()) {
            usageTracker.promptTokens = usageNode.path("prompt_tokens").asInt(...);
            usageTracker.completionTokens = usageNode.path("completion_tokens").asInt(...);
        }

        if (!content.isEmpty()) {
            onChunk.accept(content);
        }
    }
}</code></pre>
<p><strong>连接测试</strong></p>
<pre><code class="language-java">// ModelProviderConfigService.java - testConnection()

// 管理员配置新服务商时，可以先测试连通性：
// LLM：发一条 "ping" 消息，max_tokens=1，8 秒超时
// Embedding：把 "ping" 向量化，8 秒超时
// 成功 → "连接成功" + 耗时
// 失败 → 错误原因（网络/鉴权/模型不存在）</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>所有模型服务商统一走 OpenAI 兼容协议：baseUrl 规范化（去尾斜杠）后拼接统一的
/chat/completions 和 /embeddings 端点，请求构造和响应解析（含流式 delta、usage、
tool_calls）都是 OpenAI 标准格式，切换服务商只需更换 baseUrl/model/API Key，
并提供连接测试功能供管理员验证新配置。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：如果某家服务商不兼容 OpenAI 协议怎么办？</strong>
A：可以在 ProviderConfigView 中增加 apiStyle 字段区分（当前只有 openai-compatible），
然后为不兼容的服务商写单独的适配器（Adapter 模式）。当前所有内置服务商都兼容
OpenAI 协议，所以只需要一套实现。</p>
<p><strong>Q2：兼容协议有什么坑？</strong>
A：① 各家对参数的支持程度不同（有的不支持 tools、有的不支持 stream_options）；
② 错误格式不统一（有的返回 OpenAI 格式的 error，有的返回自定义格式）；③ 部分
服务商对 max_tokens 上限不同。所以解析和错误处理要做防御性编码。</p>
<p><strong>Q3：为什么要测试连接功能？</strong>
A：管理员配置新服务商时容易填错（URL 拼写、Key 复制错、模型名不存在）。测试连接
用最小请求（1 个 token）快速验证配置是否可用，避免配置错误影响线上流量。</p>
<hr>` },
      { "t": "完整链路总结", "tag": "我的整理", "p": "core", "html": `<pre><code class="language-text">[管理员配置模型]
  │ 46. 管理界面 → updateScope() → 校验 → API Key 加密存 MySQL
  │     → reloadSettings() → 刷新 volatile 内存快照
  │     → testConnection() 验证连通性
  │
  ▼
[业务调用]
  │ 46. getActiveProvider("llm") → 找到 active=true 的配置
  │ 48. 规范化 baseUrl → 统一 /chat/completions 或 /embeddings 端点
  │
  ▼
[WebClient]
  │ 47. bodyToFlux + subscribe → 流式处理每个 SSE chunk
  │     bodyToMono + block → 一次性调用（ReAct 非流式回合）
  │     重试：HTTP 错误最多重试 3 次
  │     超时：LLM 120 秒 / Embedding 30 秒
  │     取消：Disposable.dispose()
  │
  ▼
[响应解析]
  │ 48. OpenAI 标准格式：choices[0].delta.content（流式）
  │     usage 字段 → Token 统计 → 结算配额
  │     tool_calls → ReAct 工具调用
  │
  ▼
[推送给前端 / 写库]</code></pre>` }
    ]
  });

  mine.chapters.push({
    "no": "9",
    "title": "九、前端工程（5个技术点）（技术点 49–53 · 6 节）",
    "questions": [
      { "t": "技术点 49：前端文件 MD5 计算", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么在前端算 MD5？</strong></p>
<p>后端合并文件时需要识别"哪些分片属于哪个文件"，用 fileMd5 作为唯一标识。
MD5 的计算可以在前端（浏览器）或后端（服务器）：</p>
<pre><code class="language-text">前端算：选完文件立刻算（不占服务器 CPU），但大文件会卡浏览器
后端算：上传完成后算（占服务器 CPU），前端只传数据</code></pre>
<p>本项目选<strong>前端计算</strong>：选完文件就算出 MD5，整个上传流程都带着它。</p>
<p><strong>核心代码：分片读取 + 增量计算</strong></p>
<pre><code class="language-typescript">// utils/common.ts - calculateMD5()

import SparkMD5 from 'spark-md5';  // 增量 MD5 计算库

export async function calculateMD5(file: File): Promise&lt;string&gt; {
  return new Promise((resolve, reject) =&gt; {
    const chunkSize = 5 * 1024 * 1024;  // 每片 5MB（和上传分片大小一致）
    const spark = new SparkMD5.ArrayBuffer();  // 增量累加器
    const reader = new FileReader();
    let currentChunk = 0;

    const loadNext = () =&gt; {
      const start = currentChunk * chunkSize;
      const end = Math.min(start + chunkSize, file.size);

      if (start &gt;= file.size) {
        resolve(spark.end());  // 所有分片都读完 → 输出最终 MD5
        return;
      }

      const blob = file.slice(start, end);  // 取出一片
      reader.readAsArrayBuffer(blob);        // 异步读取
    };

    reader.onload = e =&gt; {
      spark.append(e.target?.result as ArrayBuffer);  // 增量累加
      currentChunk += 1;
      loadNext();  // 继续读下一片
    };

    reader.onerror = () =&gt; reject(new Error('文件读取失败'));
    loadNext();  // 开始
  });
}</code></pre>
<p><strong>为什么不能一次性读取整个文件？</strong></p>
<pre><code class="language-typescript">// ❌ 错误做法：一次性读整个文件
reader.readAsArrayBuffer(file);
// 1GB 文件 → 1GB ArrayBuffer → 浏览器内存爆炸/卡死

// ✅ 正确做法：分片读取（5MB 一片）
// 每次只读 5MB → 内存占用始终很小
// 而且和上传分片大小一致，逻辑统一</code></pre>
<p><strong>SparkMD5 的增量特性</strong></p>
<pre><code class="language-text">普通 MD5：把整个数据一次性算完 → 必须全部读进内存

SparkMD5 增量：可以分多次 append
  spark.append(第一片 5MB)
  spark.append(第二片 5MB)
  ...
  spark.end() → 得到完整文件的 MD5</code></pre>
<p><strong>前端计算的 MD5 和后端计算的 MD5 一致吗？</strong>
一致。MD5 算法是确定性的——同样的字节序列，无论分多少次喂进去，结果相同。</p>
<p><strong>数据示例</strong></p>
<pre><code class="language-text">1GB 文件：
  分 205 次读取（每次 5MB）
  每次读完后 spark.append()
  最后 spark.end() → "a1b2c3d4e5f6..."（32 位十六进制字符串）

耗时：1GB 读取 + MD5 计算 ≈ 2-5 秒（视机器性能）</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>前端用 SparkMD5 增量算法计算文件 MD5：按 5MB 分片用 FileReader 异步读取文件，
每读一片就 append 到累加器，全部读完输出 32 位 MD5，避免一次性读取大文件导致
浏览器内存爆炸。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么不用 Web Worker 计算 MD5？</strong>
A：主线程计算大文件 MD5 会阻塞 UI（用户操作卡顿）。用 Web Worker 可以在后台线程
计算，不阻塞界面。本项目直接在主线程算（实现简单），这是一个可优化点。</p>
<p><strong>Q2：MD5 计算和分片上传为什么都用 5MB？</strong>
A：统一分片大小，代码逻辑一致（同一个 chunkSize 常量），也避免维护两套大小。</p>
<p><strong>Q3：如果用户选择文件后立刻改了文件内容怎么办？</strong>
A：浏览器 File 对象是"快照"，选择时确定的文件内容不会变（除非用 File System Access
API 实时操作）。所以 MD5 计算后内容固定，不存在不一致。</p>
<hr>` },
      { "t": "技术点 50：文件级 + 分片级双层并发控制", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么控制并发？</strong></p>
<pre><code class="language-text">不限并发：用户拖入 10 个文件 → 同时上传 10 个 × 每个 4 片 = 40 个请求
  → 服务器压力大、带宽打满、其他用户受影响

控制并发：
  文件级：最多 3 个文件同时上传
  分片级：每个文件最多 4 片同时上传
  → 最多 12 个并发请求，可控</code></pre>
<p><strong>核心代码：文件级并发控制</strong></p>
<pre><code class="language-typescript">// knowledge-base/index.ts

const activeUploads = ref&lt;Set&lt;string&gt;&gt;(new Set());  // 正在上传的文件 MD5 集合

async function startUpload() {
  // 文件级限制：最多 3 个文件同时上传
  if (activeUploads.value.size &gt;= 3) return;

  // 找待上传的文件（状态是 Pending 且不在上传中）
  const pendingTasks = tasks.value.filter(
    t =&gt; t.status === UploadStatus.Pending &amp;&amp; !activeUploads.value.has(t.fileMd5)
  );
  if (pendingTasks.length === 0) return;

  // 取第一个开始上传
  const task = pendingTasks[0];
  task.status = UploadStatus.Uploading;
  activeUploads.value.add(task.fileMd5);  // 标记为"正在上传"

  try {
    // ... 上传分片逻辑 ...
  } finally {
    activeUploads.value.delete(task.fileMd5);  // 移除标记
    startUpload();  // 递归尝试下一个文件（排队机制）
  }
}</code></pre>
<p><strong>队列机制</strong>：拖入 5 个文件 → 前 3 个开始上传 → 任意一个完成 → finally 里调用
startUpload() → 第 4 个开始 → 再完成一个 → 第 5 个开始。</p>
<p><strong>核心代码：分片级并发控制（Worker Pool）</strong></p>
<pre><code class="language-typescript">// knowledge-base/index.ts

const maxConcurrentChunksPerFile = 4;  // 每个文件最多 4 片并发

async function uploadChunksInParallel(task, chunkIndexes: number[]) {
  let uploadError: Error | null = null;

  // worker 数量 = min(4, 剩余分片数)
  const workerCount = Math.min(maxConcurrentChunksPerFile, chunkIndexes.length);

  const runWorker = async (): Promise&lt;void&gt; =&gt; {
    if (uploadError) return;  // 已有失败 → 不取新任务

    const chunkIndex = chunkIndexes.shift();  // 从队列头部取一片
    if (chunkIndex === undefined) return;      // 队列空 → 退出

    const success = await uploadChunk(task, chunkIndex);
    if (!success) {
      uploadError = new Error(\`分片 \${chunkIndex} 上传失败\`);
      return;
    }
    await runWorker();  // 成功 → 递归取下一片
  };

  // 启动 N 个 worker
  const workers = Array.from({ length: workerCount }, () =&gt; runWorker());
  await Promise.all(workers);  // 等所有 worker 结束

  if (uploadError) throw uploadError;
}</code></pre>
<p><strong>两层并发的关系</strong></p>
<pre><code class="language-text">文件队列（最多3个并发）
  │
  ├── 文件A：4 路分片并发上传
  ├── 文件B：4 路分片并发上传
  └── 文件C：4 路分片并发上传
       └── 总计最多 3×4 = 12 个并发 HTTP 请求</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>双层并发控制：文件级用 activeUploads Set 限制最多 3 个文件同时上传（完成后递归
启动下一个排队文件），分片级用 Worker Pool 模式限制每个文件最多 4 片并发，总计
最多 12 个并发请求。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么文件级用 Set 而不是数字计数？</strong>
A：Set 天然去重（同一文件不会重复加入），且可以直接判断"某个文件是否在上传中"
（has 方法）。如果同一 MD5 的文件被重复拖入，enqueueUpload 会先检查 existingTask
状态，Set 也能防止重复启动。</p>
<p><strong>Q2：并发数怎么定的？</strong>
A：经验值。3 个文件 × 4 片 = 12 个并发请求，对后端压力适中，同时能充分利用带宽。
并发太高会打满带宽（每个请求都慢），太低则利用率不足。</p>
<hr>` },
      { "t": "技术点 51：上传状态持久化与断点恢复", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：上传任务的状态机</strong></p>
<pre><code class="language-text">Pending（等待上传）
  │ startUpload()
  ▼
Uploading（上传中）
  │ 失败
  ▼
Break（中断）── 用户点重试 ──→ Pending（重新排队）
  │ 全部成功
  ▼
Completed（已完成）</code></pre>
<p><strong>核心代码：任务状态管理（Pinia Store）</strong></p>
<pre><code class="language-typescript">// knowledge-base/index.ts

export const useKnowledgeBaseStore = defineStore(SetupStoreId.KnowledgeBase, () =&gt; {
  const tasks = ref&lt;Api.KnowledgeBase.UploadTask[]&gt;([]);  // 所有上传任务

  // 上传任务的数据结构
  // {
  //   file: File,               // 文件对象
  //   fileMd5: string,          // 文件指纹
  //   fileName: string,
  //   totalSize: number,
  //   uploadedChunks: number[], // 已上传的分片索引列表 ★ 断点续传的关键
  //   progress: number,         // 进度百分比
  //   status: UploadStatus,     // 状态：Pending/Uploading/Break/Completed
  //   orgTag: string,
  //   vectorizationStatus: string
  // }
});</code></pre>
<p><strong>核心代码：进度更新（合并分片列表）</strong></p>
<pre><code class="language-typescript">// knowledge-base/index.ts

// 上传成功后，后端返回已上传分片列表，合并到本地
function mergeUploadedChunks(current: number[], latest: number[]) {
  return Array.from(new Set([...current, ...latest])).sort((a, b) =&gt; a - b);
  // 去重 + 排序
  // 例如：本地 [0,1,2] + 后端 [0,1,2,3] = [0,1,2,3]
}

// uploadChunk() 成功后：
updatedTask.uploadedChunks = mergeUploadedChunks(updatedTask.uploadedChunks, data.uploaded);
updatedTask.progress = Number.parseFloat(
  ((updatedTask.uploadedChunks.length / totalChunks) * 100).toFixed(2)
);
// 进度 = 已上传片数 / 总片数 × 100</code></pre>
<p><strong>核心代码：断点恢复（只传未完成的分片）</strong></p>
<pre><code class="language-typescript">// knowledge-base/index.ts - startUpload()

// 计算所有分片索引，过滤出还没上传的
const pendingChunkIndexes: number[] = [];
for (let i = 0; i &lt; totalChunks; i += 1) {
  if (!task.uploadedChunks.includes(i)) {
    pendingChunkIndexes.push(i);  // 只把没传过的加入队列
  }
}

// 上传失败 → 标记 Break
catch (e) {
  tasks.value[index].status = UploadStatus.Break;
}

// 用户点"重试" → 改回 Pending → 重新 startUpload()
if (existingTask.status === UploadStatus.Break) {
  existingTask.status = UploadStatus.Pending;
  startUpload();
  // 此时 uploadedChunks 还在（内存中）→ 只传剩余分片
}</code></pre>
<p><strong>从后端恢复进度</strong></p>
<pre><code class="language-typescript">// 场景：用户刷新了页面（Pinia 状态丢失）
// 重新上传同一文件时：
const md5 = await calculateMD5(file);
const existingTask = tasks.value.find(t =&gt; t.fileMd5 === md5);
if (!existingTask) {
  // 新任务 → uploadedChunks 为空 → 全部上传？
  // 不！可以先调 GET /upload/status 查询后端已有的分片
}</code></pre>
<pre><code class="language-java">// 后端 GET /upload/status 返回：
// {
//   "uploaded": [0, 1, 2, ..., 149],   // 已上传的分片（Redis/MySQL 查询）
//   "progress": 73.17,
//   "fileName": "技术文档.pdf",
//   "fileType": "PDF文档"
// }</code></pre>
<p>前端拿到 <code>uploaded</code> 数组回填 <code>task.uploadedChunks</code>，然后只传剩余分片。</p>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>上传任务状态用 Pinia Store 管理（Pending/Uploading/Break/Completed 状态机），
uploadedChunks 数组记录已上传分片（和后端返回的列表去重合并），失败标记 Break，
重试时只传未完成分片；页面刷新后可通过 GET /upload/status 从后端恢复进度。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：前端状态和真实状态不一致怎么办？</strong>
A：以后端为准。uploadedChunks 每次合并后端返回的列表（mergeUploadedChunks），
后端有幂等保护（Redis Bitmap + MySQL），即使前端多发已传分片也不会有问题。</p>
<p><strong>Q2：如果页面刷新了，uploadedChunks 丢了怎么办？</strong>
A：两个方案：① 把 uploadedChunks 存 localStorage，刷新后恢复；② 调后端
GET /upload/status 查询已上传分片。本项目主要靠②（后端是事实来源）。</p>
<p><strong>Q3：上传中的文件被删除了怎么办？</strong>
A：任务状态机里没有"取消"状态，用户可以直接关闭页面（上传中断，后端分片残留）。
残留分片可以通过后端定时任务清理（比如超过 24 小时未合并的分片）。</p>
<hr>` },
      { "t": "技术点 52：PDF 文档在线预览", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么 PDF 预览要单独开发？</strong></p>
<p>浏览器自带 PDF 预览（打开 PDF 链接就能看），但本项目的需求更复杂：
- 定位到指定页（从检索结果点击引用 → 跳到第 3 页）
- 高亮搜索关键词（锚点文本定位）
- 不需要下载整个文件（大 PDF 分段加载）</p>
<p>所以用 <strong>pdf.js</strong>（Mozilla 开源的 PDF 渲染库）自己实现预览器。</p>
<p><strong>核心代码：按需加载 PDF（分段加载）</strong></p>
<pre><code class="language-typescript">// pdf-document-viewer.vue

const pdfRangeChunkSize = 256 * 1024;  // 256KB 一段
// pdf.js 支持 HTTP Range 请求：
// 第一次请求：GET /file.pdf → 响应头 Range: bytes=0-262143
// 用户翻页时：按需请求对应页面的数据
// 不会把整个 100MB PDF 一次性下载下来</code></pre>
<p><strong>核心代码：渲染页面</strong></p>
<pre><code class="language-typescript">// pdf-document-viewer.vue - 核心渲染流程（简化）

async function renderPage(pageNumber: number) {
  // 1. 获取页面对象
  const page = await pdfDocument.getPage(pageNumber);

  // 2. 计算渲染尺寸（适配屏幕缩放）
  const viewport = page.getViewport({ scale: zoom.value });

  // 3. 设置 canvas 尺寸
  canvasRef.value.width = viewport.width;
  canvasRef.value.height = viewport.height;

  // 4. 渲染 PDF 页面到 canvas
  await page.render({
    canvasContext: canvasRef.value.getContext('2d'),
    viewport
  }).promise;

  // 5. 渲染文本层（用于选中/搜索/高亮）
  await renderTextLayer(page, viewport);
}</code></pre>
<p><strong>核心代码：锚点文本定位</strong></p>
<pre><code class="language-typescript">// 从检索结果拿到 anchorText（如 "RAG是一种检索增强生成技术"）
// 在文本层中查找该文本的位置 → 绘制高亮框

const matchCandidates = computed(() =&gt;
  buildMatchCandidates(props.searchText || props.anchorText || '')
);
// 高亮后显示为黄色矩形框</code></pre>
<p><strong>核心代码：翻页和缩放</strong></p>
<pre><code class="language-typescript">// 缩放控制
const minZoom = 0.7;
const maxZoom = 2.2;
const zoom = ref(1);
// 缩放后重新渲染当前页

// 页码控制
const currentPage = ref(1);
const totalPages = ref(0);
// pdfDocument.numPages 获取总页数</code></pre>
<p><strong>单页快照模式</strong></p>
<pre><code class="language-typescript">// 引用点击时的"定位页快照"模式
const singlePagePreviewActive = computed(() =&gt;
  Boolean(props.singlePageMode &amp;&amp; props.sourcePageNumber)
);
// 只显示被引用的那一页，不加载整个文档
// 提示："当前是定位页快照，支持缩放；整本文档请点"新窗口"查看。"</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>PDF 预览基于 pdf.js 实现：利用 HTTP Range 请求按需加载（256KB 分段），canvas
渲染页面 + 文本层支持关键词高亮，支持翻页/缩放/锚点定位，检索引用点击后进入
"单页快照模式"只渲染被引用的那一页。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：pdf.js 的 Range 请求有什么好处？</strong>
A：大 PDF 不用整个下载：用户只看第 3 页就只下载第 3 页所需的数据。节省带宽、
加快首屏速度。代价是实现复杂度高（需要处理部分加载、失败重试）。</p>
<p><strong>Q2：canvas 渲染和文本层（text layer）是什么关系？</strong>
A：canvas 负责画"视觉内容"（文字形状、图形），文本层是透明的 HTML 层叠加在
canvas 上方，包含真实的文本内容。这样浏览器才能支持文字选中、搜索、高亮。
两者通过相同的 viewport 坐标对齐。</p>
<p><strong>Q3：锚点高亮是怎么定位的？</strong>
A：在文本层的每个文本节点里搜索锚点文本，找到匹配后根据 DOM 元素的位置（getBoundingClientRect）
绘制高亮矩形框，并自动滚动到该位置。</p>
<hr>` },
      { "t": "技术点 53：Vite 代理配置", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么需要代理？</strong></p>
<pre><code class="language-text">开发环境：
  前端：http://localhost:9527
  后端：http://localhost:8081/api/v1

前端请求 /api/v1/upload/chunk 时：
  浏览器访问的是 localhost:9527（前端服务器）
  但接口在 localhost:8081（后端服务器）
  → 跨域问题！浏览器会拦截响应</code></pre>
<p>解决跨域的三种方式：
1. 后端配 CORS（跨域资源共享）→ 前端直接访问后端地址
2. 前端配代理（Vite proxy）→ 前端服务器转发请求 ★ 本项目
3. 部署时用 Nginx 反代</p>
<p><strong>核心代码：Vite 代理配置</strong></p>
<pre><code class="language-typescript">// vite.config.ts

export default defineConfig({
  server: {
    host: '0.0.0.0',  // 允许局域网访问
    port: 9527,        // 前端端口
    open: true,        // 启动时自动打开浏览器
    proxy: createViteProxy(viteEnv, enableProxy)  // 代理配置
  },
  preview: {
    port: 9725  // 打包后预览端口
  }
});</code></pre>
<pre><code class="language-typescript">// 代理的实际配置（简化）
proxy: {
  '/proxy-default': {
    target: 'http://localhost:8081',  // 转发目标：后端
    changeOrigin: true,                // 修改请求头 Host 为目标地址
    rewrite: path =&gt; path.replace(/^\\/proxy-default/, '')  // 去掉前缀
  }
}
// 请求 /proxy-default/api/v1/upload/chunk
// → 转发为 http://localhost:8081/api/v1/upload/chunk</code></pre>
<p><strong>代理的流转过程</strong></p>
<pre><code class="language-text">浏览器请求：GET http://localhost:9527/proxy-default/api/v1/upload/chunk
  │（浏览器以为在请求自己的服务器，无跨域）
  ▼
Vite Dev Server（9527）
  │ 匹配到 /proxy-default 前缀
  │ 去掉前缀 → /api/v1/upload/chunk
  │ 转发到 http://localhost:8081/api/v1/upload/chunk
  ▼
后端返回响应 → Vite 原样转发给浏览器
  │（响应来自"自己的服务器"，浏览器不拦截）
  ▼
前端正常拿到数据</code></pre>
<p><strong>生产环境：Nginx 反代</strong></p>
<pre><code class="language-nginx"># nginx.conf（docs 目录）
server {
    listen 80;
    # 前端静态文件
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;  # Vue Router history 模式
    }
    # 后端 API 反向代理
    location /api/ {
        proxy_pass http://backend:8081;  # 转发到后端容器
    }
}</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>Vite 开发服务器通过 proxy 配置把 <code>/proxy-default</code> 前缀的请求转发到后端
<code>http://localhost:8081</code>（去前缀 + changeOrigin），避免浏览器跨域；生产环境用
Nginx 反向代理实现同样的转发，并配置 history 模式路由回退。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：代理解决了什么核心问题？</strong>
A：跨域。浏览器有同源策略，前端（9527）直接请求后端（8081）会被拦截。代理让
浏览器以为请求发给了"自己的服务器"，由 Vite/Nginx 在后端转发，绕过了同源限制。</p>
<p><strong>Q2：changeOrigin: true 是什么？</strong>
A：修改转发请求的 Host 头为后端地址。有些后端会校验 Host（比如防止域名伪造），
不设置可能被拒。开发环境一般设置 true。</p>
<p><strong>Q3：为什么请求路径带 /proxy-default 前缀？</strong>
A：为了区分"要代理的请求"和"普通静态资源请求"。带前缀的转发到后端，不带前缀的
由 Vite 自己处理（返回前端资源）。部署时也可以只代理 /api 路径。</p>
<hr>` },
      { "t": "完整链路总结", "tag": "我的整理", "p": "core", "html": `<pre><code class="language-text">[用户选择文件]
  │
  │ 49. SparkMD5 分片读取计算 MD5（5MB/片）
  │
  ▼
[enqueueUpload]
  │ 51. 创建任务（Pinia Store）→ status=Pending → startUpload()
  │
  ▼
[startUpload]
  │ 50. 文件级：activeUploads.size &lt; 3 才放行
  │     分片级：Worker Pool 4 路并发
  │     → 每片 POST /upload/chunk
  │     → 成功后合并 uploadedChunks + 更新进度
  │
  ├── 全部成功 → mergeFile() → 上传完成
  │
  └── 失败 → status=Break → 用户重试 → 51. 只传未完成分片
  │
  ▼
[文档管理]
  │ 52. 点击 PDF → pdf.js 按需加载 → 定位页/高亮锚点
  │ 53. 开发环境 Vite 代理 /proxy-default → 后端</code></pre>` }
    ]
  });

  mine.chapters.push({
    "no": "10",
    "title": "十、工程配置与基础设施（5个技术点）（技术点 54–58 · 6 节）",
    "questions": [
      { "t": "技术点 54：.env + application.yml 多环境配置", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么要多环境配置？</strong></p>
<p>同一套代码要运行在多个环境，配置不同：</p>
<pre><code class="language-text">开发环境（dev）：本地 MySQL、本地 Redis、调试日志
测试环境（test）：测试服务器、测试数据
生产环境（prod）：云数据库、正式密钥、最少日志</code></pre>
<p>如果配置写死在代码里 → 每次部署都要改代码 → 灾难。
正确做法：<strong>环境变量 + 配置文件分离</strong>。</p>
<p><strong>配置文件结构</strong></p>
<pre><code class="language-text">src/main/resources/
├── application.yml          # 公共配置（所有环境共用）
├── application-dev.yml      # 开发环境
├── application-docker.yml   # Docker 环境
└── application-prod.yml     # 生产环境</code></pre>
<pre><code class="language-yaml"># application.yml（公共配置中的环境变量占位）
mysql:
  host: \${MYSQL_HOST:localhost}     # 优先读环境变量 MYSQL_HOST，没有则默认 localhost
  password: \${MYSQL_PASSWORD:}      # 必须提供，无默认值
redis:
  host: \${REDIS_HOST:localhost}</code></pre>
<p><strong>核心代码：读取 .env 文件（EnvironmentPostProcessor）</strong></p>
<pre><code class="language-java">// DotenvEnvironmentPostProcessor.java

public class DotenvEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        // 1. 读取项目根目录的 .env 文件
        Path dotenvPath = Path.of(System.getProperty("user.dir"), ".env");
        if (!Files.isRegularFile(dotenvPath)) return;

        // 2. 解析 .env 内容（KEY=VALUE 格式，跳过空行和 # 注释）
        Map&lt;String, Object&gt; properties = loadDotenv(dotenvPath);

        // 3. 应用激活的 Profile（读取 SPRING_PROFILES_ACTIVE）
        applyActiveProfiles(environment, properties);

        // 4. 把 .env 的配置注册为 Spring 的配置源
        SystemEnvironmentPropertySource propertySource =
            new SystemEnvironmentPropertySource("paismartDotenv", properties);
        environment.getPropertySources().addAfter(
            StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME, propertySource);
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;  // 最高优先级：最先执行
    }
}</code></pre>
<p><strong>.env 文件长什么样</strong></p>
<pre><code class="language-text"># .env（项目根目录，不提交到 Git）
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_PASSWORD=secret123
REDIS_HOST=localhost
SPRING_PROFILES_ACTIVE=dev
MINIO_ENDPOINT=http://localhost:9000</code></pre>
<p><strong>为什么 .env 不进 Git？</strong> 因为里面有密码、密钥等敏感信息。项目提供 <code>.env.example</code>
模板（只有变量名没有真实值），开发者复制成 .env 填自己的值。</p>
<p><strong>配置优先级</strong></p>
<pre><code class="language-text">命令行参数 &gt; Java 系统属性 &gt; 环境变量 &gt; .env 文件 &gt; application.yml &gt; 默认值</code></pre>
<p><code>.env</code> 通过 EnvironmentPostProcessor 注册为"系统环境属性"，优先级高于
application.yml 里的默认值，低于真实的环境变量（部署平台注入的）。</p>
<p><strong>注册机制（SPI）</strong></p>
<pre><code class="language-java">// META-INF/spring.factories 或 spring/org.springframework.boot.env.EnvironmentPostProcessor

org.springframework.boot.env.EnvironmentPostProcessor=\\
  com.yizhaoqi.smartpai.config.DotenvEnvironmentPostProcessor</code></pre>
<p>Spring Boot 启动时通过 SPI 机制发现并执行这个处理器——<strong>在配置文件加载之前</strong>，
所以 .env 的值能影响 application.yml 的 \${...} 占位符解析。</p>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>通过 EnvironmentPostProcessor（SPI 注册，最高优先级）在 Spring 配置加载前解析
项目根目录的 .env 文件（KEY=VALUE、支持注释和引号去包裹），注册为配置源并激活
Profile，与 application-{env}.yml 组合实现 dev/test/docker/prod 多环境配置，
敏感信息通过 .env（不入 Git）注入。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：EnvironmentPostProcessor 的作用时机？</strong>
A：它在 Spring Boot 启动的<strong>最早期</strong>执行（Environment 准备阶段），早于所有
@ConfigurationProperties 和 @Value 的绑定。所以 .env 的值能影响 application.yml
中的 \${MYSQL_HOST:localhost} 占位符解析——如果执行太晚，占位符已经解析成默认值了。</p>
<p><strong>Q2：环境变量和 .env 冲突时谁优先？</strong>
A：真实环境变量优先。.env 的配置源 addAfter(SYSTEM_ENVIRONMENT_PROPERTY_SOURCE)，
即排在系统环境变量之后。部署平台（Docker/K8s）注入的环境变量 &gt; .env 文件 &gt;
application.yml 默认值。</p>
<p><strong>Q3：为什么不用现成的 dotenv-java 库？</strong>
A：Spring Boot 本身不原生支持 .env，现成库（如 dotenv-java）也能实现。自己实现
的好处是代码少、可控性强、不需要额外依赖。缺点是要处理各种边界（引号、转义、
注释）。</p>
<hr>` },
      { "t": "技术点 55：Kafka 幂等生产者", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识回顾（第一部分技术点5已详讲）</strong></p>
<p>Kafka 幂等生产者解决"网络重试导致消息重复存储"的问题，靠 PID + 序列号去重。</p>
<p><strong>核心代码：完整配置</strong></p>
<pre><code class="language-java">// KafkaConfig.java

@Bean
public ProducerFactory&lt;String, Object&gt; producerFactory() {
    Map&lt;String, Object&gt; config = new HashMap&lt;&gt;();
    config.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
    config.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
    config.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);

    // ★ 可靠投递三件套
    config.put(ProducerConfig.ACKS_CONFIG, "all");
    // acks=all：所有 ISR 副本落盘才确认（不丢消息）
    // 对比 acks=0：发出去不管（可能丢）
    //       acks=1：leader 落盘就算成功（leader 挂了可能丢）

    config.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
    // 幂等生产者：PID + 序列号去重（网络重试不产生重复消息）

    config.put(ProducerConfig.RETRIES_CONFIG, 3);
    // 发送失败自动重试 3 次（配合幂等，重试不会导致重复）

    DefaultKafkaProducerFactory&lt;String, Object&gt; factory =
        new DefaultKafkaProducerFactory&lt;&gt;(config);
    factory.setTransactionIdPrefix("file-upload-tx-");
    // 事务前缀：启用 Kafka 事务能力
    return factory;
}</code></pre>
<p><strong>三个配置的配合关系</strong></p>
<pre><code class="language-text">acks=all（保证不丢）
  + 幂等生产者（保证不重）
  + 事务（保证"发消息 + 数据库操作"原子性）
  = 可靠投递的完整组合</code></pre>
<p><strong>注意</strong>：<code>enable.idempotence=true</code> 时，acks 会被强制提升为 all（Kafka 内部要求）。
显式配置是为了可读性和防御性。</p>
<p><strong>幂等的前提条件</strong></p>
<div class="table-wrap"><table>
<thead><tr><th>条件</th><th>说明</th></tr></thead>
<tbody>
<tr><td>PID 不变</td><td>同一个 Producer 实例（重启后 PID 变，历史去重失效）</td></tr>
<tr><td>序列号连续</td><td>每条消息 seq 递增（Broker 校验）</td></tr>
<tr><td>单分区有序</td><td>幂等是按"分区"维度保证的</td></tr>
</tbody></table></div>
<p><strong>边界</strong>：Producer 重启 → 新 PID → 历史消息无法去重。所以幂等生产者解决的是
"运行时网络重试"，不是"跨重启的业务幂等"。</p>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>Kafka 生产者配置"acks=all + 幂等 + 重试3次"三件套实现可靠投递：消息必须所有
ISR 副本落盘才确认（不丢），PID+序列号机制保证网络重试不产生重复消息（不重），
配合事务前缀实现"发消息 + 数据库操作"的原子性。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：幂等生产者和 exactly-once 的关系？</strong>
A：幂等生产者是 exactly-once 的一部分（Producer 端）。完整的端到端 exactly-once
还需要：事务（跨生产消费原子性）+ 消费端幂等。本项目只用到了生产者幂等 + 事务。</p>
<p><strong>Q2：acks=all 性能差吗？</strong>
A：比 acks=0/1 慢（要等所有副本确认），但可靠性高得多。文件处理任务属于"重要
不紧急"消息，可靠性优先。如果副本数为 1（开发环境），acks=all 和 acks=1 性能
一样。</p>
<hr>` },
      { "t": "技术点 56：ES 索引自动初始化", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么需要自动初始化？</strong></p>
<p>ES 的索引（类似 MySQL 的表）需要先创建（含 mapping）才能写入数据。手动创建的问题：
- 每次部署都要手动执行一次
- mapping 写错（比如 dims 和模型维度不一致）要删了重建
- 忘记创建 → 程序运行时才报错</p>
<p><strong>启动时自动检查 + 创建</strong>：应用启动 → 检查索引是否存在 → 不存在则创建。</p>
<p><strong>核心代码：启动时执行</strong></p>
<pre><code class="language-java">// EsIndexInitializer.java

@Component
@Order(2)  // 执行顺序：排在 BootstrapKnowledgeInitializer 之前
@ConditionalOnProperty(name = "elasticsearch.init.enabled", havingValue = "true", matchIfMissing = true)
public class EsIndexInitializer implements CommandLineRunner {

    @Override
    public void run(String... args) {
        // 1. 检查索引是否存在
        BooleanResponse exists = esClient.indices().exists(
            ExistsRequest.of(e -&gt; e.index("knowledge_base"))
        );

        if (!exists.value()) {
            createIndex();  // 不存在 → 创建
        } else {
            logger.info("索引 'knowledge_base' 已存在");  // 存在 → 跳过
        }
    }

    private void createIndex() throws Exception {
        // 读取 mapping JSON 文件（classpath 资源，支持 JAR 包内）
        String mappingJson;
        try (var inputStream = mappingResource.getInputStream()) {
            mappingJson = new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
        }

        // 创建索引 + 应用 mapping
        esClient.indices().create(
            CreateIndexRequest.of(c -&gt; c
                .index("knowledge_base")
                .withJson(new StringReader(mappingJson))
            )
        );
    }
}</code></pre>
<p><strong>智能诊断（亮点）</strong></p>
<pre><code class="language-java">// EsIndexInitializer.java - buildDiagnosticMessage()

// 初始化失败时，分析根因并给出排查建议：
if (isConnectionProblem(rootCause, msg)) {
    hints.add("当前看起来是连接失败，请先确认 Elasticsearch 已启动");
}
if (isSslMismatch(msg)) {
    hints.add("当前更像是 HTTP/HTTPS 协议不匹配，请核对 ELASTICSEARCH_SCHEME");
}
if (isAuthenticationProblem(msg)) {
    hints.add("当前更像是账号或密码不正确，请核对 ELASTICSEARCH_USERNAME/PASSWORD");
}
if (msg.contains("ik_max_word") || msg.contains("ik_smart")) {
    hints.add("当前索引 mapping 依赖 IK 分词器，请确认 ES 已安装 analysis-ik 插件");
}
if (msg.contains("dense_vector") &amp;&amp; msg.contains("dims")) {
    hints.add("当前更像是向量字段维度不匹配，请确认 embedding.dimension 与 dims 一致");
}</code></pre>
<p><strong>为什么值得讲</strong>：ES 连接失败的错误信息很底层（SSL handshake、connection refused
等），普通开发者看到一头雾水。智能诊断把底层异常翻译成可操作的排查建议，这是
工程素养的体现。</p>
<p><strong>连接失败重试</strong></p>
<pre><code class="language-java">// ConnectionClosedException 等瞬时故障 → 等 5 秒重试一次
if (exception instanceof ConnectionClosedException) {
    Thread.sleep(5000);
    initializeIndex();  // 重试
}</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>实现 CommandLineRunner，应用启动时检查 knowledge_base 索引是否存在，不存在则
从 classpath 读取 mapping JSON 自动创建（IK 分词器 + 2048 维向量字段）；初始化
失败时对底层异常做智能诊断（连接/SSL/认证/IK插件/维度不匹配），给出可操作的
排查建议，瞬时故障自动等待重试。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：为什么用 CommandLineRunner 而不是 @PostConstruct？</strong>
A：CommandLineRunner 在 Spring 容器初始化完成后、应用正式启动前执行，此时所有
Bean 都已注入。@PostConstruct 在 Bean 创建时执行，如果 ES 客户端还没准备好会
空指针。且 CommandLineRunner 支持 @Order 控制执行顺序。</p>
<p><strong>Q2：索引已经存在但 mapping 不对怎么办？</strong>
A：当前逻辑是"存在就跳过"。如果 mapping 需要变更（比如 dims 从 1024 改成 2048），
ES 的 mapping 不能直接修改（dense_vector 的 dims 不可变），只能删索引重建
（数据会丢，需要重新向量化）。可以在管理后台提供"重建索引"功能。</p>
<hr>` },
      { "t": "技术点 57：Spring Boot 启动知识库引导", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：什么是启动引导？</strong></p>
<p>新系统部署后，知识库是空的——用户进来什么也问不了。启动引导 = <strong>应用第一次启动
时自动上传一些示例文档</strong>，让知识库开箱即有内容可检索。</p>
<p><strong>核心代码：启动时自动处理示例文档</strong></p>
<pre><code class="language-java">// BootstrapKnowledgeInitializer.java（298行）

@Component
@Order(3)  // 在 EsIndexInitializer（@Order(2)）之后执行
@ConditionalOnProperty(name = "knowledge.bootstrap.enabled", havingValue = "true", matchIfMissing = true)
public class BootstrapKnowledgeInitializer implements CommandLineRunner {

    // 配置
    // knowledge.bootstrap.path: docs/paismart.pdf（示例文档路径）
    // knowledge.bootstrap.org-tag: default

    @Override
    public void run(String... args) {
        // 1. 检查示例文档是否已经导入过（file_upload 表查 fileMd5）
        if (已存在(fileMd5)) {
            logger.info("引导知识库已初始化，跳过");
            return;
        }

        // 2. 计算文件 MD5
        String fileMd5 = DigestUtils.md5Hex(fileStream);

        // 3. 上传到 MinIO（merged/ 路径）
        minioClient.putObject(...);

        // 4. 发送 Kafka 任务（复用正常的文件处理链路！）
        FileProcessingTask task = new FileProcessingTask(fileMd5, objectUrl, fileName, ...);
        kafkaTemplate.send(kafkaConfig.getFileProcessingTopic(), task);
        // → 解析 → 分块 → 向量化 → 写入 ES
        // → 引导文档和用户上传的文件走完全相同的处理流程
    }
}</code></pre>
<p><strong>幂等保护</strong></p>
<pre><code class="language-java">// 通过 fileMd5 判断是否已导入
if (fileUploadRepository.countByFileMd5(fileMd5) &gt; 0) {
    logger.info("引导知识库已初始化，跳过");
    return;  // 幂等：重启不会重复导入
}</code></pre>
<p><strong>核心设计：复用正常链路</strong></p>
<pre><code class="language-text">用户上传文件：POST /upload/chunk → /upload/merge → Kafka → 解析 → 向量化
引导初始化：  直接构造 FileProcessingTask → Kafka → 解析 → 向量化
                                    ↑ 两条路径在 Kafka 之后合流</code></pre>
<p>好处：引导文档和用户文档用同一套处理逻辑，不需要为"启动导入"单独写解析代码。</p>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>应用启动时检查示例文档（docs/paismart.pdf）是否已导入（按 fileMd5 幂等判断），
未导入则上传到 MinIO 并构造 FileProcessingTask 发送到 Kafka，与用户上传走完全
相同的解析-向量化链路，实现"开箱即有知识库"。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：启动引导失败会影响系统启动吗？</strong>
A：引导逻辑有 try-catch，失败只记日志不阻塞启动（catch 后 warning）。系统可以
正常启动，只是知识库暂时为空，用户上传文档后即可使用。</p>
<p><strong>Q2：为什么要复用 Kafka 链路而不是直接调用解析？</strong>
A：① 复用代码，不重复实现解析逻辑；② 异步执行，不阻塞启动流程；③ 享受 Kafka
的重试和死信机制（解析失败自动重试）。</p>
<hr>` },
      { "t": "技术点 58：统一日志体系", "tag": "我的整理", "p": "core", "html": `<p><strong>前置知识：为什么需要统一日志？</strong></p>
<p>没有统一日志的问题：
- 每个开发自己写 System.out.println → 格式混乱、无法检索
- 无法按用户/操作/请求维度跟踪问题
- 没有性能数据，无法定位慢接口</p>
<p>统一日志体系 = 统一格式 + 统一分类 + 统一上下文 + 性能监控。</p>
<p><strong>核心代码：分类日志器</strong></p>
<pre><code class="language-java">// LogUtils.java

// 业务日志（记录业务操作）
private static final Logger BUSINESS_LOGGER =
    LoggerFactory.getLogger("com.yizhaoqi.smartpai.business");

// 性能日志（记录耗时）
private static final Logger PERFORMANCE_LOGGER =
    LoggerFactory.getLogger("com.yizhaoqi.smartpai.performance");</code></pre>
<p><strong>核心代码：MDC 上下文</strong></p>
<pre><code class="language-java">// LogUtils.java - 用 MDC 记录用户/操作上下文

// MDC（Mapped Diagnostic Context）= 线程绑定的日志上下文
// 设置后，同一线程后续所有日志都会自动带上这些字段

public static void logBusiness(String operation, String userId, String message, Object... args) {
    MDC.put(OPERATION, operation);
    MDC.put(USER_ID, userId);
    BUSINESS_LOGGER.info("[{}] [用户:{}] {}", operation, userId, formatMessage(message, args));
    MDC.clear();  // 用完清除，防止污染其他日志
}</code></pre>
<p><strong>核心代码：各类业务日志方法</strong></p>
<pre><code class="language-java">// 用户操作日志（审计用）
LogUtils.logUserOperation(userId, "MERGE_FILE", fileMd5, "SUCCESS");
// → [用户操作] [用户:1] [操作:MERGE_FILE] [资源:a1b2c3...] [结果:SUCCESS]

// 文件操作日志
LogUtils.logFileOperation(userId, "UPLOAD_CHUNK", fileName, fileMd5, "PROCESSING");
// → [文件操作] [用户:1] [操作:UPLOAD_CHUNK] [文件:技术文档.pdf] [MD5:a1b2...] [结果:PROCESSING]

// 聊天日志
LogUtils.logChat(userId, sessionId, "user_message", 150);
// → [聊天] [用户:1] [会话:uuid] [类型:user_message] [长度:150]

// API 调用日志
LogUtils.logApiCall("POST", "/api/v1/upload/chunk", userId, 200, 152);
// → [API] [POST] /api/v1/upload/chunk [用户:1] [状态:200] [耗时:152ms]</code></pre>
<p><strong>核心代码：性能监控</strong></p>
<pre><code class="language-java">// 使用方式（比如 UploadController 中）
LogUtils.PerformanceMonitor monitor = LogUtils.startPerformanceMonitor("UPLOAD_CHUNK");
try {
    // ...业务逻辑...
    monitor.end("分片上传成功");  // → [性能] [UPLOAD_CHUNK] 耗时:152ms 分片上传成功
} catch (Exception e) {
    monitor.end("分片上传失败");  // 失败也要记录耗时
}

// 实现
public static class PerformanceMonitor {
    private final String operation;
    private final long startTime;

    public void end(String details) {
        long duration = System.currentTimeMillis() - startTime;
        logPerformance(operation, duration, details);
        // 性能日志记录耗时，用于发现慢接口
    }
}</code></pre>
<p><strong>日志文件配置（logback）</strong></p>
<pre><code class="language-xml">&lt;!-- logback-spring.xml --&gt;
&lt;appender name="BUSINESS" class="...RollingFileAppender"&gt;
    &lt;file&gt;logs/business.log&lt;/file&gt;
    &lt;rollingPolicy&gt;...按天滚动 + 保留30天...&lt;/rollingPolicy&gt;
&lt;/appender&gt;

&lt;logger name="com.yizhaoqi.smartpai.business" level="INFO"&gt;
    &lt;appender-ref ref="BUSINESS"/&gt;
&lt;/logger&gt;</code></pre>
<p><strong>一句话总结</strong></p>
<blockquote class="doc-callout"><p>通过 LogUtils 封装统一日志体系：业务/性能双分类 Logger、MDC 注入用户和操作
上下文（日志自动带用户ID便于排查）、用户操作/文件操作/聊天/API 调用等场景化
日志方法、PerformanceMonitor 性能监控记录接口耗时，配合 logback 按天滚动文件。</p></blockquote>
<p><strong>模拟面试</strong></p>
<p><strong>Q1：MDC 是什么？有什么用？</strong>
A：MDC（Mapped Diagnostic Context）是 SLF4J 提供的线程级日志上下文。设置后，当前
线程后续所有日志输出都会自动带上这些字段（配合 logback 的 %X{userId} 占位符）。
这样日志里自动带上用户ID、操作名，排查问题时能快速筛选"某个用户的所有操作"。</p>
<p><strong>Q2：为什么业务日志和性能日志分开？</strong>
A：两者用途不同：业务日志关注"发生了什么"（排查问题），性能日志关注"花了多久"
（优化性能）。分开后可以独立配置（性能日志可以只保留短期、更高频刷新），也可以
独立检索分析。</p>
<p><strong>Q3：PerformanceMonitor 和 Spring AOP 的区别？</strong>
A：PerformanceMonitor 是手动埋点（在每个关键方法里 start/end），灵活但需要写
代码。Spring AOP 可以统一拦截（比如所有 Controller 方法自动记录耗时），侵入小
但灵活性低（无法在中间步骤记录）。实际项目通常两者结合。</p>
<hr>` },
      { "t": "完整链路总结", "tag": "我的整理", "p": "core", "html": `<pre><code class="language-text">[应用启动]
  │
  │ 54. EnvironmentPostProcessor：加载 .env → 激活 Profile
  │     → application-{env}.yml 生效
  │
  ▼
[Spring 容器初始化]
  │ 56. EsIndexInitializer：检查/创建 ES 索引（IK + 2048维向量）
  │     → 失败智能诊断 + 重试
  │
  ▼
[CommandLineRunner]
  │ 57. BootstrapKnowledgeInitializer：引导示例文档
  │     → 幂等检查（fileMd5）→ 上传 MinIO → 发 Kafka
  │
  ▼
[运行期]
  │ 55. Kafka 可靠投递（acks=all + 幂等 + 事务）
  │ 58. LogUtils 统一日志（业务/性能分类 + MDC 上下文 + 性能监控）
  │
  ▼
[就绪，服务可用]</code></pre>
<hr>
<p># 附录：全部 58 个技术点总览</p>
<div class="table-wrap"><table>
<thead><tr><th>部分</th><th>技术点</th></tr></thead>
<tbody>
<tr><td>一、文件上传与存储链路（7）</td><td>1.前端分片+Worker Pool 2.Redis Bitmap 3.MinIO 4.CAS状态机 5.Kafka事务+重试+DLT 6.MD5去重+幂等 7.断点续传</td></tr>
<tr><td>二、文档解析与文本分块（7）</td><td>8.PDF/非PDF双引擎 9.Parent-Child分块 10.三级语义切分 11.语义重叠 12.页眉页脚过滤 13.流式防OOM 14.Tika格式识别</td></tr>
<tr><td>三、向量检索与混合搜索（6）</td><td>15.ES+IK分词 16.Embedding 2048维 17.KNN召回 18.BM25重排 19.混合搜索三阶段 20.Bulk批量索引</td></tr>
<tr><td>四、RAG对话与Agent（9）</td><td>21.ReAct循环 22.Function Calling 23.工具注册表 24.强制检索+白名单 25.Prompt拼装 26.WebSocket 27.流式+取消+超时 28.引用溯源 29.反馈闭环</td></tr>
<tr><td>五、对话历史管理（5）</td><td>30.Redis+MySQL双层存储 31.MySQL优先一致性 32.多会话管理 33.历史窗口截取 34.引用映射持久化</td></tr>
<tr><td>六、安全与权限（6）</td><td>35.JWT无状态认证 36.Security过滤链 37.OrgTag多租户 38.ES权限注入 39.RBAC 40.资源级权限</td></tr>
<tr><td>七、Token经济与计费（5）</td><td>41.预估-预留-结算 42.Embedding预估算 43.双维度配额 44.速率限制 45.TokenReservation Bundle</td></tr>
<tr><td>八、LLM多模型路由（3）</td><td>46.动态路由 47.WebClient响应式 48.OpenAI兼容协议</td></tr>
<tr><td>九、前端工程（5）</td><td>49.SparkMD5 50.双层并发控制 51.上传状态持久化 52.PDF在线预览 53.Vite代理</td></tr>
<tr><td>十、工程配置与基础设施（5）</td><td>54..env多环境 55.Kafka幂等生产者 56.ES索引初始化 57.启动引导 58.统一日志</td></tr>
</tbody></table></div>` }
    ]
  });
})();
