const GITHUB_API_URL = "https://api.github.com/repos/你的git用户名/你的项目名/contents/你的语料库文件名.txt";
const GITHUB_TOKEN = "你的GitHub 访问令牌"; // GitHub 访问令牌

const TOKEN = '你的bot-token'; // bot token
const SECRET = '此处字母数字乱输'; // 随机密钥
const SOURCE = 'https://你的git用户名.github.io/你的项目名/你的语料库文件名.txt'; // 远程语料库，从github中获取
const ALLOWED_CHAT_ID = -123456; // ⚠️ 你的群组 ID
const ALLOWED_USER_IDS = [987654321]; // ⚠️ 允许的用户 ID
const ADMIN_PASSWORD = "123456"; // 管理员密码
let TEMPORARY_AUTHORIZED_USERS = []; // 临时授权用户

// 默认语料，仅在无法从GitHub获取时使用
let lines = ` 
{S1E1}狞畜，死！~
{S1E2}测试字幕~
`; 

// 添加一个标志来跟踪是否已从GitHub加载数据
let isDataLoaded = false;

// 处理批量添加语料的命令
let waitingForBatchInput = {}; // 记录哪些用户正在等待批量输入以及超时时间
const BATCH_INPUT_TIMEOUT = 5 * 60 * 1000; // 5分钟超时时间（毫秒）

const WEBHOOK = '/endpoint';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 如果数据还没有加载，尝试从GitHub加载
    if (!isDataLoaded) {
      try {
        await loadLinesFromGitHub();
        isDataLoaded = true;
      } catch (error) {
        console.error("❌ GitHub初始加载失败，使用默认数据：", error);
      }
    }

    if (url.pathname === WEBHOOK) {
      return handleWebhook(request);
    } else if (url.pathname.toLowerCase() === '/registerwebhook') {
      return registerWebhook(request, url, WEBHOOK, SECRET);
    } else if (url.pathname.toLowerCase() === '/unregisterwebhook') {
      return unRegisterWebhook(request);
    } else {
      return new Response('No handler for this request: ' + url.pathname);
    }
  }
};

// 从GitHub加载语料库
async function loadLinesFromGitHub() {
  console.log("🔄 正在从GitHub获取初始语料...");
  
  try {
    const response = await fetch(GITHUB_API_URL, {
      method: 'GET',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Evil773-Bot'
      }
    });
    
    if (!response.ok) {
      throw new Error(`GitHub API返回错误: ${response.status}`);
    }
    
    const data = await response.json();
    
    // GitHub API返回的内容是Base64编码的
    if (data.content) {
      const decodedContent = decodeURIComponent(escape(atob(data.content)));
      if (decodedContent.trim()) {
        lines = decodedContent;
        console.log("✅ 成功从GitHub加载语料库");
        return true;
      }
    }
    
    throw new Error("GitHub返回的数据无效");
  } catch (error) {
    console.error("❌ 从GitHub加载语料失败：", error);
    throw error;
  }
}

async function handleWebhook(request) {
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== SECRET) {
    return new Response('Unauthorized', { status: 403 });
  }

  const update = await request.json();
  await onUpdate(update);

  return new Response('Ok');
}

async function onUpdate(update) {
  if ('message' in update) {
    await onMessage(update.message);
    if (update.message && update.message.document) {
      await onDocumentUpload(update.message);
    }
  }
  if ('inline_query' in update) {
    await onInlineQuery(update.inline_query);
  }
}

// 清理过期的批量输入等待状态
function cleanupExpiredBatchWaits() {
  const now = Date.now();
  for (const userId in waitingForBatchInput) {
    if (waitingForBatchInput[userId].expires < now) {
      // 自动清理过期的等待状态，无需通知用户
      delete waitingForBatchInput[userId];
    }
  }
}

// 检查是否有重复语句（同一分类下）
function checkDuplicate(allLines, newCategory, newContent) {
  const linesArray = allLines.trim().split('\n').filter(line => line.trim() !== '');
  
  for (const line of linesArray) {
    const categoryMatch = line.match(/{(.+?)}/);
    if (!categoryMatch) continue;
    
    const lineCategory = categoryMatch[1];
    // 只有当分类相同时才检查内容
    if (lineCategory === newCategory) {
      const lineContent = line.replace(/{(.+?)}/, '').trim();
      // 比较内容是否相同（忽略大小写）
      if (lineContent.toLowerCase() === newContent.toLowerCase()) {
        return true; // 找到重复
      }
    }
  }
  
  return false; // 没有重复
}

// 修复后的onMessage函数
async function onMessage(message) {
  const chatId = message.chat?.id;
  const userId = message.from?.id;
  const text = message.text?.trim() || '';
  const username = message.from?.username || '';

  console.log(`收到消息: "${text}" 来自用户 ${userId} 在聊天 ${chatId}`);

  // 清理过期的批量输入等待状态
  cleanupExpiredBatchWaits();

  if (text.startsWith('/start')) {
    return sendPlainText(chatId, '狞畜，死！！！');
  }

  if (text.startsWith('/help')) {
    const helpText = `
📖 Evil773 BOT 帮助指令:

🔹 基础指令:
/start - 启动机器人
/help - 显示此帮助信息
/refresh - 从GitHub刷新语料库 (仅限管理员)

🔹 语料管理:
/update_file {分类}语句 - 添加单条语料
/batch_add - 批量添加语料 (请在此消息后回复包含多行语料的文本)
/delete {ID或关键词} - 删除匹配的语料
/delete_category {分类} - 删除某分类下的所有语料
/organize - 整理语料库，按分类排序

🔹 文件上传:
直接上传.txt文本文件 - 批量添加语料 (文件中每行一条，格式与批量添加相同)

🔹 搜索功能:
在内联模式中，直接输入关键词可搜索匹配语料
不输入任何内容时会随机显示10条语料

🔹 权限管理:
/password <密码> - 验证密码获取临时管理权限
/remove_user <用户ID> - 移除用户的管理权限 (仅限创建者)
/add_user <用户ID> - 添加用户的管理权限 (仅限创建者)

🔹 语料格式说明:
{分类}语句内容 - 标准格式
{分类-编号}语句内容 - 带编号的格式
`;
    return sendPlainText(chatId, helpText);
  }
  
  // 密码验证
  if (text.startsWith('/password')) {
    const password = text.replace('/password', '').trim();
    if (password === ADMIN_PASSWORD) {
      // 将用户添加到临时授权列表
      if (!TEMPORARY_AUTHORIZED_USERS.includes(userId)) {
        TEMPORARY_AUTHORIZED_USERS.push(userId);
      }
      return sendPlainText(chatId, "✅ 密码正确！你现在有语料管理权限。");
    } else {
      return sendPlainText(chatId, "❌ 密码错误！\n密码提示：18位数字");
    }
  }
  
  // 检查用户权限
  const isAuthorized = ALLOWED_CHAT_ID === chatId || ALLOWED_USER_IDS.includes(userId) || TEMPORARY_AUTHORIZED_USERS.includes(userId);
  
  // 添加和移除用户权限 (仅限创建者)
  if (text.startsWith('/add_user') && ALLOWED_USER_IDS.includes(userId)) {
    const targetUserId = parseInt(text.replace('/add_user', '').trim());
    if (!isNaN(targetUserId)) {
      if (!TEMPORARY_AUTHORIZED_USERS.includes(targetUserId)) {
        TEMPORARY_AUTHORIZED_USERS.push(targetUserId);
        return sendPlainText(chatId, `✅ 已授权用户 ${targetUserId} 管理语料的权限`);
      } else {
        return sendPlainText(chatId, `⚠️ 用户 ${targetUserId} 已经拥有权限`);
      }
    } else {
      return sendPlainText(chatId, "❌ 请提供有效的用户ID");
    }
  }
  
  if (text.startsWith('/remove_user') && ALLOWED_USER_IDS.includes(userId)) {
    const targetUserId = parseInt(text.replace('/remove_user', '').trim());
    if (!isNaN(targetUserId)) {
      const index = TEMPORARY_AUTHORIZED_USERS.indexOf(targetUserId);
      if (index !== -1) {
        TEMPORARY_AUTHORIZED_USERS.splice(index, 1);
        return sendPlainText(chatId, `✅ 已移除用户 ${targetUserId} 的语料管理权限`);
      } else {
        return sendPlainText(chatId, `⚠️ 用户 ${targetUserId} 没有临时权限`);
      }
    } else {
      return sendPlainText(chatId, "❌ 请提供有效的用户ID");
    }
  }
  
  // 刷新语料库
  if (text.startsWith('/refresh')) {
    if (!isAuthorized) {
      return sendPlainText(chatId, "❌ 你无权执行此命令！");
    }
    
    try {
      await loadLinesFromGitHub();
      return sendPlainText(chatId, "✅ 已从GitHub刷新语料库！");
    } catch (error) {
      return sendPlainText(chatId, `❌ 刷新失败: ${error.message}`);
    }
  }

  // 检查用户是否处于等待批量输入状态
  if (waitingForBatchInput[userId] && waitingForBatchInput[userId].waiting) {
    // 用户已发送批量输入
    const batchText = text;
    const batchLines = batchText.split('\n').filter(line => line.trim() !== '');
    
    // 清除等待状态
    delete waitingForBatchInput[userId];
    
    // 验证每行是否都符合 {分类}内容 的格式
    const invalidLines = [];
    const validLines = [];
    const duplicates = [];
    
    for (const line of batchLines) {
      const match = line.match(/^\s*\{(.+?)\}\s*(.+)$/);
      if (!match) {
        invalidLines.push(line);
        continue;
      }
      
      const category = match[1];
      const content = match[2].trim();
      
      if (!content) {
        invalidLines.push(line);
        continue;
      }
      
      // 检查重复
      if (checkDuplicate(lines, category, content)) {
        duplicates.push(line);
        continue;
      }
      
      validLines.push(line);
    }
    
    if (validLines.length === 0) {
      let message = "❌ 没有可添加的有效语料！";
      if (invalidLines.length > 0) {
        message += "\n\n⚠️ 无效格式的语料：\n" + invalidLines.slice(0, 5).join('\n');
        if (invalidLines.length > 5) message += `\n...等 ${invalidLines.length} 行`;
      }
      if (duplicates.length > 0) {
        message += "\n\n⚠️ 重复的语料：\n" + duplicates.slice(0, 5).join('\n');
        if (duplicates.length > 5) message += `\n...等 ${duplicates.length} 行`;
      }
      return sendPlainText(chatId, message);
    }
    
    // 添加有效语料
    lines += '\n' + validLines.join('\n');
    
    // 更新GitHub
    try {
      await updateGitHubFile(lines);
      
      let message = `✅ 成功添加 ${validLines.length} 条语料并同步到GitHub！`;
      
      if (invalidLines.length > 0) {
        message += `\n\n⚠️ ${invalidLines.length} 行格式无效未被添加`;
        if (invalidLines.length <= 3) {
          message += "：\n" + invalidLines.join('\n');
        }
      }
      
      if (duplicates.length > 0) {
        message += `\n\n⚠️ ${duplicates.length} 行重复未被添加`;
        if (duplicates.length <= 3) {
          message += "：\n" + duplicates.join('\n');
        }
      }
      
      return sendPlainText(chatId, message);
    } catch (error) {
      console.error("❌ 批量更新GitHub失败：", error);
      return sendPlainText(chatId, `✅ 已添加 ${validLines.length} 条语料到本地，但GitHub更新失败：${error.message}`);
    }
    
    return;
  }

  // 处理批量添加语料的命令
  if (text.startsWith('/batch_add')) {
    console.log(`用户授权状态: ${isAuthorized}`);
    
    if (!isAuthorized) {
      return sendPlainText(chatId, "❌ 你无权执行此命令！");
    }
    
    // 设置用户为等待批量输入状态，并记录超时时间
    waitingForBatchInput[userId] = {
      waiting: true,
      expires: Date.now() + BATCH_INPUT_TIMEOUT,
      chatId: chatId // 记录聊天ID，用于发送超时通知
    };
    
    // 设置超时处理
    setTimeout(() => {
      if (waitingForBatchInput[userId] && waitingForBatchInput[userId].waiting) {
        const userChatId = waitingForBatchInput[userId].chatId;
        delete waitingForBatchInput[userId];
        sendPlainText(userChatId, "⌛ 批量添加操作已超时。如需添加语料，请重新发送 /batch_add 命令。");
      }
    }, BATCH_INPUT_TIMEOUT);
    
    const instructionMessage = `✅ 已进入批量添加模式，请发送包含多行语料的文本

📝 格式示例：
{分类}语句
{你好}世界！
{hello}world！
{问候}早上好！
{表情}😊

📌 注意事项：
- 每行一条语料
- 每条语料必须是 {分类}内容 格式
- 支持多行一次性添加
- ${Math.floor(BATCH_INPUT_TIMEOUT/60000)}分钟内有效，超时需重新发送命令

✨ 发送后将自动添加到语料库`;
    
    return sendPlainText(chatId, instructionMessage);
  }
  
  // 删除某个分类的所有语料
  if (text.startsWith('/delete_category')) {
    if (!isAuthorized) {
      return sendPlainText(chatId, "❌ 你无权执行此命令！");
    }
    
    const category = text.replace('/delete_category', '').trim();
    if (!category) {
      return sendPlainText(chatId, "⚠️ 请提供要删除的分类名称");
    }
    
    const linesArray = lines.trim().split('\n').filter(line => line.trim() !== '');
    const matchedLines = linesArray.filter(line => {
      // 改进的分类匹配逻辑
      const match = line.match(/\{([^}]+)\}/);
      if (!match) return false;
      
      const lineCategory = match[1].trim();
      return lineCategory === category;
    });
    
    if (matchedLines.length === 0) {
      return sendPlainText(chatId, `⚠️ 未找到分类 "${category}" 的语料`);
    }
    
    // 删除匹配的分类
    const newLines = linesArray.filter(line => !matchedLines.includes(line));
    lines = newLines.join('\n');
    
    try {
      await updateGitHubFile(lines);
      return sendPlainText(chatId, `✅ 已删除分类 "${category}" 的 ${matchedLines.length} 条语料`);
    } catch (error) {
      console.error("❌ GitHub 更新失败：", error);
      return sendPlainText(chatId, `✅ 已从本地删除分类 "${category}" 的 ${matchedLines.length} 条语料，但 GitHub 更新失败：${error.message}`);
    }
  }
  
  // 整理语料库功能
  if (text.startsWith('/organize')) {
    if (!isAuthorized) {
      return sendPlainText(chatId, "❌ 你无权执行此命令！");
    }
    
    try {
      const linesArray = lines.trim().split('\n').filter(line => line.trim() !== '');
      
      // 按分类组织语料
      const categorized = {};
      
      linesArray.forEach(line => {
        const match = line.match(/\{(.+?)\}/);
        if (match) {
          const category = match[1];
          if (!categorized[category]) {
            categorized[category] = [];
          }
          categorized[category].push(line);
        }
      });
      
      // 重新组合语料
      let organizedLines = '';
      
      // 按分类名称字母顺序排序
      const sortedCategories = Object.keys(categorized).sort();
      
      sortedCategories.forEach(category => {
        const categoryLines = categorized[category];
        organizedLines += categoryLines.join('\n') + '\n';
      });
      
      lines = organizedLines.trim();
      
      await updateGitHubFile(lines);
      return sendPlainText(chatId, `✅ 已整理语料库，共 ${Object.keys(categorized).length} 个分类，${linesArray.length} 条语料`);
    } catch (error) {
      console.error("❌ 整理语料库失败：", error);
      return sendPlainText(chatId, `❌ 整理语料库失败：${error.message}`);
    }
  }
// 处理添加单条语料的命令 - 在这里添加新代码
if (text.startsWith('/update_file')) {
  if (!isAuthorized) {
    return sendPlainText(chatId, "❌ 你无权执行此命令！");
  }
  
  const content = text.replace('/update_file', '').trim();
  const match = content.match(/^\s*\{(.+?)\}\s*(.+)$/);
  
  if (!match) {
    return sendPlainText(chatId, "❌ 格式错误！正确格式：/update_file {分类}内容");
  }
  
  const category = match[1];
  const line = match[2].trim();
  
  if (!line) {
    return sendPlainText(chatId, "❌ 内容不能为空！");
  }
  
  // 检查重复
  if (checkDuplicate(lines, category, line)) {
    return sendPlainText(chatId, "❌ 该语料已存在！");
  }
  
  // 添加新语料
  lines += `\n{${category}}${line}`;
  
  try {
    await updateGitHubFile(lines);
    return sendPlainText(chatId, `✅ 已成功添加语料到分类 "${category}"`);
  } catch (error) {
    console.error("❌ GitHub 更新失败：", error);
    return sendPlainText(chatId, `✅ 已添加语料到本地，但 GitHub 更新失败：${error.message}`);
  }
}
}  // onMessage 函数的结束括号

async function updateGitHubFile(content) {
  console.log("🔄 正在获取 GitHub 文件信息...");
  
  try {
    // 直接尝试创建/更新文件
    console.log("🔄 正在提交到 GitHub...");
    
    const updateResponse = await fetch(GITHUB_API_URL, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Evil773-Bot' // 添加User-Agent头
      },
      body: JSON.stringify({
        message: "更新语料库",
        content: btoa(unescape(encodeURIComponent(content))), // Base64 编码，处理中文
        sha: await getFileSha() // 获取当前文件的 SHA，如果是新文件则为 null
      })
    });

    const responseText = await updateResponse.text();
    let responseData;
    
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      throw new Error(`GitHub 响应解析失败: ${responseText.slice(0, 100)}...`);
    }

    if (!updateResponse.ok) {
      console.error("❌ GitHub 更新失败：", responseData);
      throw new Error(responseData.message || `状态码: ${updateResponse.status}`);
    }

    console.log("✅ GitHub 更新成功！");
    return responseData;
  } catch (error) {
    console.error("❌ GitHub 操作失败：", error);
    throw error;
  }
}

// 获取文件SHA，如果文件不存在则返回null
async function getFileSha() {
  try {
    const response = await fetch(GITHUB_API_URL, {
      method: 'GET',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Evil773-Bot' // 添加User-Agent头
      }
    });
    
    // 如果文件不存在，返回null（GitHub会创建新文件）
    if (response.status === 404) {
      return null;
    }
    
    // 尝试解析响应
    const responseText = await response.text();
    let data;
    
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error("❌ 响应解析失败:", responseText);
      return null; // 解析失败时尝试创建新文件
    }
    
    return data.sha;
  } catch (error) {
    console.error("❌ 获取SHA失败:", error);
    return null; // 出错时尝试创建新文件
  }
}

async function onInlineQuery(inlineQuery) {
  let currentLines = lines;
  
  try {
    if (typeof SOURCE !== 'undefined' && SOURCE) {
      const response = await fetch(SOURCE);
      if (response.ok) {
        currentLines = await response.text();
      } else {
        console.error("❌ 无法从远程源获取语料库，使用本地缓存");
      }
    }
  } catch (error) {
    console.error("❌ 获取远程语料库失败，使用本地缓存", error);
  }

  const results = [];
  const linesArray = currentLines.trim().split('\n').filter(line => line.trim() !== '');
  const query = inlineQuery.query.trim();

  if (query) {
    // 增强模糊搜索功能
    const matchedLines = linesArray.filter(line => {
      // 分类匹配
      const categoryMatch = line.match(/\{(.+?)\}/);
      const category = categoryMatch ? categoryMatch[1] : '';
      
      // 内容匹配
      const content = line.replace(/\{(.+?)\}/, '').trim();
      
      // 搜索词拆分为多个关键词，只要匹配其中之一就行
      const keywords = query.toLowerCase().split(/\s+/);
      
      for (const keyword of keywords) {
        if (category.toLowerCase().includes(keyword) || 
            content.toLowerCase().includes(keyword)) {
          return true;
        }
      }
      
      return false;
    }).slice(0, 50);
    
    matchedLines.forEach(line => {
      const match = line.match(/{(.+?)}/);
      const description = match ? match[1] : 'No description';
      const content = line.replace(/{(.+?)}/, '').trim();

      if (content) {
        results.push({
          type: 'article',
          id: generateUUID(),
          title: content,
          description: description,
          input_message_content: {
            message_text: content
          }
        });
      }
    });
  } else {
    // 没有查询时随机选择10条
    const randomLines = [];
    const linesCopy = [...linesArray];
    
    for (let i = 0; i < Math.min(10, linesCopy.length); i++) {
      const randomIndex = Math.floor(Math.random() * linesCopy.length);
      randomLines.push(linesCopy.splice(randomIndex, 1)[0]);
    }
    
    randomLines.forEach(line => {
      const match = line.match(/{(.+?)}/);
      const description = match ? match[1] : 'No description';
      const content = line.replace(/{(.+?)}/, '').trim();

      if (content) {
        results.push({
          type: 'article',
          id: generateUUID(),
          title: content,
          description: description,
          input_message_content: {
            message_text: content
          }
        });
      }
    });
  }

  const data = {
    inline_query_id: inlineQuery.id,
    results: JSON.stringify(results),
    cache_time: 1
  };

  try {
    const response = await fetch(apiUrl('answerInlineQuery'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    return await response.json();
  } catch (error) {
    console.error("❌ 回答内联查询失败：", error);
    return { ok: false, error: error.message };
  }
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function apiUrl(methodName, params = null) {
  let query = '';
  if (params) {
    query = '?' + new URLSearchParams(params).toString();
  }
  return `https://api.telegram.org/bot${TOKEN}/${methodName}${query}`;
}

async function sendPlainText(chatId, text) {
  try {
    const response = await fetch(apiUrl('sendMessage'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text
      })
    });
    return await response.json();
  } catch (error) {
    console.error("❌ 发送消息失败：", error);
    return { ok: false, error: error.message };
  }
}

// 实现 registerWebhook 函数
async function registerWebhook(request, url, webhookPath, secret) {
  const baseUrl = url.origin;
  const webhookUrl = baseUrl + webhookPath;
  
  try {
    const response = await fetch(apiUrl('setWebhook'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secret
      })
    });
    
    const result = await response.json();
    return new Response(JSON.stringify(result, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("❌ 注册 Webhook 失败：", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }, null, 2), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 实现 unRegisterWebhook 函数
async function unRegisterWebhook(request) {
  try {
    const response = await fetch(apiUrl('deleteWebhook'));
    const result = await response.json();
    return new Response(JSON.stringify(result, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("❌ 取消注册 Webhook 失败：", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }, null, 2), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function onDocumentUpload(message) {
  const chatId = message.chat?.id;
  const userId = message.from?.id;
  const document = message.document;
  
  // Check user authorization
  const isAuthorized = ALLOWED_CHAT_ID === chatId || ALLOWED_USER_IDS.includes(userId) || TEMPORARY_AUTHORIZED_USERS.includes(userId);
  
  if (!isAuthorized) {
    return sendPlainText(chatId, "❌ 你无权上传语料文件！");
  }
  
  // Check if document is a text file
  if (!document.file_name.toLowerCase().endsWith('.txt')) {
    return sendPlainText(chatId, "❌ 只支持上传.txt文本文件！");
  }
  
  // Check file size (limit to 1MB)
  if (document.file_size > 1024 * 1024) {
    return sendPlainText(chatId, "❌ 文件过大！请保持文件大小在1MB以内。");
  }
  
  // Notify user that processing has started
  await sendPlainText(chatId, "⏳ 正在处理文件，请稍候...");
  
  try {
    // Get file path from Telegram
    const fileResponse = await fetch(apiUrl('getFile', { file_id: document.file_id }));
    const fileData = await fileResponse.json();
    
    if (!fileData.ok) {
      throw new Error(`获取文件失败: ${fileData.description}`);
    }
    
    // Download the file
    const filePath = fileData.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
    const fileContentResponse = await fetch(fileUrl);
    const fileContent = await fileContentResponse.text();
    
    // Process the file content
    const result = await processFileContent(fileContent);
    
    // Update GitHub with new content
    await updateGitHubFile(lines);
    
    // Send report to user
    return sendPlainText(chatId, result.message);
  } catch (error) {
    console.error("❌ 处理文件失败:", error);
    return sendPlainText(chatId, `❌ 处理文件失败: ${error.message}`);
  }
}

async function processFileContent(content) {
  const fileLines = content.split('\n').filter(line => line.trim() !== '');
  
  // Validate and filter lines
  const invalidLines = [];
  const validLines = [];
  const duplicates = [];
  
  for (const line of fileLines) {
    const match = line.match(/^\s*\{([^}]+)\}\s*([\s\S]+)$/);
    if (!match) {
      invalidLines.push(line);
      continue;
    }
    
    const category = match[1];
    const text = match[2].trim();
    
    if (!text) {
      invalidLines.push(line);
      continue;
    }
    
    // Check for duplicates
    if (checkDuplicate(lines, category, text)) {
      duplicates.push(line);
      continue;
    }
    
    validLines.push(line);
  }
  
  if (validLines.length === 0) {
    let message = "❌ 文件中没有可添加的有效语料！";
    
    if (invalidLines.length > 0) {
      message += `\n\n⚠️ ${invalidLines.length} 行格式无效`;
      if (invalidLines.length <= 5) {
        message += "：\n" + invalidLines.slice(0, 5).join('\n');
      }
    }
    
    if (duplicates.length > 0) {
      message += `\n\n⚠️ ${duplicates.length} 行重复`;
      if (duplicates.length <= 5) {
        message += "：\n" + duplicates.slice(0, 5).join('\n');
      }
    }
    
    return {
      success: false,
      message: message
    };
  }
  
  // Add valid lines to corpus
  lines += '\n' + validLines.join('\n');
  
  let message = `✅ 成功从文件中添加 ${validLines.length} 条语料！`;
  
  if (invalidLines.length > 0) {
    message += `\n\n⚠️ ${invalidLines.length} 行格式无效未被添加`;
    if (invalidLines.length <= 3) {
      message += "：\n" + invalidLines.slice(0, 3).join('\n');
    }
  }
  
  if (duplicates.length > 0) {
    message += `\n\n⚠️ ${duplicates.length} 行重复未被添加`;
    if (duplicates.length <= 3) {
      message += "：\n" + duplicates.slice(0, 3).join('\n');
    }
  }
  
  return {
    success: true,
    message: message
  };
}