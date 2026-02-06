import matter from 'gray-matter';
import { z } from 'zod';

export const SkillSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    version: z.string(),
});

export type SkillMetadata = z.infer<typeof SkillSchema>;

export interface SkillObject extends SkillMetadata {
    instruction: string;
    path?: string;
}

export class SkillParser {
    static parse(content: string, filePath?: string): SkillObject {
        const { data, content: body } = matter(content);

        try {
            // Validate frontmatter
            const metadata = SkillSchema.parse(data);

            return {
                ...metadata,
                instruction: body.trim(),
                path: filePath
            };
        } catch (error) {
            if (error instanceof z.ZodError) {
                throw new Error(`Invalid skill metadata in ${filePath || 'content'}: ${JSON.stringify(error.format())}`);
            }
            throw error;
        }
    }
}
