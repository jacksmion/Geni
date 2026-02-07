export interface PlanTask {
    id: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
    outcome?: string;
}

export interface ImplementationPlan {
    id: string;
    description: string;
    createdAt: number;
    updatedAt: number;
    tasks: PlanTask[];
    status: 'active' | 'completed' | 'failed';
}
