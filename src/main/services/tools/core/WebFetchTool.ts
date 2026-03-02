import { ITool, ToolDefinition, ToolExecutionResult } from '../../../../common/types/tool';
import * as cheerio from 'cheerio';
import { NodeHtmlMarkdown } from 'node-html-markdown';

export class WebFetchTool implements ITool {
    getDefinition(): ToolDefinition {
        return {
            name: 'web_fetch',
            description: 'Fetch content from a specified URL and convert it to readable Markdown format.',
            input_schema: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'The full URL of the web page to fetch (e.g., https://example.com)'
                    }
                },
                required: ['url']
            }
        };
    }

    async execute(args: any, _signal?: AbortSignal): Promise<ToolExecutionResult> {
        try {
            const url = args.url;
            if (!url) {
                return {
                    toolName: 'web_fetch',
                    isError: true,
                    result: 'Error: URL parameter is explicitly required.'
                };
            }

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
                },
                signal: _signal
            });

            if (!response.ok) {
                return {
                    toolName: 'web_fetch',
                    isError: true,
                    result: `Failed to fetch URL: ${response.status} ${response.statusText}`
                };
            }

            const html = await response.text();

            // Clean up HTML
            const $ = cheerio.load(html);
            $('script, style, noscript, iframe, svg, nav, footer, header, aside').remove();

            // Extract main content or body
            let mainHtml = $('main').html() || $('article').html() || $('body').html() || html;

            // Convert to Markdown
            const markdown = NodeHtmlMarkdown.translate(mainHtml);

            // Enforce length limit (~100k characters)
            const MAX_LENGTH = 100000;
            let finalResult = markdown;

            if (finalResult.length > MAX_LENGTH) {
                finalResult = finalResult.substring(0, MAX_LENGTH) + '\n\n...[Content truncated due to length limits]...';
            }

            return {
                toolName: 'web_fetch',
                isError: false,
                result: finalResult
            };

        } catch (error: any) {
            return {
                toolName: 'web_fetch',
                isError: true,
                result: `Error fetching URL: ${error.message}`
            };
        }
    }
}
