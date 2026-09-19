# OmniFocus MCP

Python MCP server for [OmniFocus](https://www.omnigroup.com/omnifocus/) on macOS. It talks to the running app through OmniJS (`evaluateJavascript`), not AppleScript, and is designed so an AI assistant can plan, capture, and organize work without dumping the whole database into context.

It covers the surface of [OmniFocus MCP Enhanced](https://github.com/jqlts1/omnifocus-mcp-enhanced) and improves the parts that actually hurt: tool selection, date handling, large-database reads, mixed read/write annotations, and unsafe deletes.

## Improvements over OmniFocus MCP Enhanced

| Area | Enhanced | This server |
| --- | --- | --- |
| Runtime | Node / `npx` | Python 3.11+, stdio |
| Database dump | `dump_database` still exists and models reach for it | Not exposed. `omnifocus_status` and `count_tasks` give counts |
| Dates | AppleScript path zeroed times; offsets ignored | One OmniJS path; `YYYY-MM-DD` is local midnight; ISO offsets convert to local wall-clock |
| Tool split | `manage_*` mixes reads and writes, so annotations are conservative | Reads and writes are separate tools with correct `readOnlyHint` / `destructiveHint` |
| List output | ASCII trees (`├─`) mixed into results | Structured JSON with optional nested `children` |
| Pagination | Mostly `filter_tasks` | Every list read is paginated (default 50, max 200) |
| Deletes | Direct delete | Cascade preview + short-lived `confirmToken` |
| Recovery | Partial undo on some writes | `omnifocus_session` undo / redo / clean up / reveal |
| Diagnostics | None | `omnifocus_status` (running, Pro, windows, headline counts) |
| Daily views | Inbox / Flagged / Forecast / tag | Also `available`, `overdue`, `completed_today` |
| Templates | Duplicate task | Duplicate task **or project** |
| Prompts | Daily / weekly / inbox / project planning / shaping | Same, plus evening shutdown |
| Deep links | Not on every item | Every task/project/folder/tag includes `omnifocus:///…` |

Custom perspectives, hierarchical tags (`Work / Deep`), repetition rules, notifications, attachments, project shaping, and review workflows are all included.

## Requirements

- macOS with OmniFocus 3+ running (Pro required for custom perspectives)
- Python 3.11+
- Automation permission: System Settings → Privacy & Security → Automation → allow the host app (Cursor, Terminal, Claude) to control OmniFocus
- An open OmniFocus window when reading a custom perspective (the previous perspective is restored afterward)

## Install

```bash
cd omnifocus-mcp
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

### Claude Desktop / Cursor

```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "/ABS/PATH/TO/omnifocus-mcp/.venv/bin/omnifocus-mcp"
    }
  }
}
```

Or without a venv:

```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "python3",
      "args": ["-m", "omnifocus_mcp"],
      "cwd": "/ABS/PATH/TO/omnifocus-mcp"
    }
  }
}
```

Optional: `OMNIFOCUS_TIMEOUT_SECONDS` (default `60`) if a large database needs a longer OmniJS budget.

## Tools

**Read**

- `omnifocus_status` — connection, edition, undo flags, headline counts
- `query_tasks` — `source`: `inbox` \| `flagged` \| `forecast` \| `available` \| `overdue` \| `completed_today` \| `tag` \| `project` \| `custom` \| `search` \| `filter` \| `id`
- `count_tasks` — same filters, plus status / flagged / overdue / estimate totals
- `query_projects` — `view`: `all` \| `active` \| `due_for_review` \| `stalled`
- `query_folders` / `query_tags` / `query_perspectives`
- `read_attachment` — image attachments returned as MCP image content when possible

**Write**

- `add_task`, `add_project`, `add_items`, `create_project_from_outline`
- `edit_item`, `complete_items`, `move_items`, `duplicate_items`
- `set_repetition`, `append_note`, `mark_reviewed`
- `manage_folder`, `manage_tag`, `manage_perspective`, `manage_notifications`
- `remove_items` — preview first, then `confirmToken`
- `omnifocus_session` — `undo` \| `redo` \| `clean_up` \| `reveal`

A **perspective** is a saved view. A **tag** is a label. `query_tasks source=custom` reads a perspective; `query_tasks source=tag` reads a tag.

## Resources

| URI | Contents |
| --- | --- |
| `omnifocus://status` | Health + counts |
| `omnifocus://inbox` | Inbox (compact, 50) |
| `omnifocus://today` | Overdue + due today + flagged |
| `omnifocus://forecast` | Next 7 days |
| `omnifocus://projects` | Active projects, including stalled |
| `omnifocus://review` | Projects due for review |

## Prompts

`daily_planning`, `weekly_review`, `inbox_processing`, `project_planning`, `project_shaping`, `evening_shutdown`

Each prompt pulls a bounded live snapshot and tells the model to confirm before writing.

## Dates

- `2026-08-14` → local midnight, floating
- `2026-08-14T09:30` → local 09:30, floating
- `2026-08-14T09:30:00-06:00` or `…Z` → converted to local wall-clock so the calendar day stays the one the timestamp refers to

`plannedDate` requires OmniFocus 4.7+.

## Safety

- No full-database dump tool
- Default list limit 50
- Name lookups fail on duplicates and ask for an id
- Subtasks inherit their project; passing both `parentTaskId` and a project is rejected
- Moves that would cycle are rejected
- Deletes return a cascade preview and require `confirmToken`
- `create_project_from_outline` and repetition writes undo on verification failure

## Tests

```bash
pytest
```

Live OmniFocus is not required. Pointing the server at a running copy of OmniFocus is the integration test: `omnifocus_status` should return `running: true`.

The first OmniJS call after OmniFocus has been idle can take 10–20 seconds while the scripting bridge wakes up. Later calls in the same process are faster. Increase `OMNIFOCUS_TIMEOUT_SECONDS` if a very large database still times out.

## License

MIT
