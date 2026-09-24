# SereneSet

SereneSet is an AI-integrated project management platform inspired by Asana and ClickUp, helping organisations and teams organise tasks, collaborate effectively, and keep projects on track.

## Core Features

- **Projects and tasks:** Organise work into projects, tasks, and subtasks with assignees, priorities, and due dates

- **Flexible views:** Switch between list, Kanban board, and calendar views

- **Team collaboration:** Discuss tasks through comments, @mentions, and shared attachments

- **AI project planning:** Turn a project brief into suggested tasks, milestones, and timelines for the team to review

- **AI progress summaries:** Generate project updates highlighting completed work, upcoming deadlines, and blockers

- **AI project assistant:** Ask questions about projects, find relevant tasks and updates, and get suggested next steps through a conversational AI assistant

- **Project dashboards:** Monitor progress, overdue work, and team workload

- **Notifications and reminders:** Keep people informed about assignments, mentions, and approaching deadlines

- **Workspaces and permissions:** Organise teams and control access for members and guests

## MVP Scope

The MVP will let a small team create a workspace, plan a project, assign tasks, and track progress together, with AI helping turn a project brief into an actionable task list.

### Included

- **Accounts and workspaces:** Sign-up/sign-in, create a workspace, invite members, and manage basic admin and member roles

- **Projects and tasks:** Create projects with a name and description, and tasks with a description, assignee, priority, due date, and status

- **List and Kanban views:** View tasks in a list or move them between To do, In progress, and Done columns on a Kanban board

- **Task comments:** Discuss work directly within each task

- **AI project planning:** Generate suggested tasks from a project brief, then review and edit suggestions before adding them to the project

- **Basic progress tracking:** Show completed, remaining, and overdue task counts for each project

### Deferred

- Subtasks, dependencies, and milestones

- Calendar view and workload dashboards

- @mentions, attachments, and automated notifications

- AI progress summaries and the conversational AI assistant

- Guest access and granular permissions

- Third-party integrations

### Success Criteria

A team can go from a project brief to an agreed task list, assign the work, and track it through completion in SereneSet.

## Tech Stack

| Layer | Technology |
|---|---|
| Repo | pnpm + Turborepo monorepo |
| Frontend | Next.js (App Router) + React + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| API | NestJS (Fastify adapter), REST + OpenAPI |
| Client data | TanStack Query |
| Kanban drag and drop | dnd-kit |
| Validation | Zod, with schemas shared between web and API |
| Database | PostgreSQL (Neon or AWS RDS) + Drizzle ORM |
| Auth | Better Auth with its organization plugin |
| Jobs and cache | Redis + BullMQ |
| AI | OpenAI API + Claude API |
| Email | Resend |
| CI/CD | GitHub Actions |
| Testing and quality | Vitest, Testcontainers, Playwright |
| Observability | Sentry, Pino, OpenTelemetry, Grafana Cloud, Langfuse |
| Product analytics | PostHog |
| Hosting | Vercel (web) + Docker container on Railway, Render, or AWS ECS (API) |
