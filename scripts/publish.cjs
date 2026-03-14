const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Geni 自动化发布脚本 (SSH/SCP版)
 * 使用说明:
 * 1. 修改下面的 CONFIG 参数
 * 2. 确保本地已配置 SSH Key 免密登录服务器
 * 3. 运行: node scripts/publish.cjs
 */

const CONFIG = {
    // 目标服务器配置 (格式: user@host:/path/to/updates/)
    // 请确保该目录在服务器上已存在
    remotePath: 'root@your-server-ip:/var/www/geni-updates/',
    
    // 构建产物目录
    releaseDir: path.join(__dirname, '../release')
};

function runCommand(command) {
    console.log(`> 执行: ${command}`);
    try {
        execSync(command, { stdio: 'inherit' });
    } catch (e) {
        console.error(`❌ 执行失败: ${e.message}`);
        process.exit(1);
    }
}

async function publish() {
    console.log('🚀 开始自动化发布流程...');

    // 1. 打包应用
    console.log('\n📦 正在构建安装包 (npm run dist)...');
    runCommand('npm run dist');

    // 2. 检查构建结果
    const latestYml = path.join(CONFIG.releaseDir, 'latest.yml');
    if (!fs.existsSync(latestYml)) {
        console.error('❌ 未找到 latest.yml，构建可能已失败。');
        process.exit(1);
    }

    // 3. 上传文件
    console.log('\n📤 正在通过 SSH/SCP 上传产物...');
    
    // 我们只需要上传：latest.yml, .exe, .blockmap (Windows)
    // 如果有 Mac/Linux，增加相应的扩展名
    const extensions = ['.yml', '.exe', '.blockmap', '.dmg', '.zip', '.AppImage', '.deb'];
    
    const files = fs.readdirSync(CONFIG.releaseDir)
        .filter(file => extensions.some(ext => file.endsWith(ext)));

    if (files.length === 0) {
        console.error('❌ 没有找到可上传的文件。');
        process.exit(1);
    }

    console.log(`准备上传 ${files.length} 个文件...`);

    for (const file of files) {
        const localFile = path.join(CONFIG.releaseDir, file);
        // 如果文件名包含空格，需要处理
        const safeFile = `"${localFile}"`;
        console.log(`  -> 上传 ${file}...`);
        runCommand(`scp ${safeFile} ${CONFIG.remotePath}`);
    }

    console.log('\n✨ 发布任务圆满完成！');
    console.log(`请确保服务器上的目录权限正确，且已通过 HTTPS 暴露服务。`);
    console.log(`当前指向地址: ${CONFIG.remotePath}`);
}

publish();
