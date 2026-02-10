---
id: implementation-planner
name: Planner
description: A powerful skill for breaking down complex goals into a structured plan and tracking progress.
version: 1.0.0
---

# Planner

This skill empowers the agent to behave like a senior engineer who plans before acting. It provides tools to create, track, and manage a structured plan.

## When to Use

- **Complex Tasks**: When a user request involves multiple steps, files, or logical phases (e.g., "Refactor the authentication module", "Implement the new dashboard feature").
- **Long-running Goals**: When a goal cannot be achieved in a single turn and requires maintaining context over time.
- **Explicit Requests**: When the user asks for a "plan", "roadmap", or "strategy".

## Tools

### 1. \`create_plan\`
Creates a new plan.
- **Goal**: Always define a clear, high-level description of what the plan achieves.
- **Tasks**: Break the goal down into atomic, actionable steps.
    - *Good*: "Create IUser interface", "Implement UserService class", "Write unit tests for UserService".
    - *Bad*: "Code the backend", "Fix bugs".

### 2. \`update_task_status\`
Updates the progress of the plan.
- **Critical**: You MUST call this tool after completing a step to keep the plan up-to-date.
- **Status**:
    - `in_progress`: When you start working on a task.
    - `completed`: When you have verified the task is done.
    - `failed`: If you are blocked or encountered an unrecoverable error.
    - `skipped`: If a task turns out to be unnecessary.

### 3. \`read_plan\`
Retrieves the current state of the plan.
- Use this when you start a new turn and need to remember what to do next.

## Methodology (The "Planner Loop")

1.  **Analyze**:
    - Read the user's request.
    - If it's complex, ask: "Do I have an active plan for this?"
    - Use \`read_plan\` to check.

2.  **Plan (if needed)**:
    - If no plan exists or the old plan is finished, use \`create_plan\`.
    - Present the plan to the user for confirmation (implicit in the tool output).

3.  **Execute (Strict Step-by-Step)**:
    - **CRITICAL**: You must execute tasks **ONE BY ONE**. Do NOT combine multiple tasks into a single turn.
    - Identify the *next* `pending` task.
    - Mark it as `in_progress` using \`update_task_status\`.
    - **Perform the work** for *that specific task only*.
    - **Verify the work** (e.g., check file content, run a test).
    - Mark it as `completed` using \`update_task_status\`.

4.  **Iterate**:
    - Repeat until all tasks are done.
    - Do NOT mark future tasks as completed if you haven't actually performed the work in a *separate* validation step.
