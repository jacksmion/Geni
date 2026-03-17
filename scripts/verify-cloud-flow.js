import OpenAI from 'openai';
import fetch from 'node-fetch';

/**
 * Geni Cloud 订阅制模式全链路验证脚本 (重构版)
 */

const BASE_URL = 'http://172.22.246.210:3000';
const TEST_PASSWORD = 'geni123456';
const TEST_USER = `test_5154`;
const TOKEN_NAME = 'Geni_Verify_Token';

/**
 * 1. 用户注册
 */
async function registerUser(username, password) {
  console.log(`[Step 1] 注册新用户: ${username}...`);
  const res = await fetch(`${BASE_URL}/api/user/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password,
      confirm_password: password
    })
  });
  const data = await res.json();
  console.log('DEBUG Register Response:', JSON.stringify(data, null, 2));
  if (!data.success) throw new Error(`注册失败: ${data.message}`);
  console.log('✅ 注册成功\n');
  return data;
}

/**
 * 2. 用户登录
 */
async function loginUser(username, password) {
  console.log('[Step 2] 模拟登录获取 Session...');
  const res = await fetch(`${BASE_URL}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  console.log('DEBUG Login Response:', JSON.stringify(data, null, 2));
  if (!data.success) throw new Error(`登录失败: ${data.message}`);

  const cookie = res.headers.get('set-cookie');
  console.log('✅ 登录成功，已获取 Session Cookie\n');
  return {
    cookie,
    userId: data.data.id,
    userInfo: data.data
  };
}

/**
 * 2.5 获取用户信息 (包含积分/额度)
 */
async function getUserInfo(cookie, userId) {
  console.log('[Step 2.5] 获取当前用户信息与积分...');
  const res = await fetch(`${BASE_URL}/api/user/self`, {
    headers: {
      'Cookie': cookie,
      'New-Api-User': userId.toString()
    }
  });
  const data = await res.json();
  if (!data.success) throw new Error(`获取用户信息失败: ${data.message}`);
  
  const quota = data.data.quota;
  // 计算美元 (New API 默认 500000 = $1)
  const usdStatus = (quota / 500000).toFixed(2);
  console.log(`✅ 获取成功! 剩余积分: ${quota} (约 $${usdStatus})\n`);
  return data.data;
}

/**
 * 3. 创建渠道令牌 (Channel Token)
 */
async function createChannelToken(cookie, userId, name) {
  console.log(`[Step 3] 尝试创建新渠道令牌: ${name}...`);
  const res = await fetch(`${BASE_URL}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie,
      'New-Api-User': userId.toString()
    },
    body: JSON.stringify({
      name,
      expired_time: -1,
      remain_quota: 500000,
      unlimited_quota: true
    })
  });
  const data = await res.json();
  console.log('DEBUG Create Token Response:', JSON.stringify(data, null, 2));
  if (!data.success) throw new Error(`创建渠道令牌失败: ${data.message}`);
  return data.data; // 返回包含 key 的对象
}

/**
 * 4. 获取已有的渠道令牌列表
 */
async function listChannelTokens(cookie, userId) {
  console.log('[Step 4] 获取现有渠道令牌列表...');
  const res = await fetch(`${BASE_URL}/api/token`, {
    headers: {
      'Cookie': cookie,
      'New-Api-User': userId.toString()
    }
  });
  const data = await res.json();
  if (!data.success) throw new Error(`获取令牌列表失败: ${data.message}`);
  return Array.isArray(data.data?.items) ? data.data.items : (Array.isArray(data.data) ? data.data : []);
}

/**
 * 4.5 获取单个渠道令牌详情
 */
async function getTokenKey(cookie, userId, tokenId) {
  console.log(`[Step 4.5] 尝试获取令牌明文 Key (ID: ${tokenId})...`);
  const res = await fetch(`${BASE_URL}/api/token/${tokenId}/key`, {
    method: 'POST',
    headers: {
      'Cookie': cookie,
      'New-Api-User': userId.toString()
    }
  });
  const data = await res.json();
  console.log('DEBUG Token Key Response:', JSON.stringify(data, null, 2));
  if (!data.success) throw new Error(`获取令牌明文失败: ${data.message}`);
  // 该接口通常直接返回 { success: true, data: "sk-..." }
  return data.data;
}

/**
 * 5. 获取模型列表
 */
async function getModels(apiToken) {
  console.log('[Step 4] 验证 /v1/models 接口 (模型同步)...');
  const res = await fetch(`${BASE_URL}/v1/models`, {
    headers: { 'Authorization': `Bearer ${apiToken}` }
  });
  const data = await res.json();
  console.log('DEBUG Get Models Response:', JSON.stringify(data, null, 2));

  if (!data.data || data.data.length === 0) {
    console.warn('⚠️ 警告: 未获取到可用模型清单。');
  } else {
    console.log(`✅ 成功获取模型清单，当前可用数量: ${data.data.length}`);
  }
  return data.data || [];
}

/**
 * 6. 大模型对话测试
 */
async function chatTest(apiToken, modelId) {
  console.log(`[Step 5] 发起大模型对话测试 (模型: ${modelId})...`);
  const client = new OpenAI({
    apiKey: apiToken,
    baseURL: `${BASE_URL}/v1`
  });

  const stream = await client.chat.completions.create({
    model: modelId,
    messages: [{ role: 'user', content: '你好，请介绍一下你。' }],
    stream: true,
  });

  console.log('🤖 AI 回复:');
  process.stdout.write('   ');
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    process.stdout.write(content);
  }
  console.log('\n\n✅ 对话链路验证完成！');
}

/**
 * 7. 获取最后一次消费日志
 */
async function getLastConsumeLog(cookie, userId) {
  console.log('[Step 6] 正在查询消费记录与统计...');
  await new Promise(r => setTimeout(r, 2000)); // 增加到 2 秒确保写入
  
  // 尝试 1: 获取具体的消费流水 (使用 p=1 兼容某些版本)
  const resLog = await fetch(`${BASE_URL}/api/log/self?p=1&page_size=1&type=2`, {
    headers: { 'Cookie': cookie, 'New-Api-User': userId.toString() }
  });
  const dataLog = await resLog.json();
  
  // 尝试 2: 获取日志统计信息 (图片中的接口)
  const resStat = await fetch(`${BASE_URL}/api/log/self/stat`, {
    headers: { 'Cookie': cookie, 'New-Api-User': userId.toString() }
  });
  const dataStat = await resStat.json();
  console.log('DEBUG Stat Response:', JSON.stringify(dataStat, null, 2));

  if (dataLog.success && dataLog.data && dataLog.data.length > 0) {
    const log = dataLog.data[0];
    console.log(`📊 消费流水明细 (最新):`);
    console.log(`   - 模型: ${log.model_name}`);
    console.log(`   - 消耗额度: ${log.quota}`);
    console.log(`   - 详情: ${log.prompt_tokens} (入) + ${log.completion_tokens} (出) tokens`);
  } else if (dataStat.success) {
    console.log('📊 个人日志统计 (汇总):');
    // 统计接口通常返回数组或对象，视版本而定
    console.log(`   - 累计消耗: ${dataStat.data?.quota || '未知'}`);
  } else {
    console.log('⚠️ 未能查到有效的消费数据。');
  }
}

/**
 * 主执行流程
 */
async function verifyFlow() {
  console.log('🚀 开始 Geni Cloud 订阅模式全链路验证...');
  console.log(`📍 后端地址: ${BASE_URL}\n`);

  try {
    // 流程编排
    // await registerUser(TEST_USER, TEST_PASSWORD);
    const { cookie, userId } = await loginUser(TEST_USER, TEST_PASSWORD);

    // 步骤 2.5: 获取用户积分
    await getUserInfo(cookie, userId);

    // 步骤 3 & 4: 查找或创建以 "geni" 开头的渠道令牌
    const tokens = await listChannelTokens(cookie, userId);
    // 寻找名称以 "geni" 开头的令牌 (忽略大小写)
    let foundToken = tokens.find(t => t.name.toLowerCase().startsWith('geni'));
    let apiToken;

    if (foundToken) {
      console.log(`✨ 找到现有的 geni 开头令牌: ${foundToken.name} (ID: ${foundToken.id})`);
      // 核心尝试：通过专用 /key 接口获取明文
      apiToken = await getTokenKey(cookie, userId, foundToken.id);
    } else {
      console.log('🔍 未找到 geni 开头的令牌，准备创建...');
      const newToken = await createChannelToken(cookie, userId, `geni_token_${Date.now()}`);
      apiToken = newToken.key;
    }

    // 确保 apiToken 是字符串
    if (apiToken && typeof apiToken !== 'string') {
      apiToken = apiToken.key || apiToken.toString();
    }

    if (!apiToken || (typeof apiToken === 'string' && apiToken.includes('*'))) {
      console.warn('⚠️ 获取到的 Key 无效或已脱敏，请检查系统设置。');
    }
    
    // 规范化前缀
    apiToken = String(apiToken);
    apiToken = apiToken.startsWith('sk-') ? apiToken : `sk-${apiToken}`;
    console.log(`✅ 最终使用的 API Token: ${apiToken}\n`);

    // 步骤 5: 验证 /v1/models 接口
    const models = await getModels(apiToken);

    if (models.length > 0) {
      // 注意：chatTest 依然需要有效的 sk- 令牌，如果 Token 脱敏了，这里可能依然会失败
      await chatTest(apiToken, models[0].id);
      
      // 步骤 6: 验证消费记录
      await getLastConsumeLog(cookie, userId);
    }

  } catch (error) {
    console.error(`\n❌ 验证过程中出现异常: ${error.message}`);
    process.exit(1);
  }
}

verifyFlow();
