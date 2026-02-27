/**
 * Markdown 预处理器：修复大模型常见的格式不规范问题
 */
export function preprocessMarkdown(content: string) {
    if (!content) return "";

    let processed = content;

    // 1. 修复标题：确保 # 后面有空格 (例如 ###标题 -> ### 标题)
    processed = processed.replace(/^(#{1,6})([^\s#].*)$/gm, "$1 $2");

    // 2. 修复列表：确保 *、- 或数字列表后面有空格 (例如 *列表 -> * 列表)
    // 仅针对行首的列表符
    processed = processed.replace(/^([\s]*[*+-])([^\s*+-].*)$/gm, "$1 $2");
    processed = processed.replace(/^([\s]*\d+\.)([^\s\d].*)$/gm, "$1 $2");

    // 3. 修复换行：在标题和列表之前强制增加一个空行，如果前面不是空行的话
    // 这样能确保解析器能正确识别块级元素
    processed = processed.replace(/([^\n])\n(#{1,6}\s)/g, "$1\n\n$2");
    processed = processed.replace(/([^\n])\n([\s]*[*+-\d]+\.\s)/g, "$1\n\n$2");

    return processed;
}
