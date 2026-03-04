import matter from 'gray-matter';
import { z } from 'zod';

export const SkillSchema = z.object({
    id: z.string().optional(),
    name: z.string(),
    description: z.string(),
    license: z.string().optional(),
    version: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
}).transform((data) => {
    const metaStruct = data.metadata || {};
    const version = metaStruct.version || data.version || '1.0.0';

    return {
        ...data,
        id: data.id ?? data.name,
        version: String(version),
        metadata: metaStruct,
    };
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
                throw new Error(`Invalid skill metadata in ${filePath || 'content'}: ${JSON.stringify(error.format())}`, { cause: error });
            }
            throw error;
        }
    }
}
