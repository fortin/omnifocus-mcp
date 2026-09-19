"""OmniFocus MCP server."""

from __future__ import annotations

import json
from typing import Annotated, Any, Literal

from mcp.server import MCPServer
from mcp.types import ImageContent, TextContent, ToolAnnotations
from pydantic import Field

from omnifocus_mcp import __version__
from omnifocus_mcp.bridge import OmniFocusClient
from omnifocus_mcp.confirm import ConfirmStore
from omnifocus_mcp.dates import validate_date
from omnifocus_mcp.errors import OmniFocusError

READ = ToolAnnotations(
    read_only_hint=True,
    destructive_hint=False,
    idempotent_hint=True,
    open_world_hint=False,
)
WRITE = ToolAnnotations(
    read_only_hint=False,
    destructive_hint=False,
    idempotent_hint=False,
    open_world_hint=False,
)
DESTROY = ToolAnnotations(
    read_only_hint=False,
    destructive_hint=True,
    idempotent_hint=True,
    open_world_hint=False,
)

INSTRUCTIONS = """\
You are connected to the user's local OmniFocus database on this Mac.

How to use this server:
- Read with query_tasks, count_tasks, query_projects, query_folders, query_tags, query_perspectives.
- Start with omnifocus_status or count_tasks before listing. Never scan the whole database.
- Default compact output and the default limit. Raise the limit only when the user needs more.
- After the first lookup, use stable ids. Duplicate names are rejected until you pass an id.
- A perspective is a saved view (Inbox, Flagged, Forecast, or a custom perspective). A tag is a label on a task. Do not confuse them.
- Look first, then change. remove_items and folder deletion return a preview plus confirmToken; call again with that token to execute.
- Dates: YYYY-MM-DD (local midnight) or ISO-8601 datetime. Timezone offsets are converted to local wall-clock time so the day never drifts.
- Custom perspectives require OmniFocus Pro and an open OmniFocus window. The previous window perspective is always restored.
- If a write goes wrong, call omnifocus_session action=undo immediately.
- Prefer query_tasks source=forecast/flagged/available/inbox for daily planning, not ad-hoc dumps.
"""

mcp = MCPServer(
    name="omnifocus",
    title="OmniFocus",
    version=__version__,
    instructions=INSTRUCTIONS,
)

_client: OmniFocusClient | None = None
_confirms = ConfirmStore()


def get_client() -> OmniFocusClient:
    global _client
    if _client is None:
        _client = OmniFocusClient()
    return _client


def set_client(client: OmniFocusClient | None) -> None:
    global _client
    _client = client


def _payload(**values: Any) -> dict[str, Any]:
    return {key: value for key, value in values.items() if value is not None}


def _run(op: str, **values: Any) -> dict[str, Any]:
    try:
        return {"ok": True, "data": get_client().call(op, **_payload(**values))}
    except OmniFocusError as exc:
        return exc.to_dict()


def _validate_dates(**values: str | None) -> dict[str, Any] | None:
    try:
        for name, value in values.items():
            validate_date(value, name)
    except OmniFocusError as exc:
        return exc.to_dict()
    return None


# --- reads ---


@mcp.tool(title="OmniFocus status", annotations=READ)
def omnifocus_status(
    launch: Annotated[bool, Field(description="If true, try to bring OmniFocus forward.")] = False,
) -> dict[str, Any]:
    """Health check for OmniFocus: running state, Pro vs Standard, undo availability, and headline counts.

    Use this first when a session starts or a call fails. It never dumps tasks.
    """
    return _run("status", launch=launch)


@mcp.tool(title="Query tasks", annotations=READ)
def query_tasks(
    source: Annotated[
        Literal[
            "filter",
            "inbox",
            "flagged",
            "forecast",
            "available",
            "overdue",
            "completed_today",
            "tag",
            "project",
            "custom",
            "search",
            "id",
        ],
        Field(description="Which task view to read. filter/search use the extra filters below."),
    ] = "filter",
    output: Annotated[Literal["compact", "detailed", "ids"], Field(description="compact omits notes and full tag paths.")] = "compact",
    limit: Annotated[int, Field(ge=1, le=200, description="Page size. Default 50.")] = 50,
    cursor: Annotated[str | None, Field(description="nextCursor from a previous page.")] = None,
    sort_by: Annotated[
        Literal["library", "dueDate", "deferDate", "plannedDate", "name", "flagged", "estimatedMinutes"] | None,
        Field(description="Sort key. library keeps OmniFocus order."),
    ] = None,
    hide_completed: Annotated[bool, Field(description="Hide completed and dropped tasks. Forced off for completed_today.")] = True,
    show_subtasks: Annotated[bool, Field(description="Nest matching tasks into a JSON tree.")] = False,
    max_subtask_depth: Annotated[int | None, Field(ge=0, le=8)] = None,
    search: Annotated[str | None, Field(description="Case-insensitive substring in name or note.")] = None,
    task_id: Annotated[str | None, Field(description="Stable task id. Use with source=id.")] = None,
    task_name: Annotated[str | None, Field(description="Task name. Fails if the name is ambiguous.")] = None,
    project_id: Annotated[str | None, Field(description="Only tasks in this project.")] = None,
    project_name: Annotated[str | None, Field(description="Only tasks in this project name.")] = None,
    folder_id: Annotated[str | None, Field(description="Only tasks in projects inside this folder.")] = None,
    tag_id: Annotated[str | None, Field(description="Tag id. Use with source=tag or as a filter.")] = None,
    tag_name: Annotated[str | None, Field(description="Tag name. This is a tag, not a perspective.")] = None,
    tag_ids: Annotated[list[str] | None, Field(description="Match tasks that have any of these tag ids.")] = None,
    tag_names: Annotated[list[str] | None, Field(description="Match tasks that have any of these tag names.")] = None,
    exact_match: Annotated[bool, Field(description="For source=tag, require an exact tag name.")] = True,
    perspective_name: Annotated[str | None, Field(description="Custom or built-in perspective name. Use with source=custom.")] = None,
    perspective_id: Annotated[str | None, Field(description="Custom perspective identifier.")] = None,
    task_status: Annotated[
        list[Literal["Available", "Next", "Blocked", "DueSoon", "Overdue", "Completed", "Dropped"]] | None,
        Field(description="Restrict to these OmniFocus task statuses."),
    ] = None,
    flagged: Annotated[bool | None, Field(description="If set, require or exclude flagged tasks.")] = None,
    in_inbox: Annotated[bool | None, Field(description="If set, require or exclude inbox tasks.")] = None,
    has_note: Annotated[bool | None, Field(description="If set, require or exclude tasks with notes.")] = None,
    has_estimate: Annotated[bool | None, Field(description="If set, require or exclude estimated tasks.")] = None,
    estimate_min: Annotated[int | None, Field(ge=0, description="Minimum estimated minutes.")] = None,
    estimate_max: Annotated[int | None, Field(ge=0, description="Maximum estimated minutes.")] = None,
    is_repeating: Annotated[bool | None, Field(description="If set, require or exclude repeating tasks.")] = None,
    available_only: Annotated[bool, Field(description="Only Available/Next/DueSoon/Overdue tasks.")] = False,
    due_today: Annotated[bool | None, Field(description="Due today (local).")] = None,
    due_this_week: Annotated[bool | None, Field(description="Due in the next 7 local days.")] = None,
    due_this_month: Annotated[bool | None, Field(description="Due this calendar month.")] = None,
    overdue: Annotated[bool | None, Field(description="Past due and incomplete.")] = None,
    planned_today: Annotated[bool | None, Field(description="Planned date is today. Requires OmniFocus 4.7+.")] = None,
    completed_today: Annotated[bool | None, Field(description="Completed today.")] = None,
    due_before: Annotated[str | None, Field(description="ISO date/datetime upper bound for due.")] = None,
    due_after: Annotated[str | None, Field(description="ISO date/datetime lower bound for due.")] = None,
    defer_before: Annotated[str | None, Field(description="ISO date/datetime upper bound for defer.")] = None,
    defer_after: Annotated[str | None, Field(description="ISO date/datetime lower bound for defer.")] = None,
    planned_before: Annotated[str | None, Field(description="ISO date/datetime upper bound for planned.")] = None,
    planned_after: Annotated[str | None, Field(description="ISO date/datetime lower bound for planned.")] = None,
    days: Annotated[int | None, Field(ge=1, le=31, description="Forecast horizon in days. Default 7.")] = None,
) -> dict[str, Any]:
    """Read tasks from Inbox, Flagged, Forecast, tags, projects, custom perspectives, or an ad-hoc filter.

    Results are paginated and compact by default. Use count_tasks when you only need totals.
    Custom perspectives (source=custom) are saved views, not tags.
    """
    if err := _validate_dates(
        due_before=due_before,
        due_after=due_after,
        defer_before=defer_before,
        defer_after=defer_after,
        planned_before=planned_before,
        planned_after=planned_after,
    ):
        return err
    return _run(
        "query_tasks",
        source=source,
        output=output,
        limit=limit,
        cursor=cursor,
        sortBy=sort_by,
        hideCompleted=hide_completed,
        showSubtasks=show_subtasks,
        maxSubtaskDepth=max_subtask_depth,
        search=search,
        taskId=task_id,
        taskName=task_name,
        id=task_id,
        name=task_name,
        projectId=project_id,
        projectName=project_name,
        folderId=folder_id,
        tagId=tag_id,
        tagName=tag_name,
        tagIds=tag_ids,
        tagNames=tag_names,
        exactMatch=exact_match,
        perspectiveName=perspective_name,
        perspectiveId=perspective_id,
        taskStatus=task_status,
        flagged=flagged,
        inInbox=in_inbox,
        hasNote=has_note,
        hasEstimate=has_estimate,
        estimateMin=estimate_min,
        estimateMax=estimate_max,
        isRepeating=is_repeating,
        availableOnly=available_only,
        dueToday=due_today,
        dueThisWeek=due_this_week,
        dueThisMonth=due_this_month,
        overdue=overdue,
        plannedToday=planned_today,
        completedToday=completed_today,
        dueBefore=due_before,
        dueAfter=due_after,
        deferBefore=defer_before,
        deferAfter=defer_after,
        plannedBefore=planned_before,
        plannedAfter=planned_after,
        days=days,
    )


@mcp.tool(title="Count tasks", annotations=READ)
def count_tasks(
    source: Annotated[
        Literal[
            "filter", "inbox", "flagged", "forecast", "available", "overdue",
            "completed_today", "tag", "project", "custom", "search",
        ],
        Field(description="Same sources as query_tasks."),
    ] = "filter",
    search: str | None = None,
    project_id: str | None = None,
    project_name: str | None = None,
    tag_id: str | None = None,
    tag_name: str | None = None,
    perspective_name: str | None = None,
    perspective_id: str | None = None,
    task_status: list[str] | None = None,
    flagged: bool | None = None,
    hide_completed: bool = True,
    available_only: bool = False,
    due_today: bool | None = None,
    due_this_week: bool | None = None,
    overdue: bool | None = None,
    planned_today: bool | None = None,
    completed_today: bool | None = None,
    estimate_min: int | None = None,
    estimate_max: int | None = None,
    days: int | None = None,
) -> dict[str, Any]:
    """Count matching tasks with a status breakdown and known estimated minutes.

    Use this before listing when you need scale, daily capacity, or a review total.
    """
    return _run(
        "count_tasks",
        source=source,
        search=search,
        projectId=project_id,
        projectName=project_name,
        tagId=tag_id,
        tagName=tag_name,
        perspectiveName=perspective_name,
        perspectiveId=perspective_id,
        taskStatus=task_status,
        flagged=flagged,
        hideCompleted=hide_completed,
        availableOnly=available_only,
        dueToday=due_today,
        dueThisWeek=due_this_week,
        overdue=overdue,
        plannedToday=planned_today,
        completedToday=completed_today,
        estimateMin=estimate_min,
        estimateMax=estimate_max,
        days=days,
    )


@mcp.tool(title="Query projects", annotations=READ)
def query_projects(
    view: Annotated[
        Literal["all", "active", "due_for_review", "stalled"],
        Field(description="due_for_review uses OmniFocus review dates. stalled means active with no available next action."),
    ] = "all",
    output: Literal["compact", "detailed", "ids"] = "compact",
    limit: Annotated[int, Field(ge=1, le=200)] = 50,
    cursor: str | None = None,
    sort_by: Literal["library", "name", "nextReviewDate"] | None = None,
    project_id: str | None = None,
    project_name: str | None = None,
    folder_id: str | None = None,
    folder_name: str | None = None,
    status: Annotated[list[Literal["Active", "OnHold", "Done", "Dropped"]] | None, Field(description="Project status filter.")] = None,
    search: str | None = None,
) -> dict[str, Any]:
    """List projects, including review metadata and stalled detection."""
    return _run(
        "query_projects",
        view=view,
        output=output,
        limit=limit,
        cursor=cursor,
        sortBy=sort_by,
        projectId=project_id,
        projectName=project_name,
        folderId=folder_id,
        folderName=folder_name,
        status=status,
        search=search,
    )


@mcp.tool(title="Query folders", annotations=READ)
def query_folders(
    output: Literal["compact", "detailed"] = "compact",
    limit: Annotated[int, Field(ge=1, le=200)] = 50,
    cursor: str | None = None,
    folder_id: str | None = None,
    folder_name: str | None = None,
    search: str | None = None,
) -> dict[str, Any]:
    """List OmniFocus folders. detailed includes child projects and subfolders."""
    return _run(
        "query_folders",
        output=output,
        limit=limit,
        cursor=cursor,
        folderId=folder_id,
        folderName=folder_name,
        search=search,
    )


@mcp.tool(title="Query tags", annotations=READ)
def query_tags(
    output: Literal["compact", "detailed"] = "compact",
    limit: Annotated[int, Field(ge=1, le=200)] = 50,
    cursor: str | None = None,
    tag_id: str | None = None,
    tag_name: str | None = None,
    search: Annotated[str | None, Field(description="Fuzzy match on tag name or path.")] = None,
    status: list[Literal["Active", "OnHold", "Dropped"]] | None = None,
) -> dict[str, Any]:
    """List or search tags, including hierarchy paths such as 'Work / Deep'."""
    return _run(
        "query_tags",
        output=output,
        limit=limit,
        cursor=cursor,
        tagId=tag_id,
        tagName=tag_name,
        search=search,
        status=status,
    )


@mcp.tool(title="Query perspectives", annotations=READ)
def query_perspectives(
    action: Annotated[Literal["list", "get"], Field(description="list all perspectives, or get one custom perspective's rules.")] = "list",
    perspective_name: Annotated[str | None, Field(description="Custom perspective name. Not a tag.")] = None,
    perspective_id: str | None = None,
) -> dict[str, Any]:
    """List built-in and custom perspectives, or read a custom perspective's filter rules.

    Custom perspectives require OmniFocus Pro. This does not return the tasks inside a perspective;
    use query_tasks with source=custom for that.
    """
    return _run(
        "query_perspectives",
        action=action,
        perspectiveName=perspective_name,
        perspectiveId=perspective_id,
    )


@mcp.tool(title="Read task attachment", annotations=READ)
def read_attachment(
    task_id: Annotated[str, Field(description="Task id from query_tasks or a detailed task read.")],
    attachment_id: Annotated[str, Field(description="Attachment id such as embedded-1 or linked-1.")],
) -> Any:
    """Read one attachment previously listed on a task. Images are returned as image content when possible."""
    result = _run("read_attachment", taskId=task_id, attachmentId=attachment_id)
    if not result.get("ok"):
        return result
    data = result["data"]
    attachment = data.get("attachment") or {}
    raw = data.get("contentBase64")
    mime = attachment.get("mimeType") or "application/octet-stream"
    if raw and str(mime).startswith("image/"):
        return [
            TextContent(type="text", text=json.dumps({"ok": True, "attachment": attachment})),
            ImageContent(type="image", data=raw, mime_type=mime),
        ]
    return result


# --- writes ---


@mcp.tool(title="Add task", annotations=WRITE)
def add_task(
    name: Annotated[str, Field(description="Task title.")],
    note: str | None = None,
    project_id: str | None = None,
    project_name: str | None = None,
    parent_task_id: Annotated[str | None, Field(description="Create as a subtask of this task. Do not also pass a project.")] = None,
    parent_task_name: str | None = None,
    flagged: bool | None = None,
    due_date: Annotated[str | None, Field(description="YYYY-MM-DD or ISO-8601 datetime.")] = None,
    defer_date: str | None = None,
    planned_date: str | None = None,
    estimated_minutes: int | None = None,
    sequential: bool | None = None,
    tags: Annotated[list[str] | None, Field(description="Tag names to apply. Exclusive tag groups are respected.")] = None,
    tag_ids: list[str] | None = None,
    repetition: Annotated[
        dict[str, Any] | None,
        Field(description="ICS repetition object: ruleString, method (DueDate|DeferUntilDate|Fixed), catchUpAutomatically."),
    ] = None,
    children: Annotated[list[dict[str, Any]] | None, Field(description="Nested subtasks using the same fields.")] = None,
) -> dict[str, Any]:
    """Create one task, optionally with subtasks, tags, dates, and a repeat rule."""
    if err := _validate_dates(due_date=due_date, defer_date=defer_date, planned_date=planned_date):
        return err
    return _run(
        "add_task",
        name=name,
        note=note,
        projectId=project_id,
        projectName=project_name,
        parentTaskId=parent_task_id,
        parentTaskName=parent_task_name,
        flagged=flagged,
        dueDate=due_date,
        deferDate=defer_date,
        plannedDate=planned_date,
        estimatedMinutes=estimated_minutes,
        sequential=sequential,
        tags=tags,
        tagIds=tag_ids,
        repetition=repetition,
        children=children,
    )


@mcp.tool(title="Add project", annotations=WRITE)
def add_project(
    name: Annotated[str, Field(description="Project name.")],
    note: str | None = None,
    folder_id: str | None = None,
    folder_name: str | None = None,
    sequential: Annotated[bool | None, Field(description="If true, tasks form a dependency chain.")] = None,
    singleton: Annotated[bool | None, Field(description="If true, this is a single-action list.")] = None,
    flagged: bool | None = None,
    due_date: str | None = None,
    defer_date: str | None = None,
    planned_date: str | None = None,
    status: Literal["Active", "OnHold", "Done", "Dropped"] | None = None,
    tags: list[str] | None = None,
    tag_ids: list[str] | None = None,
    tasks: Annotated[list[dict[str, Any]] | None, Field(description="Optional top-level tasks to create inside the project.")] = None,
) -> dict[str, Any]:
    """Create a project, optionally inside a folder and with an initial task list."""
    if err := _validate_dates(due_date=due_date, defer_date=defer_date, planned_date=planned_date):
        return err
    return _run(
        "add_project",
        name=name,
        note=note,
        folderId=folder_id,
        folderName=folder_name,
        sequential=sequential,
        singleton=singleton,
        flagged=flagged,
        dueDate=due_date,
        deferDate=defer_date,
        plannedDate=planned_date,
        status=status,
        tags=tags,
        tagIds=tag_ids,
        tasks=tasks,
    )


@mcp.tool(title="Add items", annotations=WRITE)
def add_items(
    items: Annotated[
        list[dict[str, Any]],
        Field(description="Tasks or projects. Later items may use parentTaskName of an earlier item in this batch."),
    ],
) -> dict[str, Any]:
    """Create many tasks or projects in one OmniJS call. Later items can parent to earlier names."""
    return _run("add_items", items=items)


@mcp.tool(title="Create project from outline", annotations=WRITE)
def create_project_from_outline(
    project: Annotated[
        dict[str, Any],
        Field(
            description="Confirmed project tree: name, optional folderId/tagIds/sequential, and tasks with nested children. Max 200 tasks and 8 levels."
        ),
    ],
) -> dict[str, Any]:
    """Create one verified project tree from a user-confirmed outline. Rolls back with Undo on failure."""
    return _run("create_project_from_outline", project=project)


@mcp.tool(title="Edit item", annotations=WRITE)
def edit_item(
    item_type: Literal["task", "project"] = "task",
    id: Annotated[str | None, Field(description="Stable id of the task or project.")] = None,
    name: Annotated[str | None, Field(description="Current name. Fails if ambiguous.")] = None,
    new_name: str | None = None,
    note: str | None = None,
    flagged: bool | None = None,
    due_date: str | None = None,
    defer_date: str | None = None,
    planned_date: str | None = None,
    estimated_minutes: int | None = None,
    sequential: bool | None = None,
    status: Literal["Active", "OnHold", "Done", "Dropped"] | None = None,
    singleton: bool | None = None,
    tags: list[str] | None = None,
    tag_ids: list[str] | None = None,
    replace_tags: Annotated[bool, Field(description="If true, replace existing tags instead of adding.")] = False,
    clear: Annotated[list[Literal["dueDate", "deferDate", "plannedDate", "note", "estimatedMinutes"]] | None, Field(description="Fields to clear.")] = None,
    new_project_id: str | None = None,
    new_project_name: str | None = None,
    new_parent_task_id: str | None = None,
    new_parent_task_name: str | None = None,
    move_to_inbox: bool | None = None,
    new_folder_id: str | None = None,
    new_folder_name: str | None = None,
    repetition: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Edit a task or project, including optional move, tags, dates, and status."""
    if err := _validate_dates(due_date=due_date, defer_date=defer_date, planned_date=planned_date):
        return err
    return _run(
        "edit_item",
        itemType=item_type,
        id=id,
        name=name,
        newName=new_name,
        note=note,
        flagged=flagged,
        dueDate=due_date,
        deferDate=defer_date,
        plannedDate=planned_date,
        estimatedMinutes=estimated_minutes,
        sequential=sequential,
        status=status,
        singleton=singleton,
        tags=tags,
        tagIds=tag_ids,
        replaceTags=replace_tags,
        clear=clear,
        newProjectId=new_project_id,
        newProjectName=new_project_name,
        newParentTaskId=new_parent_task_id,
        newParentTaskName=new_parent_task_name,
        moveToInbox=move_to_inbox,
        newFolderId=new_folder_id,
        newFolderName=new_folder_name,
        repetition=repetition,
    )


@mcp.tool(title="Complete items", annotations=WRITE)
def complete_items(
    ids: Annotated[list[str], Field(description="Stable task or project ids. Max 100.")],
    action: Literal["complete", "incomplete", "drop"] = "complete",
    completion_date: str | None = None,
    all_occurrences: Annotated[bool, Field(description="When dropping a repeating item, drop every occurrence.")] = False,
) -> dict[str, Any]:
    """Mark tasks or projects complete, incomplete, or dropped. Repeating completes report the generated instance."""
    if len(ids) > 100:
        return OmniFocusError("OF_VALIDATION", "complete_items accepts at most 100 ids").to_dict()
    if err := _validate_dates(completion_date=completion_date):
        return err
    return _run(
        "complete_items",
        ids=ids,
        action=action,
        completionDate=completion_date,
        allOccurrences=all_occurrences,
    )


@mcp.tool(title="Move items", annotations=WRITE)
def move_items(
    moves: Annotated[
        list[dict[str, Any]],
        Field(
            description="Each move needs taskId and exactly one destination: projectId, parentTaskId, or moveToInbox=true."
        ),
    ],
) -> dict[str, Any]:
    """Move tasks to a project, parent task, or the Inbox. Cycles are rejected before any move."""
    return _run("move_items", moves=moves)


@mcp.tool(title="Remove items", annotations=DESTROY)
def remove_items(
    ids: Annotated[list[str] | None, Field(description="Task, project, or folder ids to delete.")] = None,
    confirm_token: Annotated[str | None, Field(description="Token from the preview response. Required to actually delete.")] = None,
) -> dict[str, Any]:
    """Delete tasks, projects, or folders. First call returns a cascade preview and confirmToken; second call executes."""
    if confirm_token:
        try:
            stored = _confirms.consume(confirm_token, "remove_items")
        except KeyError:
            return OmniFocusError("OF_VALIDATION", "Unknown or expired confirm token").to_dict()
        return _run("remove_items", ids=stored["ids"], previewOnly=False)
    if not ids:
        return OmniFocusError("OF_VALIDATION", "Provide ids to preview, or confirmToken to delete").to_dict()
    preview = _run("remove_items", ids=ids, previewOnly=True)
    if preview.get("ok"):
        token = _confirms.issue("remove_items", {"ids": ids})
        preview["data"]["confirmToken"] = token
        preview["data"]["hint"] = (
            "This was a preview. Call remove_items again with confirmToken to delete. "
            "If you delete by mistake, immediately call omnifocus_session action=undo."
        )
    return preview


@mcp.tool(title="Duplicate items", annotations=WRITE)
def duplicate_items(
    ids: Annotated[list[str], Field(description="Task or project ids to duplicate.")],
    new_name: str | None = None,
    include_subtasks: Annotated[bool, Field(description="When duplicating a task, keep its subtasks.")] = True,
) -> dict[str, Any]:
    """Duplicate tasks or whole projects. Duplicating a project is useful as a template."""
    return _run("duplicate_items", ids=ids, newName=new_name, includeSubtasks=include_subtasks)


@mcp.tool(title="Set repetition", annotations=WRITE)
def set_repetition(
    task_id: str | None = None,
    task_name: str | None = None,
    rule_string: Annotated[str | None, Field(description="ICS RRULE, for example FREQ=WEEKLY;BYDAY=FR.")] = None,
    method: Literal["DueDate", "DeferUntilDate", "Fixed"] | None = None,
    catch_up_automatically: bool | None = None,
    clear: Annotated[bool, Field(description="Remove the repeat rule.")] = False,
) -> dict[str, Any]:
    """Set, update, or clear a task's OmniFocus 4.7+ repetition rule. Restores the previous rule on failure."""
    return _run(
        "set_repetition",
        taskId=task_id,
        taskName=task_name,
        ruleString=rule_string,
        method=method,
        catchUpAutomatically=catch_up_automatically,
        clear=clear,
    )


@mcp.tool(title="Manage folder", annotations=DESTROY)
def manage_folder(
    action: Literal["add", "edit", "remove"],
    name: str | None = None,
    folder_id: str | None = None,
    folder_name: str | None = None,
    new_name: str | None = None,
    parent_folder_id: str | None = None,
    parent_folder_name: str | None = None,
    status: Literal["Active", "Dropped"] | None = None,
    confirm_token: str | None = None,
) -> dict[str, Any]:
    """Create, rename, move, or delete a folder. Deleting a folder also deletes its projects; that path requires confirmToken."""
    if action == "remove":
        target_id = folder_id
        if confirm_token:
            try:
                stored = _confirms.consume(confirm_token, "remove_folder")
            except KeyError:
                return OmniFocusError("OF_VALIDATION", "Unknown or expired confirm token").to_dict()
            return _run("manage_folder", action="remove", folderId=stored["ids"][0], previewOnly=False)
        preview = _run(
            "manage_folder",
            action="remove",
            folderId=folder_id,
            folderName=folder_name,
            previewOnly=True,
        )
        if preview.get("ok"):
            removed_id = (preview["data"].get("preview") or [{}])[0].get("id") or target_id
            preview["data"]["confirmToken"] = _confirms.issue("remove_folder", {"ids": [removed_id]})
            preview["data"]["hint"] = "Call manage_folder action=remove again with confirmToken to delete the folder."
        return preview
    return _run(
        "manage_folder",
        action=action,
        name=name,
        folderId=folder_id,
        folderName=folder_name,
        newName=new_name,
        parentFolderId=parent_folder_id,
        parentFolderName=parent_folder_name,
        status=status,
    )


@mcp.tool(title="Manage tag", annotations=DESTROY)
def manage_tag(
    action: Literal["add", "edit", "remove"],
    name: str | None = None,
    tag_id: str | None = None,
    tag_name: str | None = None,
    new_name: str | None = None,
    parent_tag_id: str | None = None,
    parent_tag_name: str | None = None,
    status: Literal["Active", "OnHold", "Dropped"] | None = None,
    allows_next_action: bool | None = None,
) -> dict[str, Any]:
    """Create, rename, nest, or delete a tag. On-hold tags block next actions."""
    return _run(
        "manage_tag",
        action=action,
        name=name,
        tagId=tag_id,
        tagName=tag_name,
        newName=new_name,
        parentTagId=parent_tag_id,
        parentTagName=parent_tag_name,
        status=status,
        allowsNextAction=allows_next_action,
    )


@mcp.tool(title="Manage perspective", annotations=WRITE)
def manage_perspective(
    perspective_name: str | None = None,
    perspective_id: str | None = None,
    rules: Annotated[list[dict[str, Any]] | None, Field(description="Replacement archivedFilterRules document.")] = None,
    aggregation: Literal["any", "all", "none"] | None = None,
) -> dict[str, Any]:
    """Update a custom perspective's filter rules in place. OmniFocus cannot create or delete perspectives via automation."""
    return _run(
        "manage_perspective",
        perspectiveName=perspective_name,
        perspectiveId=perspective_id,
        rules=rules,
        aggregation=aggregation,
    )


@mcp.tool(title="Manage notifications", annotations=WRITE)
def manage_notifications(
    action: Literal["list", "add", "remove"] = "list",
    task_id: str | None = None,
    task_name: str | None = None,
    absolute_date: Annotated[str | None, Field(description="ISO datetime for an absolute reminder.")] = None,
    minutes_before_due: Annotated[int | None, Field(description="Due-relative reminder, in minutes before due.")] = None,
    notification_id: str | None = None,
) -> dict[str, Any]:
    """List, add, or remove task reminders (absolute or due-relative)."""
    if err := _validate_dates(absolute_date=absolute_date):
        return err
    return _run(
        "manage_notifications",
        action=action,
        taskId=task_id,
        taskName=task_name,
        absoluteDate=absolute_date,
        minutesBeforeDue=minutes_before_due,
        notificationId=notification_id,
    )


@mcp.tool(title="Append note", annotations=WRITE)
def append_note(
    text: Annotated[str, Field(description="Text to append. Existing notes are kept.")],
    item_type: Literal["task", "project"] = "task",
    id: str | None = None,
    name: str | None = None,
) -> dict[str, Any]:
    """Append to a task or project note without overwriting it."""
    return _run("append_note", text=text, itemType=item_type, id=id, name=name)


@mcp.tool(title="Mark projects reviewed", annotations=WRITE)
def mark_reviewed(
    ids: Annotated[list[str], Field(description="Project ids the user confirmed as reviewed.")],
    review_date: str | None = None,
) -> dict[str, Any]:
    """Mark confirmed projects reviewed with one timestamp and return the OmniFocus-generated next review dates."""
    if err := _validate_dates(review_date=review_date):
        return err
    return _run("mark_reviewed", ids=ids, reviewDate=review_date)


@mcp.tool(title="OmniFocus session", annotations=WRITE)
def omnifocus_session(
    action: Literal["undo", "redo", "clean_up", "reveal"],
    item_type: Literal["task", "project", "folder"] | None = None,
    id: str | None = None,
    name: str | None = None,
) -> dict[str, Any]:
    """Undo or redo the last OmniFocus change, run database clean-up, or reveal an item in the OmniFocus UI."""
    return _run("session", action=action, itemType=item_type, id=id, name=name)


# --- resources ---


@mcp.resource("omnifocus://status")
def resource_status() -> str:
    """Headline OmniFocus counts and connection health."""
    return json.dumps(_run("status"), indent=2)


@mcp.resource("omnifocus://inbox")
def resource_inbox() -> str:
    """Current inbox tasks (compact, max 50)."""
    return json.dumps(_run("query_tasks", source="inbox", output="compact", limit=50), indent=2)


@mcp.resource("omnifocus://today")
def resource_today() -> str:
    """Overdue, due today, and flagged remaining work."""
    overdue = _run("query_tasks", source="overdue", output="compact", limit=40)
    due = _run("query_tasks", source="filter", dueToday=True, output="compact", limit=40)
    flagged = _run("query_tasks", source="flagged", output="compact", limit=40)
    return json.dumps({"ok": True, "overdue": overdue, "dueToday": due, "flagged": flagged}, indent=2)


@mcp.resource("omnifocus://forecast")
def resource_forecast() -> str:
    """Forecast window for the next 7 days."""
    return json.dumps(_run("query_tasks", source="forecast", days=7, output="compact", limit=50), indent=2)


@mcp.resource("omnifocus://projects")
def resource_projects() -> str:
    """Active projects with stalled detection."""
    return json.dumps(_run("query_projects", view="active", output="compact", limit=50), indent=2)


@mcp.resource("omnifocus://review")
def resource_review() -> str:
    """Projects currently due for review."""
    return json.dumps(_run("query_projects", view="due_for_review", output="compact", limit=50), indent=2)


# --- prompts ---


def _prompt_json(op: str, **payload: Any) -> str:
    return json.dumps(_run(op, **payload), indent=2)


@mcp.prompt()
def daily_planning(available_minutes: str = "") -> str:
    """Plan today from Forecast, flagged, and overdue work. Optionally pass available minutes."""
    counts = _prompt_json("count_tasks", source="forecast", days=1)
    overdue = _prompt_json("query_tasks", source="overdue", output="compact", limit=20)
    flagged = _prompt_json("query_tasks", source="flagged", output="compact", limit=20)
    due = _prompt_json("query_tasks", source="filter", dueToday=True, output="compact", limit=20)
    inbox = _prompt_json("count_tasks", source="inbox")
    budget = available_minutes.strip() or "not specified — do not assume an eight-hour day"
    return f"""You are helping plan today in OmniFocus.

Available minutes: {budget}

Live data:
- Forecast/today counts: {counts}
- Overdue: {overdue}
- Due today: {due}
- Flagged: {flagged}
- Inbox size: {inbox}

Produce:
1. Three priorities for today (or fewer if there is not enough real work).
2. Concrete next actions that are actually available.
3. Blockers (blocked, waiting, or missing estimates that matter).
4. Capacity / deadline risk using only known estimatedMinutes. Preserve missing estimates as uncertainty.
5. One grouped confirmation list if any OmniFocus changes are warranted. Do not write until the user confirms.
"""


@mcp.prompt()
def weekly_review() -> str:
    """GTD weekly review: inbox, projects due for review, and stalled projects."""
    inbox = _prompt_json("query_tasks", source="inbox", output="compact", limit=40)
    due = _prompt_json("query_projects", view="due_for_review", output="compact", limit=40)
    stalled = _prompt_json("query_projects", view="stalled", output="compact", limit=40)
    return f"""Lead a GTD weekly review for this OmniFocus database.

Inbox:
{inbox}

Projects due for review:
{due}

Stalled active projects (no available next action):
{stalled}

Walk through: clear inbox, check each due-for-review project, restore stalled projects with a next action, then ask which projects to mark reviewed. Call mark_reviewed only after explicit confirmation.
"""


@mcp.prompt()
def inbox_processing() -> str:
    """Clarify inbox items into delete, defer, delegate, file, or do."""
    inbox = _prompt_json("query_tasks", source="inbox", output="detailed", limit=30)
    folders = _prompt_json("query_folders", output="compact", limit=50)
    return f"""Process the OmniFocus Inbox using GTD clarification.

Inbox:
{inbox}

Folders (for filing):
{folders}

For each item propose exactly one: delete, complete now, defer with a date, convert to a project, or move to an existing project/tag. Show the full move plan, then call move_items / complete_items / remove_items only after the user confirms. Use confirmToken for deletes.
"""


@mcp.prompt()
def project_planning(project: str) -> str:
    """Break a named project into sequenced, estimated next actions."""
    data = _prompt_json("query_projects", project_name=project, output="detailed", limit=5)
    tasks = _prompt_json("query_tasks", source="project", project_name=project, output="compact", showSubtasks=True, limit=80)
    return f"""Plan the OmniFocus project {project!r}.

Project:
{data}

Existing tasks:
{tasks}

Propose a sequenced next-action list with estimated minutes where you can justify them. Label inferences. Do not create or edit tasks until the user confirms the outline.
"""


@mcp.prompt()
def project_shaping() -> str:
    """Turn conversation notes into one confirmed OmniFocus project tree."""
    folders = _prompt_json("query_folders", output="compact", limit=50)
    tags = _prompt_json("query_tags", output="compact", limit=50)
    return f"""Turn the surrounding conversation into one OmniFocus project tree.

Available folders:
{folders}

Available tags:
{tags}

Extract a readable outline, disclose every inference (dates, tags, estimates, sequential vs parallel), resolve folder and tag ids, then wait for explicit confirmation before calling create_project_from_outline once. Max 200 tasks and 8 levels.
"""


@mcp.prompt()
def evening_shutdown() -> str:
    """Close the day: what got done, what slipped, and what should be planned tomorrow."""
    done = _prompt_json("query_tasks", source="completed_today", output="compact", limit=40)
    leftover = _prompt_json("query_tasks", source="filter", dueToday=True, hideCompleted=True, output="compact", limit=40)
    overdue = _prompt_json("query_tasks", source="overdue", output="compact", limit=20)
    return f"""Help shut down the workday in OmniFocus.

Completed today:
{done}

Still due today:
{leftover}

Overdue:
{overdue}

Summarize wins, identify slipped work, and propose tomorrow's planned dates or deferrals. Do not write until the user confirms.
"""


def main() -> None:
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
