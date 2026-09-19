/* OmniFocus OmniJS helpers. Runs inside evaluateJavascript. */

function fail(code, message, details) {
  var err = new Error(message);
  err.code = code;
  err.details = details || null;
  throw err;
}

function idOf(obj) {
  if (!obj || !obj.id) return null;
  return obj.id.primaryKey;
}

function urlFor(kind, id) {
  return "omnifocus:///" + kind + "/" + id;
}

function pad(n) {
  return n < 10 ? "0" + n : String(n);
}

function formatDate(d) {
  if (!d) return null;
  var offsetMin = -d.getTimezoneOffset();
  var sign = offsetMin >= 0 ? "+" : "-";
  var abs = Math.abs(offsetMin);
  return (
    d.getFullYear() +
    "-" + pad(d.getMonth() + 1) +
    "-" + pad(d.getDate()) +
    "T" + pad(d.getHours()) +
    ":" + pad(d.getMinutes()) +
    ":" + pad(d.getSeconds()) +
    sign + pad(Math.floor(abs / 60)) +
    ":" + pad(abs % 60)
  );
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

function parseDate(iso) {
  if (iso === undefined || iso === null || iso === "") return null;
  var text = String(iso).trim();
  var dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 0, 0, 0, 0);
  }
  var localDt = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/.exec(text);
  if (localDt) {
    return new Date(
      Number(localDt[1]),
      Number(localDt[2]) - 1,
      Number(localDt[3]),
      Number(localDt[4]),
      Number(localDt[5]),
      localDt[6] ? Number(localDt[6]) : 0,
      0
    );
  }
  var parsed = new Date(text);
  if (isNaN(parsed.getTime())) {
    fail("OF_VALIDATION", "Invalid date: " + text, {value: text});
  }
  return parsed;
}

function enumName(value, table) {
  for (var i = 0; i < table.length; i++) {
    if (value === table[i][0]) return table[i][1];
  }
  return String(value);
}

function taskStatusName(status) {
  return enumName(status, [
    [Task.Status.Available, "Available"],
    [Task.Status.Blocked, "Blocked"],
    [Task.Status.Completed, "Completed"],
    [Task.Status.Dropped, "Dropped"],
    [Task.Status.DueSoon, "DueSoon"],
    [Task.Status.Next, "Next"],
    [Task.Status.Overdue, "Overdue"]
  ]);
}

function projectStatusName(status) {
  return enumName(status, [
    [Project.Status.Active, "Active"],
    [Project.Status.OnHold, "OnHold"],
    [Project.Status.Done, "Done"],
    [Project.Status.Dropped, "Dropped"]
  ]);
}

function folderStatusName(status) {
  return enumName(status, [
    [Folder.Status.Active, "Active"],
    [Folder.Status.Dropped, "Dropped"]
  ]);
}

function tagStatusName(status) {
  return enumName(status, [
    [Tag.Status.Active, "Active"],
    [Tag.Status.OnHold, "OnHold"],
    [Tag.Status.Dropped, "Dropped"]
  ]);
}

function isActionTask(task) {
  return !!(task && !task.project);
}

function plannedDateOf(obj) {
  try {
    return obj.plannedDate || null;
  } catch (e) {
    return null;
  }
}

function setPlannedDate(obj, value) {
  try {
    obj.plannedDate = value;
  } catch (e) {
    if (value) fail("OF_UNSUPPORTED", "plannedDate requires OmniFocus 4.7 or later");
  }
}

function tagPath(tag) {
  var parts = [];
  var current = tag;
  while (current) {
    parts.unshift(current.name);
    current = current.parent;
  }
  return parts.join(" / ");
}

function tagAncestorIds(tag) {
  var ids = [];
  var current = tag.parent;
  while (current) {
    ids.unshift(idOf(current));
    current = current.parent;
  }
  return ids;
}

function serializeTagRef(tag, detailed) {
  var ref = {id: idOf(tag), name: tag.name};
  if (detailed) {
    ref.path = tagPath(tag);
    ref.ancestorIds = tagAncestorIds(tag);
    ref.status = tagStatusName(tag.status);
    ref.url = urlFor("tag", ref.id);
  }
  return ref;
}

function serializeRepetition(rule) {
  if (!rule) return null;
  var method = "None";
  try {
    if (rule.method === Task.RepetitionMethod.DueDate) method = "DueDate";
    else if (rule.method === Task.RepetitionMethod.DeferUntilDate) method = "DeferUntilDate";
    else if (rule.method === Task.RepetitionMethod.Fixed) method = "Fixed";
  } catch (e) {}
  var info = {
    ruleString: rule.ruleString,
    method: method,
    isRepeating: true
  };
  try { info.scheduleType = String(rule.scheduleType); } catch (e) {}
  try { info.anchorDateKey = String(rule.anchorDateKey); } catch (e) {}
  try { info.catchUpAutomatically = !!rule.catchUpAutomatically; } catch (e) {}
  try { info.nextOccurrence = formatDate(rule.firstDateAfterDate(new Date())); } catch (e) {}
  return info;
}

function serializeNotification(n) {
  var kind = "Unknown";
  try {
    if (n.kind === Task.Notification.Kind.Absolute) kind = "Absolute";
    else if (n.kind === Task.Notification.Kind.DueRelative) kind = "DueRelative";
  } catch (e) {}
  var info = {id: idOf(n), kind: kind};
  try { info.initialFireDate = formatDate(n.initialFireDate); } catch (e) {}
  try { info.nextFireDate = formatDate(n.nextFireDate); } catch (e) {}
  if (kind === "Absolute") {
    try { info.absoluteFireDate = formatDate(n.absoluteFireDate); } catch (e) {}
  }
  if (kind === "DueRelative") {
    try { info.relativeFireOffsetMinutes = n.relativeFireOffset; } catch (e) {}
  }
  return info;
}

function serializeAttachments(obj) {
  var out = [];
  var attachments = [];
  try { attachments = obj.attachments || []; } catch (e) { attachments = []; }
  for (var i = 0; i < attachments.length; i++) {
    var fw = attachments[i];
    var name = null;
    try { name = fw.preferredFilename || fw.filename || ("attachment-" + (i + 1)); } catch (e) {
      name = "embedded-" + (i + 1);
    }
    var size = null;
    try { size = fw.contents ? fw.contents.length : null; } catch (e) {}
    var mime = guessMime(name);
    out.push({
      id: "embedded-" + (i + 1),
      name: name,
      source: "embedded",
      mimeType: mime,
      size: size
    });
  }
  var links = [];
  try { links = obj.linkedFileURLs || []; } catch (e) { links = []; }
  for (var j = 0; j < links.length; j++) {
    var url = String(links[j]);
    var linkName = url.split("/").pop() || url;
    out.push({
      id: "linked-" + (j + 1),
      name: linkName,
      source: "linked",
      url: url,
      mimeType: guessMime(linkName)
    });
  }
  return out;
}

function guessMime(name) {
  var lower = String(name || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".md")) return "text/markdown";
  return "application/octet-stream";
}

function visibleChildCount(task, hideCompleted) {
  var count = 0;
  var children = task.tasks;
  for (var i = 0; i < children.length; i++) {
    if (hideCompleted && children[i].completed) continue;
    if (children[i].dropDate && hideCompleted) continue;
    count++;
  }
  return count;
}

function serializeTask(task, opts) {
  opts = opts || {};
  var detailed = opts.output === "detailed";
  var hideCompleted = opts.hideCompleted !== false;
  var id = idOf(task);
  var project = task.containingProject;
  var parent = task.parent;
  var compact = {
    id: id,
    type: "task",
    name: task.name,
    status: taskStatusName(task.taskStatus),
    flagged: !!task.effectiveFlagged,
    dueDate: formatDate(task.effectiveDueDate),
    deferDate: formatDate(task.effectiveDeferDate),
    plannedDate: formatDate(plannedDateOf(task)),
    projectId: project ? idOf(project) : null,
    projectName: project ? project.name : null,
    inInbox: !!task.inInbox,
    estimatedMinutes: task.estimatedMinutes,
    childCount: visibleChildCount(task, hideCompleted),
    isRepeating: !!task.repetitionRule,
    url: urlFor("task", id)
  };
  if (opts.output === "ids") return {id: id, name: task.name, type: "task"};
  if (!detailed) {
    compact.tags = task.tags.map(function(t) { return t.name; });
    return compact;
  }
  compact.note = task.note || "";
  compact.completionDate = formatDate(task.completionDate);
  compact.dropDate = formatDate(task.dropDate);
  compact.parentId = parent && isActionTask(parent) ? idOf(parent) : null;
  compact.parentName = parent && isActionTask(parent) ? parent.name : null;
  compact.sequential = !!task.sequential;
  compact.completedByChildren = !!task.completedByChildren;
  compact.repetition = serializeRepetition(task.repetitionRule);
  compact.notifications = task.notifications.map(serializeNotification);
  compact.attachments = serializeAttachments(task);
  compact.tags = task.tags.map(function(t) { return serializeTagRef(t, true); });
  return compact;
}

function serializeProject(project, opts) {
  opts = opts || {};
  var detailed = opts.output === "detailed";
  var id = idOf(project);
  var folder = project.parentFolder;
  var remaining = 0;
  var available = 0;
  var flagged = 0;
  var tasks = project.flattenedTasks;
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    if (!isActionTask(t)) continue;
    if (!t.completed && !t.dropDate) remaining++;
    var st = t.taskStatus;
    if (st === Task.Status.Available || st === Task.Status.Next || st === Task.Status.DueSoon || st === Task.Status.Overdue) available++;
    if (t.effectiveFlagged && !t.completed) flagged++;
  }
  var nextTask = project.nextTask;
  var status = projectStatusName(project.status);
  var stalled = status === "Active" && remaining > 0 && available === 0;
  var item = {
    id: id,
    type: "project",
    name: project.name,
    status: status,
    flagged: !!project.flagged,
    sequential: !!project.sequential,
    singleton: !!project.containsSingletonActions,
    folderId: folder ? idOf(folder) : null,
    folderName: folder ? folder.name : null,
    dueDate: formatDate(project.dueDate),
    deferDate: formatDate(project.deferDate),
    nextReviewDate: formatDate(project.nextReviewDate),
    lastReviewDate: formatDate(project.lastReviewDate),
    remainingTaskCount: remaining,
    availableTaskCount: available,
    flaggedTaskCount: flagged,
    stalled: stalled,
    nextTaskId: nextTask ? idOf(nextTask) : null,
    nextTaskName: nextTask ? nextTask.name : null,
    url: urlFor("project", id)
  };
  if (opts.output === "ids") return {id: id, name: project.name, type: "project"};
  if (!detailed) return item;
  item.note = project.note || "";
  item.estimatedMinutes = project.estimatedMinutes;
  item.completedByChildren = !!project.completedByChildren;
  item.plannedDate = formatDate(plannedDateOf(project));
  item.reviewInterval = {
    steps: project.reviewInterval.steps,
    unit: String(project.reviewInterval.unit)
  };
  item.repetition = serializeRepetition(project.repetitionRule);
  item.tags = project.tags.map(function(t) { return serializeTagRef(t, true); });
  item.attachments = serializeAttachments(project);
  return item;
}

function serializeFolder(folder, opts) {
  opts = opts || {};
  var id = idOf(folder);
  var parent = folder.parent;
  var item = {
    id: id,
    type: "folder",
    name: folder.name,
    status: folderStatusName(folder.status),
    parentId: parent ? idOf(parent) : null,
    parentName: parent ? parent.name : null,
    projectCount: folder.projects.length,
    childFolderCount: folder.folders.length,
    url: urlFor("folder", id)
  };
  if (opts.output === "detailed") {
    item.projects = folder.projects.map(function(p) {
      return {id: idOf(p), name: p.name, status: projectStatusName(p.status)};
    });
    item.folders = folder.folders.map(function(f) {
      return {id: idOf(f), name: f.name, status: folderStatusName(f.status)};
    });
  }
  return item;
}

function serializeTag(tag, opts) {
  opts = opts || {};
  var id = idOf(tag);
  var item = {
    id: id,
    type: "tag",
    name: tag.name,
    path: tagPath(tag),
    status: tagStatusName(tag.status),
    allowsNextAction: !!tag.allowsNextAction,
    parentId: tag.parent ? idOf(tag.parent) : null,
    childCount: tag.tags.length,
    remainingTaskCount: tag.remainingTasks.length,
    url: urlFor("tag", id)
  };
  if (opts.output === "detailed") {
    item.ancestorIds = tagAncestorIds(tag);
    item.children = tag.tags.map(function(t) {
      return {id: idOf(t), name: t.name, status: tagStatusName(t.status)};
    });
  }
  return item;
}

function resolveUnique(kind, id, name, list, nameOf) {
  if (id) {
    var found = null;
    if (kind === "task") found = Task.byIdentifier(id);
    else if (kind === "project") found = Project.byIdentifier(id);
    else if (kind === "folder") found = Folder.byIdentifier(id);
    else if (kind === "tag") found = Tag.byIdentifier(id);
    if (!found) fail("OF_NOT_FOUND", kind + " not found: " + id, {id: id, kind: kind});
    return found;
  }
  if (!name) fail("OF_VALIDATION", "Provide " + kind + "Id or " + kind + "Name");
  var matches = [];
  for (var i = 0; i < list.length; i++) {
    if (nameOf(list[i]) === name) matches.push(list[i]);
  }
  if (matches.length === 0) fail("OF_NOT_FOUND", kind + " not found: " + name, {name: name, kind: kind});
  if (matches.length > 1) {
    fail("OF_AMBIGUOUS", "Multiple " + kind + "s named " + JSON.stringify(name) + "; use an id", {
      name: name,
      kind: kind,
      ids: matches.map(idOf)
    });
  }
  return matches[0];
}

function resolveTask(id, name) {
  return resolveUnique("task", id, name, flattenedTasks.filter(isActionTask), function(t) { return t.name; });
}

function resolveProject(id, name) {
  return resolveUnique("project", id, name, flattenedProjects, function(p) { return p.name; });
}

function resolveFolder(id, name) {
  return resolveUnique("folder", id, name, flattenedFolders, function(f) { return f.name; });
}

function resolveTag(id, name, exact) {
  if (id) return resolveUnique("tag", id, null, flattenedTags, function(t) { return t.name; });
  if (!name) fail("OF_VALIDATION", "Provide tagId or tagName");
  var needle = exact === false ? name.toLowerCase() : name;
  var matches = [];
  for (var i = 0; i < flattenedTags.length; i++) {
    var tag = flattenedTags[i];
    if (exact === false) {
      if (tag.name.toLowerCase().indexOf(needle) >= 0) matches.push(tag);
    } else if (tag.name === name) {
      matches.push(tag);
    }
  }
  if (matches.length === 0) fail("OF_NOT_FOUND", "Tag not found: " + name, {name: name});
  if (matches.length > 1 && exact !== false) {
    fail("OF_AMBIGUOUS", "Multiple tags named " + JSON.stringify(name) + "; use tagId", {
      name: name,
      ids: matches.map(idOf)
    });
  }
  return matches[0];
}

function resolveTags(ids, names) {
  var tags = [];
  var seen = {};
  (ids || []).forEach(function(id) {
    var tag = resolveTag(id, null, true);
    if (!seen[idOf(tag)]) {
      seen[idOf(tag)] = true;
      tags.push(tag);
    }
  });
  (names || []).forEach(function(name) {
    var tag = resolveTag(null, name, true);
    if (!seen[idOf(tag)]) {
      seen[idOf(tag)] = true;
      tags.push(tag);
    }
  });
  return tags;
}

function applyTags(obj, tags) {
  tags.forEach(function(tag) {
    var parent = tag.parent;
    var exclusive = false;
    if (parent) {
      try { exclusive = parent.mutuallyExclusive === true; } catch (e) { exclusive = false; }
      if (exclusive) {
        parent.tags.forEach(function(sib) {
          if (idOf(sib) !== idOf(tag)) obj.removeTag(sib);
        });
      }
    }
    obj.addTag(tag);
  });
}

function paginate(items, p) {
  var limit = Math.max(1, Math.min(Number(p.limit) || 50, 200));
  var cursor = p.cursor || null;
  var start = 0;
  if (cursor) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === cursor) {
        start = i + 1;
        break;
      }
    }
  }
  var slice = items.slice(start, start + limit);
  var next = start + limit < items.length ? slice[slice.length - 1].id : null;
  return {
    items: slice,
    totalCount: items.length,
    returnedCount: slice.length,
    truncated: next !== null,
    nextCursor: next,
    limit: limit
  };
}

function sortTasks(tasks, sortBy) {
  var key = sortBy || "library";
  // Perspective / library order is already the OmniFocus visual order.
  // Do not fall through to id sort — that looks random in the dashboard.
  if (key === "library") return tasks.slice();
  var copy = tasks.slice();
  function cmpDate(a, b) {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return a.getTime() - b.getTime();
  }
  copy.sort(function(a, b) {
    var result = 0;
    if (key === "dueDate") result = cmpDate(a.effectiveDueDate, b.effectiveDueDate);
    else if (key === "deferDate") result = cmpDate(a.effectiveDeferDate, b.effectiveDeferDate);
    else if (key === "plannedDate") result = cmpDate(plannedDateOf(a), plannedDateOf(b));
    else if (key === "name") result = a.name.localeCompare(b.name);
    else if (key === "flagged") result = (b.effectiveFlagged ? 1 : 0) - (a.effectiveFlagged ? 1 : 0);
    else if (key === "estimatedMinutes") {
      var ea = a.estimatedMinutes;
      var eb = b.estimatedMinutes;
      if (ea == null && eb == null) result = 0;
      else if (ea == null) result = 1;
      else if (eb == null) result = -1;
      else result = ea - eb;
    }
    if (result === 0) result = idOf(a) < idOf(b) ? -1 : idOf(a) > idOf(b) ? 1 : 0;
    return result;
  });
  return copy;
}

function nestTasks(serialized, originals, depth) {
  var byId = {};
  serialized.forEach(function(item, i) {
    item.children = [];
    byId[item.id] = {item: item, task: originals[i]};
  });
  var roots = [];
  serialized.forEach(function(item, i) {
    var task = originals[i];
    var parent = task.parent;
    var parentId = parent && isActionTask(parent) ? idOf(parent) : null;
    if (parentId && byId[parentId]) byId[parentId].item.children.push(item);
    else roots.push(item);
  });
  function trim(node, remaining) {
    if (remaining === 0) {
      node.children = [];
      return;
    }
    (node.children || []).forEach(function(child) { trim(child, remaining - 1); });
  }
  if (depth !== undefined && depth !== null) {
    roots.forEach(function(node) { trim(node, depth); });
  }
  return roots;
}
