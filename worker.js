const TOKEN = '' // bot token
const SECRET = '' // 随机密钥
const SOURCE = 'https://roxio-sketch.github.io/Evil773_bot/Evil773.txt' // 远程语料库
const ALLOWED_CHAT_ID = -1001234567890; // ⚠️ 你的群组 ID，负数表示是群组

var lines = ` 
{S1E1}智乃酱~
{S1E2}测试字幕~
`; 

const WEBHOOK = '/endpoint'

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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
  }
  if ('inline_query' in update) {
    await onInlineQuery(update.inline_query);
  }
}

async function onMessage(message) {
  const chatId = message.chat?.id;
  const text = message.text?.trim();

  if (text.startsWith('/start') || text.startsWith('/help')) {
    return sendPlainText(chatId, '狞畜，死！！！');
  }

  // 处理 /update_file 但仅限于 ALLOWED_CHAT_ID
  if (text.startsWith('/update_file')) {
    if (chatId !== ALLOWED_CHAT_ID) {
      return sendPlainText(chatId, "❌ 只能在指定群组使用此功能！");
    }

    // 解析用户输入
    const args = text.split(' ').slice(1);
    if (args.length < 2) {
      return sendPlainText(chatId, "⚠️ 格式错误！正确格式：\n`/update_file {分类} 文字内容`");
    }

    const category = args[0]; // 语料分类
    const content = args.slice(1).join(' '); // 文字内容

    // 添加到本地语料库
    lines += `\n{${category}}${content}`;

    return sendPlainText(chatId, `✅ 已添加语料：\n{${category}}${content}`);
  }
}

async function onInlineQuery(inlineQuery) {
  if (typeof SOURCE !== 'undefined') {
    const response = await fetch(SOURCE);
    lines = await response.text();
  }
  const results = [];
  const linesArray = lines.trim().split('\n').filter(line => line.trim() !== '');
  const query = inlineQuery.query.trim();

  if (query) {
    const matchedLines = linesArray.filter(line => line.toLowerCase().includes(query.toLowerCase())).slice(0, 50);
    matchedLines.forEach(line => {
      const match = line.match(/{(.+?)}/);
      const description = match ? match[1] : 'No description';
      const content = line.replace(/{(.+?)}/, '').trim();

      results.push({
        type: 'article',
        id: generateUUID(),
        title: content,
        description: description,
        input_message_content: {
          message_text: content
        }
      });
    });
  } else {
    const selectedLines = linesArray.sort(() => 0.5 - Math.random()).slice(0, 10);
    selectedLines.forEach(line => {
      const match = line.match(/{(.+?)}/);
      const description = match ? match[1] : 'No description';
      const content = line.replace(/{(.+?)}/, '').trim();

      results.push({
        type: 'article',
        id: generateUUID(),
        title: content,
        description: description,
        input_message_content: {
          message_text: content
        }
      });
    });
  }

  const data = {
    inline_query_id: inlineQuery.id,
    results: JSON.stringify(results),
    cache_time: 1
  };

  return fetch(apiUrl('answerInlineQuery', data)).then(response => response.json());
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function registerWebhook(request, requestUrl, suffix, secret) {
  const webhookUrl = `${requestUrl.protocol}//${requestUrl.hostname}${suffix}`;
  const r = await (await fetch(apiUrl('setWebhook', { url: webhookUrl, secret_token: secret }))).json();
  return new Response('ok' in r && r.ok ? 'Ok' : JSON.stringify(r, null, 2));
}

async function unRegisterWebhook(request) {
  const r = await (await fetch(apiUrl('setWebhook', { url: '' }))).json();
  return new Response('ok' in r && r.ok ? 'Ok' : JSON.stringify(r, null, 2));
}

function apiUrl(methodName, params = null) {
  let query = '';
  if (params) {
    query = '?' + new URLSearchParams(params).toString();
  }
  return `https://api.telegram.org/bot${TOKEN}/${methodName}${query}`;
}

async function sendPlainText(chatId, text) {
  return (await fetch(apiUrl('sendMessage', {
    chat_id: chatId,
    text
  }))).json();
}
