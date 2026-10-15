# AI plan lifecycle and application

See the [MVP data model](data-model.md) for table definitions, relationships, constraints, indexes, and deletion rules.

These rules define the intended MVP workflow for `ai_plan` and `ai_plan_item`; they do not imply that the planning service or worker is implemented. Generation produces suggestions for review. Only an explicit, authorized apply action creates project tasks.

## Lifecycle states and transitions

| Status | Meaning and field invariants | Allowed next status |
| --- | --- | --- |
| `queued` | The request is persisted and awaiting generation. Generation timestamps, error fields, and `applied_at` are null; no items exist yet. | `generating`, or `failed` if dispatch cannot be recovered. |
| `generating` | A worker has claimed the plan. `generation_started_at` is set; `generation_completed_at`, error fields, and `applied_at` remain null. | `ready` or `failed`. |
| `ready` | The complete, validated set of suggestions is persisted. Both generation timestamps are set, error fields are null, and `applied_at` is null. Items can be reviewed. | `applied`. |
| `failed` | Dispatch or generation failed. Record `error_code` and a safe `error_message`; `generation_completed_at` and `applied_at` are null. Keep `generation_started_at` if generation began. No partial items are retained. | None; a new generation request creates a new plan. |
| `applied` | All included suggestions were converted to tasks in one committed transaction. Preserve generation timestamps and set `applied_at`; error fields remain null. | None. |

Set `created_at` and `updated_at` on creation and update `updated_at` on every state change. `generation_completed_at` records successful generation, not failure time; the current model has no dedicated failure timestamp. Only `applied` plans have a non-null `applied_at`. Enforce these row-level invariants with database checks where possible and enforce transitions through conditional updates or row locks in the service and worker.

Failed and applied plans are terminal in the MVP. Retrying a failed generation or requesting a replacement for a ready plan creates a new `ai_plan` with a new ID and leaves the previous plan unchanged. There is no partial-application, cancellation, or regeneration-in-place status in this model; deletion follows the [deletion and retention rules](data-model.md#deletion-and-retention-rules).

## Generation and failure handling

1. Authorize the request against the current organization membership and target project. Validate a non-empty brief, then persist a `queued` plan with server-derived ownership and requester identity. Preserve the original brief for that plan.
2. After the database commit, dispatch a BullMQ job carrying the plan and organization IDs. Use a stable job identity for that plan and make dispatch retryable. Database insertion and queue publication are separate operations: provide reconciliation for committed plans whose enqueue failed so they do not remain queued indefinitely.
3. Claim the plan atomically with a tenant-scoped `queued` to `generating` transition, setting `generation_started_at`. Only the worker that wins the claim may generate for that plan. Duplicate deliveries must not start another generation for a plan already in `generating`, `ready`, `failed`, or `applied`.
4. Call the model outside the database transaction and record the model used in `model` when known. Validate the full response before storing suggestions, including non-empty titles of at most 255 characters, allowed priorities, valid nullable dates, and non-negative positions. Model output must not supply ownership, creator IDs, or task references.
5. In one transaction, recheck the plan and its parents, require that the plan is still `generating`, insert all validated items, and transition to `ready` with `generation_completed_at`. New items inherit the plan's organization, start with `is_included = TRUE` and `created_task_id = NULL`, and receive creation and update timestamps. Reject empty or invalid output as generation failure; do not publish a partial plan.
6. On unrecoverable generation failure, transition from `generating` to `failed` and record a bounded, user-safe error code and message without credentials or raw provider payloads. A watchdog must resolve abandoned generation after a defined timeout by conditionally marking it failed. A late worker result must recheck status and discard its output if the plan is no longer generating or has been deleted.

The MVP does not reclaim a generating plan or reset a failed plan to queued. Queue redelivery alone therefore does not recover a crashed generation: timeout recovery marks that plan failed, and another generation uses a new plan ID. Any future retry-in-place design needs an attempt identifier or equivalent fencing mechanism so an older worker cannot overwrite a newer attempt. Set dispatch retry limits and generation timeouts in worker configuration before enabling this flow.

## Reviewing plan items

Only a `ready` plan permits item edits, reordering, exclusion, or individual deletion. Authorized reviewers may change `title`, `description`, `priority`, `due_date`, `position`, and `is_included`; ownership, parent IDs, and `created_task_id` remain server-controlled. Validate edits against task constraints, including the task title's 255-character limit even though the suggestion's title column is `text`.

Read items in `position, id` order. Excluding an item preserves it for review but prevents task creation. Serialize every item mutation with application by locking the parent plan first and rechecking its status; locking only existing item rows does not prevent concurrent insertion or deletion. Update the changed item's `updated_at` and the parent plan's `updated_at` for review mutations.

Applied suggestions are retained as the reviewed source of the created tasks. Later task edits do not update suggestions, and suggestions cannot modify already-created tasks. Task deletion may clear `created_task_id` through the deletion workflow without reopening the plan.

## Applying a reviewed plan

Authorize the caller's current membership and permission to create tasks in the plan's project. Perform the following database work in one transaction, using a consistent lock order across review, task ordering, application, and deletion workflows:

1. Load and lock the tenant-scoped plan and coordinate access to its project. If it is already `applied`, return the existing application result, including surviving linked tasks, without making changes. Otherwise require `status = 'ready'`; reject queued, generating, and failed plans.
2. Read the current items in `position, id` order under the parent-plan lock. Require at least one included item and revalidate all included items. If none are included, leave the plan ready and return a validation error. In a ready plan, every `created_task_id` must be null; an unexpected reference is an integrity error, not permission to apply only the remaining items.
3. Create one task per included item using the mapping below. Allocate positions at the end of the project's `todo` column, preserving suggestion order and coordinating with other task creation and reorder operations in that column.
4. Set each included item's `created_task_id` to its new task ID and update its `updated_at`. Excluded items keep null task references. Set the plan's status to `applied`, populate `applied_at`, and update `updated_at` in the same transaction.
5. Commit before reporting success or invalidating caches. If any validation or database operation fails, roll back all task inserts, item links, and plan changes. An application failure leaves the plan `ready`; `failed` describes dispatch or generation failure.

| Task field | Value on application |
| --- | --- |
| `id` | New server-generated UUID. |
| `organization_id`, `project_id` | The plan's organization and project, validated within the authorized context. |
| `title`, `description`, `priority`, `due_date` | The reviewed values from the included item. |
| `status` | `todo`. |
| `assignee_member_id` | Null; the current plan-item model does not include assignment. |
| `position` | A position allocated in the project's `todo` column; do not copy the plan item's position directly. |
| `created_by_user_id` | The authenticated user applying the plan, who may differ from the plan requester. |
| `created_at`, `updated_at` | The application transaction's timestamp. |

The locked plan status and atomic transaction make application idempotent per plan ID. Concurrent requests and retries after a lost response must return the committed result without creating additional tasks. The unique constraint on `created_task_id` prevents two items from referencing one task; it does not independently prevent duplicate task creation. If a generated task is later deleted, retries return the surviving links and preserve `applied` and `applied_at`, even if every link is now null.

Different plans are independent: applying a replacement plan can create tasks similar to those from an earlier plan. The MVP does not deduplicate suggestions across plans. The current model records the requester on the plan and the applying user on created tasks; it has no separate `applied_by_user_id` or item revision history.
