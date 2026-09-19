function dispatch(p) {
  switch (p.op) {
    case "status": return statusInfo(p);
    case "query_tasks": return queryTasks(p);
    case "count_tasks": return countTasks(p);
    case "query_projects": return queryProjects(p);
    case "query_folders": return queryFolders(p);
    case "query_tags": return queryTags(p);
    case "query_perspectives": return queryPerspectives(p);
    case "read_attachment": return readAttachment(p);
    case "add_task": return addTask(p);
    case "add_project": return addProject(p);
    case "add_items": return addItems(p);
    case "create_project_from_outline": return createProjectFromOutline(p);
    case "edit_item": return editItem(p);
    case "complete_items": return completeItems(p);
    case "move_items": return moveItems(p);
    case "remove_items": return removeItems(p);
    case "duplicate_items": return duplicateItems(p);
    case "set_repetition": return setRepetition(p);
    case "manage_folder": return manageFolder(p);
    case "manage_tag": return manageTag(p);
    case "manage_perspective": return managePerspective(p);
    case "manage_notifications": return manageNotifications(p);
    case "append_note": return appendNote(p);
    case "mark_reviewed": return markReviewed(p);
    case "session": return session(p);
    default: fail("OF_VALIDATION", "Unknown operation: " + p.op, {op: p.op});
  }
}

(function () {
  var payload = PAYLOAD;
  try {
    if (payload.source === "completed_today") payload.hideCompleted = false;
    var data = dispatch(payload);
    return JSON.stringify({ok: true, data: data});
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: {
        code: e.code || "OF_SCRIPT_ERROR",
        message: String(e.message || e),
        details: e.details || null
      }
    });
  }
})();
