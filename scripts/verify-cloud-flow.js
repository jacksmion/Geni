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
 * 3. 创建 API 令牌
 */
async function createToken(cookie, userId, name) {
  console.log('[Step 3] 端创建 API 访问令牌...');
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
  if (!data.success) throw new Error(`创建令牌失败: ${data.message}`);
  return data.data; // 包含 id 和 key (可能为 null)
}

/**
 * 4. 获取有效的 API Key (仅通过名称查找，可选 ID)
 */
async function getApiTokenKey(cookie, userId, name, tokenId = null) {
  let rawKey = null;

  // 如果提供了 ID，优先通过 ID 获取详情
  if (tokenId) {
    console.log(`💡 尝试通过 ID (${tokenId}) 获取令牌详情...`);
    const res = await fetch(`${BASE_URL}/api/token/${tokenId}`, {
      headers: {
        'Cookie': cookie,
        'New-Api-User': userId.toString()
      }
    });
    const data = await res.json();
    console.log('DEBUG Token Detail Response:', JSON.stringify(data, null, 2));
    rawKey = data.data?.key;
  }

  // 如果未提供 ID 或通过 ID 获取失败，尝试通过列表匹配名称
  if (!rawKey) {
    console.log(`💡 尝试在令牌列表中查找名为 "${name}" 的令牌...`);
    const res = await fetch(`${BASE_URL}/api/token`, {
      headers: {
        'Cookie': cookie,
        'New-Api-User': userId.toString()
      }
    });
    const data = await res.json();
    console.log('DEBUG List Tokens Response:', JSON.stringify(data, null, 2));

    // 兼容分页格式 (data.items) 和直接数组格式
    const tokens = Array.isArray(data.data?.items) ? data.data.items : (Array.isArray(data.data) ? data.data : []);

    if (tokens.length > 0) {
      console.log(`📊 当前用户下共有 ${tokens.length} 个令牌。`);
      // 按照 ID 从大到小排序，确保拿到最新创建的那个
      const sortedTokens = [...tokens].sort((a, b) => b.id - a.id);
      const foundToken = sortedTokens.find(t => t.name === name);
      rawKey = foundToken?.key;
    }
  }

  if (!rawKey) {
    throw new Error(`未能在返回结果或令牌列表中找到 API Key (名称: ${name})。`);
  }

  return `sk-${rawKey}`;
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
 * 主执行流程
 */
async function verifyFlow() {
  console.log('🚀 开始 Geni Cloud 订阅模式全链路验证...');
  console.log(`📍 后端地址: ${BASE_URL}\n`);

  try {
    // 流程编排
    // await registerUser(TEST_USER, TEST_PASSWORD);
    const { cookie, userId } = await loginUser(TEST_USER, TEST_PASSWORD);

    // 步骤 3: 创建，但不强制依赖它返回的 ID
    // await createToken(cookie, userId, TOKEN_NAME);

    // 步骤 4: 独立获取令牌（体现接口的解耦性，仅凭名称和环境即可找回）
    const apiToken = await getApiTokenKey(cookie, userId, TOKEN_NAME, 10);
    console.log(`✅ 最终使用的 API Token: ${apiToken}\n`);
    
    const models = await getModels(apiToken);

    if (models.length > 0) {
      await chatTest(apiToken, models[0].id);
    }

  } catch (error) {
    console.error(`\n❌ 验证过程中出现异常: ${error.message}`);
    process.exit(1);
  }
}

verifyFlow();
