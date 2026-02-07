import { ImplementationPlan, PlanTask } from './PlanTypes';

export class PlanManager {
    private currentPlan: ImplementationPlan | null = null;
    private static instance: PlanManager;

    private constructor() {
        // Private constructor for singleton
    }

    public static getInstance(): PlanManager {
        if (!PlanManager.instance) {
            PlanManager.instance = new PlanManager();
        }
        return PlanManager.instance;
    }

    async createPlan(description: string, tasks: string[]): Promise<ImplementationPlan> {
        this.currentPlan = {
            id: Date.now().toString(),
            description,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            status: 'active',
            tasks: tasks.map((desc, index) => ({
                id: (index + 1).toString(),
                description: desc,
                status: 'pending'
            }))
        };

        return this.currentPlan;
    }

    async getActivePlan(): Promise<ImplementationPlan | null> {
        return this.currentPlan;
    }

    async updateTaskStatus(taskId: string, status: PlanTask['status'], outcome?: string): Promise<ImplementationPlan> {
        if (!this.currentPlan) {
            throw new Error('No active plan found');
        }

        const task = this.currentPlan.tasks.find(t => t.id === taskId);
        if (!task) {
            throw new Error(`Task with ID ${taskId} not found`);
        }

        task.status = status;
        if (outcome) {
            task.outcome = outcome;
        }
        this.currentPlan.updatedAt = Date.now();

        // Check if all tasks are completed
        if (this.currentPlan.tasks.every(t => t.status === 'completed' || t.status === 'skipped')) {
            this.currentPlan.status = 'completed';
        }

        return this.currentPlan;
    }
}

// Export singleton
export const planManager = PlanManager.getInstance();
