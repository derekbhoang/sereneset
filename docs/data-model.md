# SereneSet — MVP Data Model

SereneSet's MVP data model contains 12 tables: seven managed by Better Auth and five managed by the application.

## Contents

- [Table overview](#table-overview)
- [Conventions](#conventions)
- [Field definitions](#field-definitions)
  - [Authentication and organization tables](#authentication-and-organization-tables)
  - [Application tables](#application-tables)
- [Relationships and integrity rules](#relationships-and-integrity-rules)
  - [Relationships](#relationships)
  - [Tenant isolation and integrity constraints](#tenant-isolation-and-integrity-constraints)
- [Indexes and query patterns](#indexes-and-query-patterns)
  - [Constraint-backed indexes](#constraint-backed-indexes)
  - [Authentication and workspace queries](#authentication-and-workspace-queries)
  - [Application queries](#application-queries)
  - [Pagination and index maintenance](#pagination-and-index-maintenance)
- [Deletion and retention rules](#deletion-and-retention-rules)
  - [Deletion behavior](#deletion-behavior)
  - [Retention and cleanup](#retention-and-cleanup)
- [AI plan lifecycle and application](ai-planning.md)

## Table overview

### Better Auth (7 tables)

| Table | Managed by | Purpose |
| --- | --- | --- |
| [`user`](#user) | Better Auth (Core) | Stores and manages the identity and basic profile information of each registered user across SereneSet, independently of any organization. |
| [`session`](#session) | Better Auth (Core) | Manages authenticated user sessions, including login persistence, session security, expiration, and active organization context. |
| [`account`](#account) | Better Auth (Core) | Stores the authentication methods and credentials linked to a user, enabling sign-in through email/password or OAuth providers (e.g., Google, GitHub). |
| [`verification`](#verification) | Better Auth (Core) | Stores temporary verification tokens or codes used to validate user identity and complete authentication flows, such as email verification, password resets, and one-time passwords (OTPs). |
| [`organization`](#organization) | Better Auth (Organization plugin) | Represents a tenant (workspace), serving as the root entity for tenant-specific data ownership, membership, access control, and isolation. |
| [`member`](#member) | Better Auth (Organization plugin) | Connects users to organizations (tenants), defines their roles, and establishes which workspaces they are authorized to access. |
| [`invitation`](#invitation) | Better Auth (Organization plugin) | Manages invitations for users to join an organization (workspace) before they become members. |

### SereneSet application (5 tables)

| Table | Managed by | Purpose |
| --- | --- | --- |
| [`project`](#project) | ProjectsModule | Stores organization-owned projects that group related tasks, support team collaboration, and enable progress tracking and AI-assisted project planning. |
| [`task`](#task) | TasksModule | Stores project work items, including assignments, priorities, deadlines, statuses, and Kanban ordering, while enforcing organization-level tenant isolation. |
| [`task_comment`](#task_comment) | CommentsModule | Stores task-specific discussions and updates, enabling team collaboration while maintaining comment authorship, history, and tenant isolation. |
| [`ai_plan`](#ai_plan) | AiPlanningModule + worker | Manages the lifecycle of AI-generated project plans, from receiving a project brief to generating, reviewing, and applying suggested tasks to a project. |
| [`ai_plan_item`](#ai_plan_item) | AiPlanningModule | Stores individual AI-generated task suggestions that users can review, edit, and approve before adding them as actual project tasks. |

## Conventions

- Field names are preserved as defined: Better Auth fields use camelCase; application fields use snake_case.
- PostgreSQL types are shown in lowercase. `enum` indicates an enumerated type; database type names are not specified here.
- `PK` means primary key, `FK` means foreign key, and `UNIQUE` means values must be unique.
- `NOT NULL` marks a required field; `NULLABLE` marks an optional field. Primary keys are always required.
- `DEFAULT` specifies the value used when a field is omitted on insertion.

## Field definitions

### Authentication and organization tables

#### `user`

| Field | PostgreSQL type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `text` | PK | Unique user identifier. |
| `name` | `text` | NOT NULL | User's display name. |
| `email` | `text` | UNIQUE, NOT NULL | User's email address. |
| `emailVerified` | `boolean` | NOT NULL, DEFAULT FALSE | Whether the user's email is verified. |
| `image` | `text` | NULLABLE | User's profile picture URL. |
| `createdAt` | `timestamptz` | NOT NULL | Account creation timestamp. |
| `updatedAt` | `timestamptz` | NOT NULL | Last profile update timestamp. |

#### `session`

| Field | PostgreSQL type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `text` | PK | Unique session identifier. |
| `userId` | `text` | FK → `user.id`, NOT NULL | User associated with the session. |
| `token` | `text` | UNIQUE, NOT NULL | Unique session token. |
| `expiresAt` | `timestamptz` | NOT NULL | Session expiration timestamp. |
| `ipAddress` | `text` | NULLABLE | Client IP address. |
| `userAgent` | `text` | NULLABLE | Browser or device information. |
| `activeOrganizationId` | `text` | NULLABLE | Currently selected organization/workspace. |
| `createdAt` | `timestamptz` | NOT NULL | Session creation timestamp. |
| `updatedAt` | `timestamptz` | NOT NULL | Last session update timestamp. |

#### `account`

| Field | PostgreSQL type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `text` | PK, NOT NULL | Unique identifier for the authentication account record. |
| `userId` | `text` | FK → `user.id`, NOT NULL | Identifies the user who owns this authentication account. |
| `accountId` | `text` | NOT NULL | Account identifier provided by the authentication provider. |
| `providerId` | `text` | NOT NULL | Authentication provider identifier, such as `credential`, `google`, or `github`. |
| `accessToken` | `text` | NULLABLE | OAuth access token used to access provider resources. |
| `refreshToken` | `text` | NULLABLE | OAuth refresh token used to obtain new access tokens. |
| `accessTokenExpiresAt` | `timestamptz` | NULLABLE | Expiration timestamp of the OAuth access token. |
| `refreshTokenExpiresAt` | `timestamptz` | NULLABLE | Expiration timestamp of the OAuth refresh token. |
| `scope` | `text` | NULLABLE | OAuth permissions granted by the authentication provider. |
| `idToken` | `text` | NULLABLE | OpenID Connect ID token returned by the authentication provider. |
| `password` | `text` | NULLABLE | Hashed password for email/password authentication accounts. |
| `createdAt` | `timestamptz` | NOT NULL | Timestamp when the authentication account was created. |
| `updatedAt` | `timestamptz` | NOT NULL | Timestamp when the authentication account was last updated. |

#### `verification`

| Field | PostgreSQL type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `text` | PK, NOT NULL | Unique identifier for the verification record. |
| `identifier` | `text` | NOT NULL | Identifier associated with the verification request, such as an email address. |
| `value` | `text` | NOT NULL | Verification token or value used to complete the verification process. |
| `expiresAt` | `timestamptz` | NOT NULL | Date and time when the verification token expires. |
| `createdAt` | `timestamptz` | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Date and time when the verification record was created. |
| `updatedAt` | `timestamptz` | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Date and time when the verification record was last updated. |

#### `organization`

| Field | PostgreSQL type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `text` | PK, NOT NULL | Unique identifier for the organization (workspace). |
| `name` | `text` | NOT NULL | Display name of the organization. |
| `slug` | `text` | UNIQUE, NOT NULL | Unique URL-friendly identifier for the organization. |
| `logo` | `text` | NULLABLE | URL of the organization's logo. |
| `metadata` | `text` | NULLABLE | Optional serialized metadata associated with the organization. |
| `createdAt` | `timestamptz` | NOT NULL | Timestamp when the organization was created. |

#### `member`

| Field | PostgreSQL type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `text` | PK, NOT NULL | Unique identifier for the organization membership. |
| `userId` | `text` | FK → `user.id`, NOT NULL | References the user associated with the membership. |
| `organizationId` | `text` | FK → `organization.id`, NOT NULL | References the organization to which the user belongs. |
| `role` | `text` | NOT NULL, DEFAULT `'member'` | Defines the user's role within the organization (`owner`, `admin`, or `member`). |
| `createdAt` | `timestamptz` | NOT NULL | Timestamp indicating when the membership was created. |

#### `invitation`

| Field | PostgreSQL type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `text` | PK, NOT NULL | Unique identifier for the invitation. |
| `email` | `text` | NOT NULL | Email address of the invited user. |
| `inviterId` | `text` | FK → `user.id`, NOT NULL | User who sent the invitation. |
| `organizationId` | `text` | FK → `organization.id`, NOT NULL | Organization (workspace) the user is invited to join. |
| `role` | `text` | NULLABLE | Organization role assigned to the invited user (`owner`, `admin`, `member`). |
| `status` | `text` | NOT NULL, DEFAULT `'pending'` | Current invitation status (`pending`, `accepted`, `rejected`, `canceled`). |
| `createdAt` | `timestamptz` | NOT NULL, DEFAULT `now()` | Timestamp when the invitation was created. |
| `expiresAt` | `timestamptz` | NOT NULL | Timestamp when the invitation expires. |

### Application tables

#### `project`

| Field | PostgreSQL type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `uuid` | PK, NOT NULL | Unique project identifier. |
| `organization_id` | `text` | FK, NOT NULL | Organization (tenant) that owns the project. |
| `name` | `varchar(255)` | NOT NULL | Project name. |
| `description` | `text` | NULLABLE | Project description and details. |
| `created_by_user_id` | `text` | FK, NOT NULL | User who created the project. |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | Creation timestamp. |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | Last modification timestamp. |

#### `task`

| Field | PostgreSQL type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `uuid` | PK | Unique task identifier. |
| `organization_id` | `text` | FK, NOT NULL | Organization that owns the task; supports tenant isolation. |
| `project_id` | `uuid` | FK, NOT NULL | Project containing the task. |
| `title` | `varchar(255)` | NOT NULL | Task title. |
| `description` | `text` | NULLABLE | Detailed task description. |
| `status` | `text` | NOT NULL, DEFAULT `'todo'` | Current workflow status. |
| `priority` | `text` | NOT NULL, DEFAULT `'medium'` | Task priority. |
| `assignee_member_id` | `text` | FK, NULLABLE | Organization member assigned to the task. |
| `due_date` | `date` | NULLABLE | Task deadline. |
| `position` | `integer` | NOT NULL, DEFAULT `0` | Ordering within the Kanban column. |
| `created_by_user_id` | `text` | FK, NOT NULL | User who created the task. |
| `created_at` | `timestamptz` | NOT NULL | Task creation timestamp. |
| `updated_at` | `timestamptz` | NOT NULL | Last modification timestamp. |

#### `task_comment`

| Field | PostgreSQL type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `uuid` | PK, NOT NULL | Unique comment identifier. |
| `organization_id` | `text` | FK, NOT NULL | Tenant identifier for isolation. |
| `task_id` | `uuid` | FK, NOT NULL | Task receiving the comment. |
| `author_user_id` | `text` | FK, NOT NULL | User who created the comment. |
| `body` | `text` | NOT NULL | Comment content. |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | Creation timestamp. |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | Last modification timestamp. |
| `deleted_at` | `timestamptz` | NULLABLE | Supports soft deletion without immediately removing the comment. |

#### `ai_plan`

| Field | PostgreSQL type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `uuid` | PK | Unique identifier for the AI plan. |
| `organization_id` | `text` | FK, NOT NULL | Organization that owns the plan, ensuring tenant isolation. |
| `project_id` | `uuid` | FK, NOT NULL | Project for which the plan is generated. |
| `created_by_user_id` | `text` | FK, NOT NULL | User who requested the AI plan. |
| `brief` | `text` | NOT NULL | Original project brief provided by the user. |
| `status` | `enum` | NOT NULL | Current lifecycle status: queued, generating, ready, failed, or applied. |
| `model` | `text` | NULLABLE | AI model used to generate the plan. |
| `error_code` | `text` | NULLABLE | Failure code if generation fails |
| `error_message` | `text` | NULLABLE | Error details if generation fails. |
| `generation_started_at` | `timestamptz` | NULLABLE | Time the worker started generating the plan. |
| `generation_completed_at` | `timestamptz` | NULLABLE | Time AI generation completed successfully. |
| `applied_at` | `timestamptz` | NULLABLE | Time the reviewed plan was fully applied to the project. |
| `created_at` | `timestamptz` | NOT NULL | Time the plan record was created. |
| `updated_at` | `timestamptz` | NOT NULL | Time the plan record was last updated. |

#### `ai_plan_item`

| Field | PostgreSQL type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | `uuid` | PK, NOT NULL | Unique identifier. |
| `organization_id` | `text` | FK, NOT NULL | Tenant identifier for isolation. |
| `ai_plan_id` | `uuid` | FK, NOT NULL | Parent AI plan. |
| `title` | `text` | NOT NULL | Suggested task title. |
| `description` | `text` | NULLABLE | Suggested task description. |
| `priority` | `enum` | NOT NULL, DEFAULT `'medium'` | `low`, `medium`, `high`. |
| `due_date` | `date` | NULLABLE | Suggested due date. |
| `position` | `integer` | NOT NULL | Display order of the suggestion within the AI plan. |
| `is_included` | `boolean` | NOT NULL, DEFAULT `TRUE` | Whether to include the suggestion when applying the plan. |
| `created_task_id` | `uuid` | FK, UNIQUE, NULLABLE | References the task created from this suggestion. |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | Record creation timestamp. |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | Last modification timestamp. |

## Relationships and integrity rules

### Relationships

The tables below identify each foreign key and its referenced field. For one-to-many relationships, a parent can have zero or more child records. Each child references exactly one parent unless the foreign key is nullable.

#### Authentication and organization relationships

| Parent | Child | Foreign key | Cardinality and meaning |
| --- | --- | --- | --- |
| `user` | `session` | `session.userId` → `user.id` | One-to-many: a user can have multiple sessions. |
| `user` | `account` | `account.userId` → `user.id` | One-to-many: a user can have multiple linked authentication accounts. |
| `user` | `member` | `member.userId` → `user.id` | One-to-many: a user can hold memberships in multiple organizations. |
| `organization` | `member` | `member.organizationId` → `organization.id` | One-to-many: an organization can have multiple members. |
| `organization` | `invitation` | `invitation.organizationId` → `organization.id` | One-to-many: an organization can have multiple invitations. |
| `user` | `invitation` | `invitation.inviterId` → `user.id` | One-to-many: a user can send multiple invitations. |

Users and organizations have a many-to-many relationship through `member`. Each membership connects one user to one organization and records their role in that organization.

`session.activeOrganizationId` identifies the currently selected workspace, but is not declared as a foreign key in this model. It provides session context; access depends on the user's membership in that organization.

`verification` has no declared foreign key relationship. Its `identifier` identifies the verification subject. Similarly, `invitation.email` identifies the invitee without requiring an existing user record; `inviterId` references the sender.

#### Application relationships

| Parent | Child | Foreign key | Cardinality and meaning |
| --- | --- | --- | --- |
| `organization` | `project`, `task`, `task_comment`, `ai_plan`, `ai_plan_item` | Each child's `organization_id` → `organization.id` | One-to-many for each table: every application record belongs to one organization. |
| `project` | `task` | `task.project_id` → `project.id` | One-to-many: a project can contain multiple tasks. |
| `project` | `ai_plan` | `ai_plan.project_id` → `project.id` | One-to-many: a project can have multiple AI plans. |
| `task` | `task_comment` | `task_comment.task_id` → `task.id` | One-to-many: a task can have multiple comments. |
| `ai_plan` | `ai_plan_item` | `ai_plan_item.ai_plan_id` → `ai_plan.id` | One-to-many: an AI plan can contain multiple suggested tasks. |
| `member` | `task` | `task.assignee_member_id` → `member.id` | One-to-many: a membership can be assigned multiple tasks; each task has zero or one assignee. |
| `user` | `project`, `task`, `ai_plan` | Each child's `created_by_user_id` → `user.id` | One-to-many for each table: a user can create multiple projects, tasks, and AI plans. |
| `user` | `task_comment` | `task_comment.author_user_id` → `user.id` | One-to-many: a user can author multiple comments. |
| `task` | `ai_plan_item` | `ai_plan_item.created_task_id` → `task.id` | Optional one-to-one: an item references zero or one created task, and a task is referenced by at most one item because `created_task_id` is unique. |

Task assignment references `member` because it belongs to a specific organization membership. Creator and author fields reference the global `user` identity.

Each application's `organization_id` must match the organization of its linked parent: the project for tasks and AI plans, the task for comments, and the AI plan for plan items. A task's assignee must belong to the same organization. A plan item's created task must belong to the same project and organization as its AI plan. These consistency rules require enforcement beyond foreign keys that reference only `id`.

### Tenant isolation and integrity constraints

The following rules are implementation requirements for the MVP. The field definitions and relationships above describe the intended model; they do not establish that these checks or database constraints have been implemented.

#### Tenant access and ownership

- Treat `organization` as the tenant boundary. Every application row must have a non-null `organization_id` referencing `organization.id`.
- Resolve the active organization on the server and verify the authenticated user's current `member` record and permission for the requested action. `session.activeOrganizationId` selects a workspace; it does not grant access. Reject tenant operations when that context is missing or membership no longer exists.
- Scope every application read, update, and delete by the authorized `organization_id`, including lookups by ID, joins, counts, and bulk operations. Set ownership on inserts from the authorized context, and validate all supplied related IDs within that organization.
- Keep `organization_id` immutable after creation. Moving records between tenants is outside the MVP scope.
- Carry organization context into background jobs and cache keys. Workers must load plans and related records within that organization and validate their relationships before writing results; a queued job must not bypass tenant checks.

#### Database constraints for tenant relationships

An ID-only foreign key proves that the referenced row exists, but does not prove that both rows belong to the same organization. Use the following composite foreign keys to enforce that invariant on inserts and updates.

| Child columns | Referenced columns | Required invariant |
| --- | --- | --- |
| `task (organization_id, project_id)` | `project (organization_id, id)` | A task belongs to a project in the same organization. |
| `ai_plan (organization_id, project_id)` | `project (organization_id, id)` | An AI plan belongs to a project in the same organization. |
| `task_comment (organization_id, task_id)` | `task (organization_id, id)` | A comment belongs to a task in the same organization. |
| `ai_plan_item (organization_id, ai_plan_id)` | `ai_plan (organization_id, id)` | A plan item belongs to a plan in the same organization. |
| `task (organization_id, assignee_member_id)` | `member (organizationId, id)` | An assigned member belongs to the task's organization. |
| `ai_plan_item (organization_id, created_task_id)` | `task (organization_id, id)` | A generated task belongs to the plan item's organization. |

Add matching `UNIQUE (organization_id, id)` constraints to `project`, `task`, and `ai_plan`, and `UNIQUE (organizationId, id)` to `member`, so these pairs can be referenced. Retain the direct organization foreign keys on all application tables. The nullable assignment and created-task references must allow an absent reference while keeping `organization_id` required; use the default composite foreign-key behavior (`MATCH SIMPLE`).

The created task must also belong to the AI plan's project. The composite foreign key above only enforces organization equality because `ai_plan_item` has no `project_id`. Enforce project equality with a database trigger or a transactional service check that locks the relevant rows, and apply the same rule to any later change to the task's or plan's project. An ordinary row-level `CHECK` constraint cannot enforce this cross-table relationship.

#### Membership and authorship

- Require `UNIQUE (organizationId, userId)` on `member` so a user has at most one membership per organization.
- Verify membership and permission when creating a project, task, plan, or comment. Populate creator and author IDs from the authenticated user. A foreign key to `user.id` establishes identity, but does not establish tenant membership.
- Preserve creator and author references when a user leaves an organization; they record historical attribution. Clear that membership's task assignments in the same transaction before deleting the membership, without clearing task ownership.
- Check the inviter's current membership and invitation permission when issuing an invitation. Accept an invitation only for the intended verified email, while it is pending and unexpired; create the membership and mark the invitation accepted atomically.

#### Value and lifecycle integrity

- Constrain `task.status` to `todo`, `in_progress`, or `done`, matching the shared task contract. Constrain both task and plan-item priorities to `low`, `medium`, or `high`. Use database enums or `CHECK` constraints in addition to request validation.
- Keep `task.position` and `ai_plan_item.position` non-negative. Positions are ordering values, not globally unique identifiers; task ordering is scoped to a project's status column, and plan-item ordering to its parent plan.
- Apply a reviewed AI plan in one transaction: lock the plan, require `status = 'ready'`, create tasks for included items in that plan's project and organization, record their `created_task_id` values, and set the plan to `applied` with `applied_at`. Serialize concurrent apply requests and make retries return the existing result without creating duplicate tasks. The unique constraint on `created_task_id` alone does not make application idempotent.
- Enforce AI plan lifecycle transitions in the service or worker. The status enum limits allowed values but does not validate transitions; an applied plan must have `applied_at`, and a plan in any other status must have no `applied_at`.
- Exclude comments with a non-null `deleted_at` from normal reads. Soft deletion retains the row's tenant ownership, author, and foreign-key constraints.
- Define foreign-key deletion actions explicitly in migrations according to the [deletion and retention rules](#deletion-and-retention-rules). Do not cascade-delete historical application records merely because a membership is removed.

## Indexes and query patterns

These are proposed indexes and query patterns for the MVP, not a record of implemented migrations. Use B-tree indexes unless stated otherwise. Column order below is significant: place tenant and parent equality filters before ordering or range columns. Indexes improve access paths; they do not enforce authorization or replace the [tenant isolation and integrity constraints](#tenant-isolation-and-integrity-constraints).

### Constraint-backed indexes

PostgreSQL creates indexes for primary keys and unique constraints. Reuse those indexes rather than adding identical ordinary indexes.

| Constraint | Supported lookup or invariant |
| --- | --- |
| Primary key on every table's `id` | Direct record lookup. Application queries must still include the authorized `organization_id`. |
| `user (email)`, `session (token)`, `organization (slug)` unique constraints | Find a user by email, authenticate a session by token, or resolve a workspace slug. |
| `member (organizationId, userId)` unique constraint | Check the current user's membership and list members within an organization. |
| `member (organizationId, id)` and `project`, `task`, `ai_plan (organization_id, id)` unique constraints | Support the composite tenant foreign keys and tenant-scoped record lookups. |
| `ai_plan_item (created_task_id)` unique constraint | Find the suggestion associated with a generated task and prevent multiple items from referencing that task. Multiple null references remain allowed. |

The composite unique constraints above are required by the integrity rules even though `id` is already globally unique. PostgreSQL does not automatically index the referencing side of a foreign key; provide appropriate child-table indexes for joins and deletion workflows.

### Authentication and workspace queries

Review Better Auth's generated schema and migrations before adding indexes to its tables. Preserve its field names and reuse equivalent indexes it already supplies; these proposals do not introduce additional authentication uniqueness rules. Quote camelCase column names when writing raw PostgreSQL SQL.

| Table | Proposed additional index | Query pattern |
| --- | --- | --- |
| `session` | `(userId)` | List or revoke a user's sessions and remove sessions during user deletion. |
| `session` | `(activeOrganizationId, userId)` | Clear active workspace context after organization deletion or membership removal. |
| `session` | `(expiresAt, id)` | Find expired sessions in bounded cleanup batches. |
| `account` | `(userId)`; `(providerId, accountId)` | List a user's authentication accounts or resolve an account by provider and provider-issued identifier. |
| `verification` | `(identifier)`; `(expiresAt, id)` | Find records using the authentication flow's identifier format or scan expired records for cleanup. |
| `member` | `(userId, organizationId)` | List the workspaces a user belongs to and find memberships during user deletion. The organization-first unique index serves the reverse access path. |
| `invitation` | `(organizationId, status, createdAt DESC, id DESC)` | List workspace invitations of a selected status, newest first. |
| `invitation` | `(email, status)` | Find pending invitations for the intended verified email, then check `expiresAt`. Use the same email matching convention as the authentication flow. |
| `invitation` | `(expiresAt, id)`; `(inviterId)` | Batch expired invitation cleanup or check sent invitations before user deletion. |

An index lookup does not establish that a session, verification record, or invitation is still valid. Recheck expiry, status, and permissions according to the relevant flow, including inside transactions that consume or accept records.

### Application queries

Every interactive application query uses the authorized `organization_id`, including lookups by globally unique IDs. Include tenant equality in joins as well as parent IDs. Workers carry the same organization context when loading or updating plans.

| Table | Proposed additional index | Query pattern |
| --- | --- | --- |
| `project` | `(organization_id, created_at DESC, id DESC)` | List workspace projects, newest first. |
| `task` | `(organization_id, project_id, status, position, id)` | Read a project's Kanban column with equality filters on organization, project, and status, ordered by `position, id`. Read the whole board ordered by `status, position, id`, then render columns in workflow order. The organization/project prefix also supports project task lists and progress counts. |
| `task` | `(organization_id, assignee_member_id)` | Filter a member's assigned tasks within a workspace and clear assignments before membership deletion. |
| `task_comment` | `(organization_id, task_id, created_at, id)` | Read a task's comments in chronological order with `deleted_at IS NULL`. Keep this index unfiltered so it also locates soft-deleted comments during parent deletion. |
| `ai_plan` | `(organization_id, project_id, created_at DESC, id DESC)` | List a project's plan history, newest first. Load an individual plan for generation or application by organization and ID using its composite unique index. |
| `ai_plan_item` | `(organization_id, ai_plan_id, position, id)` | Read suggestions in review order; filter `is_included = TRUE` when applying a plan. The same prefix locates all items during plan deletion. |

For basic project progress, aggregate tasks filtered by `organization_id` and `project_id`: completed means `status = 'done'`, remaining means `status <> 'done'`, and overdue means `status <> 'done' AND due_date < :today`. Resolve `:today` consistently using the application's chosen date boundary; null deadlines do not count as overdue. Start with the project prefix of the task index above. If deadline queries become costly, consider `(organization_id, project_id, due_date, id) WHERE status <> 'done' AND due_date IS NOT NULL`, with matching query predicates. Keep the moving date cutoff in the query, not in the index predicate.

Add ordinary indexes on `project.created_by_user_id`, `task.created_by_user_id`, `ai_plan.created_by_user_id`, and `task_comment.author_user_id` to support the user-deletion restriction checks. Tenant-first indexes do not provide the same leading-column access path for these global identity checks. The unique index on `ai_plan_item.created_task_id` already supports finding references that must be cleared before task deletion.

Use BullMQ to dispatch AI generation jobs; no database queue-polling index is required for that path. If a recovery job later scans queued or stalled plans, design an index around its actual status and timestamp predicates. Loading a plan quickly does not replace the transaction, row lock, and lifecycle checks required for generation or idempotent application.

### Pagination and index maintenance

- Bound list queries with a page size. Use keyset pagination for growing project, comment, and plan histories, with the same fields and directions in the cursor and `ORDER BY`. For newest-first projects, subsequent pages use `WHERE organization_id = :organization_id AND (created_at, id) < (:cursor_created_at, :cursor_id) ORDER BY created_at DESC, id DESC LIMIT :page_size`; omit the cursor predicate on the first page. Chronological comment pages use `>` with ascending ordering and retain `deleted_at IS NULL`.
- Include `id` as a deterministic tie-breaker for timestamps and positions. Positions are not unique; reorder operations must preserve project/column or plan scope. A cursor does not provide a snapshot across requests, so refresh affected board data after task moves.
- Reuse the leading columns of existing composite indexes before adding shorter duplicates. Do not add separate indexes for every status, priority, or boolean filter without evidence that the query needs them.
- Keep cleanup scans bounded and ordered by expiry and ID, then recheck eligibility when deleting. Administrative cross-tenant cleanup is a separate access path from interactive tenant queries and must follow the retention rules below.
- Validate proposed indexes with `EXPLAIN (ANALYZE, BUFFERS)` on representative data in a safe test environment, including large workspaces and soft-deleted comments. Measure read benefits against index storage and write costs, especially when changing task positions. Add specialized or partial indexes only when measured query plans justify them.

## Deletion and retention rules

These rules define the intended MVP behavior and must be implemented in migrations, services, and cleanup jobs. They do not imply that deletion workflows or retention jobs already exist. Only `task_comment` supports soft deletion in the current model; other deletions remove rows permanently from the primary database.

### Deletion behavior

Authorize tenant-data deletion against the current organization membership and the permission required for that action. Authorize global user, session, and authentication-account deletion through the authentication service. Perform related database changes in one transaction, preserving organization boundaries. Database cascades enforce ownership relationships; they do not replace authorization.

| Deleted entity | Required behavior |
| --- | --- |
| `organization` | Require owner permission. Hard-delete its memberships, invitations, projects, tasks, comments (including soft-deleted comments), AI plans, and plan items. Preserve global users and authentication accounts, including their access to other organizations. Clear `session.activeOrganizationId` wherever it references the deleted organization. |
| `project` | Hard-delete its tasks, their comments, its AI plans, and their plan items. |
| `task` | Hard-delete its comments, including soft-deleted comments. Clear any referencing `ai_plan_item.created_task_id`; preserve the plan and suggestion. |
| `task_comment` | For an ordinary comment deletion, set `deleted_at` and update `updated_at`. Exclude the comment and its body from normal reads, search, and AI context. Retain the row and body until an explicit purge or deletion of its task, project, or organization. |
| `ai_plan` | Hard-delete its plan items. Preserve tasks already created from the plan; those tasks belong to the project independently of the plan. |
| `ai_plan_item` | Hard-delete the suggestion only. Preserve any task referenced by `created_task_id`. Do not allow item edits or individual deletion after its plan is applied; remove an applied plan through the whole-plan deletion workflow. |
| `member` | Clear that membership's task assignments before deleting it. Preserve projects, tasks, comments, AI plans, and their creator or author references. Clear the removed user's active organization context for that organization and reject subsequent access. |
| `invitation` | Cancellation changes `status` to `canceled` and immediately prevents acceptance. Later hard deletion removes only the invitation; deleting an accepted invitation does not remove the membership it created. |
| `user` | Restrict hard deletion while any project, task, AI plan, comment (including a soft-deleted comment), or sent invitation references the user. Membership removal is not user deletion. If deletion is otherwise allowed, remove the user's sessions, authentication accounts, and memberships, clearing task assignments first. Do not delete organization-owned content to make user deletion succeed. |

Prevent removal or deletion of the last owner of an organization that will remain active. Transfer ownership first, or delete the organization through its authorized workflow. Apply this check to membership removal, role changes, and user deletion, and serialize concurrent ownership changes so they cannot leave the organization without an owner.

Use these foreign-key actions to support the workflows:

| Relationship | Deletion action |
| --- | --- |
| `organization` to `member`, `invitation`, and every application table | `ON DELETE CASCADE`. |
| `project` to `task` and `ai_plan`; `task` to `task_comment`; `ai_plan` to `ai_plan_item` | `ON DELETE CASCADE`, including the composite tenant foreign keys. |
| `user` to `session`, `account`, and `member` | `ON DELETE CASCADE`, after service checks and assignment cleanup. |
| `user` to application creator/author fields and `invitation.inviterId` | `ON DELETE RESTRICT` to preserve required attribution. |
| `member` to `task.assignee_member_id`; `task` to `ai_plan_item.created_task_id` | Clear only the nullable reference before deleting the parent, and use `ON DELETE RESTRICT` as a database guard. Never clear `organization_id`. |

For organization or project deletion, clear created-task references before the cascade reaches tasks; for organization or user deletion, clear affected task assignments before memberships are removed. Apply these steps in the same transaction. An unqualified `SET NULL` on a composite tenant foreign key would also attempt to clear the required `organization_id`, so it must not be used for these relationships.

Deleting a generated task must not make an applied plan eligible for reapplication: preserve the plan's `applied` status and `applied_at`, even when an item's `created_task_id` becomes null. Return the surviving result on apply retries without recreating deleted tasks.

Coordinate plan, project, and organization deletion with AI workers. Cancel queued work where possible, invalidate related caches, and require workers to recheck the plan and its parents before committing results. Serialize deletion with generation and apply transactions; a late worker result must never recreate deleted records. Cache and queue cleanup must be retryable after the database transaction commits.

### Retention and cleanup

| Data | Retention rule |
| --- | --- |
| Projects, tasks, and active comments | Retain until explicitly deleted or their owning parent is deleted. Completing a task does not delete it or start a retention timer. |
| Soft-deleted comments | Retain until explicit purge or parent deletion. The MVP has no automatic purge interval or restore workflow defined; soft deletion hides content but does not erase it. |
| AI plans and plan items | Retain until explicitly deleted or their project or organization is deleted, including failed and applied plans. No age-based cleanup period is defined. |
| Sessions and verification records | Reject expired records immediately based on `expiresAt`, independently of cleanup timing. Remove expired records through scheduled cleanup and remove consumed verification records when their flow completes. Revoke sessions immediately when requested. |
| Invitations | Reject acceptance once canceled, rejected, accepted, or expired. Retain until `expiresAt`, then allow scheduled hard deletion regardless of status; retain the resulting membership independently. |
| Authentication accounts | Retain while linked to an existing user. Remove credentials and stored provider tokens when the account is unlinked or the user is deleted, subject to the user-deletion restrictions above. |

`verification.identifier` and `invitation.email` are not user foreign keys. A user-deletion workflow must explicitly invalidate and remove verification records associated with the deleted identity and pending invitations addressed to its verified email; cascades alone cannot perform this cleanup. Match verification records according to their authentication flow's identifier format, not by assuming every identifier is a raw email address.

Cleanup jobs must be idempotent, operate in bounded batches, and recheck expiry or deletion eligibility when deleting rows. Serialize invitation cleanup with acceptance so an expired or removed invitation cannot create a membership. Cleanup must preserve tenant boundaries and the same foreign-key rules as interactive deletion.

Before production, define the cleanup schedule, any automatic purge periods for comments and AI plans, and retention periods for backups, logs, caches, queue payloads, and external AI or observability systems. Primary-database deletion does not establish erasure from those systems. Document when retained copies expire and how deletions are reapplied after a backup restore. Full user erasure while retaining historical attribution requires a separate anonymization or schema design; the current required user references do not support it.
