# Requirement: Geni Skill Market System (2026-04-13)

## 1. Background & Objective

Integrating the [vercel-labs/skills](https://github.com/vercel-labs/skills) ecosystem into Geni. Geni (under its codename `antigravity`) is already a supported agent in the skills ecosystem. The goal is to provide a user-friendly "Skill Market" interface within Geni to allow users to discover, search, and install productivity skills from the community.

## 2. Technical Architecture

### 2.1 Backend: `SkillMarketService`
A new service in the main process to handle data retrieval from the skills ecosystem.

- **Data Sources**:
  - **Primary**: Scrape `https://skills.sh` for trending/hot leaderboard data (HTML parsing).
  - **Search**: Utilize GitHub Search API to find repositories with the `agent-skills` topic.
  - **Fallback/Direct**: Built-in list of popular skill repositories (e.g., `vercel-labs/agent-skills`, `anthropics/skills`).
- **Functionalities**:
  - `fetchLeaderboard()`: Fetches and caches the trending skills from skills.sh.
  - `searchSkills(query)`: Searches GitHub for matching skill repositories or specific SKILL.md files.
  - `installSkill(url)`: Downloads the skill and integrates with the existing `SkillImportService`.

### 2.2 IPC Layer
- **New Channels**:
  - `tool:market-fetch`: Fetch market/trending data.
  - `tool:market-install`: Trigger the installation of a skill from a remote URL.

### 2.3 Frontend: `SkillSettings` Enhancement
- **UI Components**:
  - **Tabs**: "Installed" vs "Market".
  - **Search Bar**: Debounced input (400ms) to filter market skills.
  - **Skill Card**: Displaying Name, Repo Owner, Description, Install Count (if available), and an "Install" button.
  - **Loading States**: Visual feedback during fetching and installation.
- **Integration**:
  - Re-use the existing `ConflictDialog` for cases where a skill with the same name already exists.

## 3. Implementation Workflow

1.  **Phase 1: Market Service Logic (Main Process)**
    - Implement the leaderboard scraper for `skills.sh`.
    - Implement GitHub Search API integration.
    - Connect `installSkill` to the existing `SkillImportService.importSkill`.

2.  **Phase 2: IPC & Controller Wiring**
    - Add handlers in `ToolController` for market-related events.
    - Expose via `preload.ts`.

3.  **Phase 3: UI Implementation (Renderer Process)**
    - Refactor `SkillSettings.tsx` to support Tab switching.
    - Build the `MarketTab` view with skill cards.
    - Implement the installation flow and success/error notifications.

## 4. Key Considerations

- **Caching**: Leaderboard data should be cached in memory for ~30 minutes.
- **Rate Limiting**: GitHub API requests should be minimized.
- **Security**: Validate repository URLs before downloading content.
- **User Experience**: Automatically refresh the "Installed" list after a successful market installation.
