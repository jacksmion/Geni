
import { GlobTool } from '../src/main/services/tools/core/GlobTool';
import path from 'path';
import fs from 'fs';

async function run() {
    const rootDir = process.cwd();
    console.log(`Testing GlobTool in: ${rootDir}`);

    const tool = new GlobTool(rootDir);

    // 1. Basic Search
    console.log('\n--- Test 1: Basic Search (src/main/**/*.ts) ---');
    const res1 = await tool.execute({
        pattern: 'src/main/**/*.ts',
        limit: 5
    });
    console.log('Result:', res1.result);

    // 2. Truncation Test
    console.log('\n--- Test 2: Truncation (Limit 2) ---');
    const res2 = await tool.execute({
        pattern: 'src/**/*.ts',
        limit: 2
    });
    console.log('Result:', res2.result);
    // Check if it has truncation message
    if (res2.result.includes('Results are truncated')) {
        console.log('✅ Truncation message found.');
    } else {
        console.error('❌ Truncation message MISSING.');
    }

    // 3. Sorting (Mtime) Test
    // Create a temp file to ensure it's the newest
    const tempFile = path.join(rootDir, 'temp_newest_glob_test.txt');
    fs.writeFileSync(tempFile, 'test');

    console.log('\n--- Test 3: Sorting (Newest First) ---');
    const res3 = await tool.execute({
        pattern: '*.txt',
        limit: 5
    });
    console.log('Result:', res3.result);

    // Verify our temp file is at the top (or present)
    if (res3.result.split('\n')[0].includes('temp_newest_glob_test.txt')) {
        console.log('✅ Newest file is at the top.');
    } else {
        console.log('⚠️ Newest file NOT at top (could be due to other file changes or timing resolution).');
    }

    // Cleanup
    fs.unlinkSync(tempFile);

    // 4. Exclude Test
    console.log('\n--- Test 4: Exclusion (Exclude src/**) ---');
    const res4 = await tool.execute({
        pattern: '**/*.ts',
        exclude: ['src/**'],
        limit: 5
    });
    console.log('Result:', res4.result);
    if (!res4.result.includes('src/')) {
        console.log('✅ Exclusion worked.');
    } else {
        console.error('❌ Exclusion failed, found src/ files.');
    }
}

run().catch(err => {
    console.error('Test Failed:', err);
});
