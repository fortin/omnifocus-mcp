function setRepetitionOn(obj, spec) {
  if (!spec) return;
  if (spec.clear) {
    obj.repetitionRule = null;
    return;
  }
  var ruleString = spec.ruleString;
  if (!ruleString) fail("OF_VALIDATION", "repetition.ruleString is required");
  var method = Task.RepetitionMethod.DueDate;
  var methodName = spec.method || spec.scheduleType || "DueDate";
  if (methodName === "DeferUntilDate" || methodName === "Defer") method = Task.RepetitionMethod.DeferUntilDate;
  else if (methodName === "Fixed") method = Task.RepetitionMethod.Fixed;
  else if (methodName === "None") method = Task.RepetitionMethod.None;
  var rule = null;
  try {
    rule = new Task.RepetitionRule(
      ruleString,
      null,
      spec.scheduleType || null,
      spec.anchorDateKey || null,
      spec.catchUpAutomatically === true
    );
  } catch (e) {
    rule = new Task.RepetitionRule(ruleString, method);
  }
  obj.repetitionRule = rule;
}

function applyTaskFields(task, p) {
  if (p.note != null) task.note = p.note;
  if (p.flagged != null) task.flagged = !!p.flagged;
  if (p.sequential != null) task.sequential = !!p.sequential;
  if (p.completedByChildren != null) task.completedByChildren = !!p.completedByChildren;
  if (p.estimatedMinutes !== undefined) task.estimatedMinutes = p.estimatedMinutes;
  if (p.dueDate !== undefined) task.dueDate = p.dueDate ? parseDate(p.dueDate) : null;
  if (p.deferDate !== undefined) task.deferDate = p.deferDate ? parseDate(p.deferDate) : null;
  if (p.plannedDate !== undefined) setPlannedDate(task, p.plannedDate ? parseDate(p.plannedDate) : null);
  if (p.clear) {
    p.clear.forEach(function(field) {
      if (field === "dueDate") task.dueDate = null;
      else if (field === "deferDate") task.deferDate = null;
      else if (field === "plannedDate") setPlannedDate(task, null);
      else if (field === "note") task.note = "";
      else if (field === "estimatedMinutes") task.estimatedMinutes = null;
    });
  }
  if (p.tags || p.tagIds || p.tagNames) {
    if (p.replaceTags) task.clearTags();
    applyTags(task, resolveTags(p.tagIds, p.tags || p.tagNames));
  }
  if (p.repetition) setRepetitionOn(task, p.repetition);
}

function applyProjectFields(project, p) {
  if (p.note != null) project.note = p.note;
  if (p.flagged != null) project.flagged = !!p.flagged;
  if (p.sequential != null) project.sequential = !!p.sequential;
  if (p.singleton != null) project.containsSingletonActions = !!p.singleton;
  if (p.completedByChildren != null) project.completedByChildren = !!p.completedByChildren;
  if (p.estimatedMinutes !== undefined) project.estimatedMinutes = p.estimatedMinutes;
  if (p.dueDate !== undefined) project.dueDate = p.dueDate ? parseDate(p.dueDate) : null;
  if (p.deferDate !== undefined) project.deferDate = p.deferDate ? parseDate(p.deferDate) : null;
  if (p.plannedDate !== undefined) setPlannedDate(project, p.plannedDate ? parseDate(p.plannedDate) : null);
  if (p.status) {
    var map = {
      Active: Project.Status.Active,
      OnHold: Project.Status.OnHold,
      Done: Project.Status.Done,
      Dropped: Project.Status.Dropped
    };
    if (!map[p.status]) fail("OF_VALIDATION", "Unknown project status: " + p.status);
    project.status = map[p.status];
  }
  if (p.reviewInterval) {
    var interval = project.reviewInterval;
    if (p.reviewInterval.steps != null) interval.steps = p.reviewInterval.steps;
    if (p.reviewInterval.unit) interval.unit = p.reviewInterval.unit;
    project.reviewInterval = interval;
  }
  if (p.clear) {
    p.clear.forEach(function(field) {
      if (field === "dueDate") project.dueDate = null;
      else if (field === "deferDate") project.deferDate = null;
      else if (field === "note") project.note = "";
    });
  }
  if (p.tags || p.tagIds || p.tagNames) {
    if (p.replaceTags) project.clearTags();
    applyTags(project, resolveTags(p.tagIds, p.tags || p.tagNames));
  }
  if (p.repetition) setRepetitionOn(project, p.repetition);
}

function destinationForTask(p) {
  var destCount = 0;
  if (p.projectId || p.projectName) destCount++;
  if (p.parentTaskId || p.parentTaskName) destCount++;
  if (p.moveToInbox) destCount++;
  if (destCount > 1) fail("OF_VALIDATION", "Provide only one destination: project, parent task, or inbox");
  if (p.parentTaskId || p.parentTaskName) return resolveTask(p.parentTaskId, p.parentTaskName);
  if (p.projectId || p.projectName) return resolveProject(p.projectId, p.projectName);
  if (p.moveToInbox) return inbox.ending;
  return null;
}

function wouldCycle(task, dest) {
  if (!dest || dest === inbox.ending) return false;
  var destTask = dest instanceof Project ? dest.task : dest;
  if (!(destTask instanceof Task)) return false;
  var current = destTask;
  while (current) {
    if (idOf(current) === idOf(task)) return true;
    current = current.parent;
  }
  return false;
}

function addTask(p) {
  if (p.parentTaskId || p.parentTaskName) {
    if (p.projectId || p.projectName) {
      fail("OF_VALIDATION", "Subtasks inherit their project; do not also pass a project");
    }
  }
  var dest = destinationForTask(p);
  var task = dest ? new Task(p.name, dest) : new Task(p.name);
  applyTaskFields(task, p);
  var created = [serializeTask(task, {output: "detailed"})];
  (p.children || []).forEach(function(child) {
    child.parentTaskId = idOf(task);
    created = created.concat(addTask(child).items);
  });
  return {items: created, createdCount: created.length};
}

function addProject(p) {
  var position = null;
  if (p.folderId || p.folderName) position = resolveFolder(p.folderId, p.folderName);
  var project = position ? new Project(p.name, position) : new Project(p.name);
  applyProjectFields(project, p);
  var createdTasks = [];
  (p.tasks || []).forEach(function(spec) {
    spec.projectId = idOf(project);
    createdTasks = createdTasks.concat(addTask(spec).items);
  });
  return {project: serializeProject(project, {output: "detailed"}), tasks: createdTasks};
}

function createNode(spec, parent) {
  var task = new Task(spec.name, parent);
  applyTaskFields(task, spec);
  (spec.children || []).forEach(function(child) { createNode(child, task); });
  return task;
}

function countOutline(spec) {
  var n = 1;
  (spec.children || []).forEach(function(child) { n += countOutline(child); });
  return n;
}

function outlineDepth(spec) {
  var max = 1;
  (spec.children || []).forEach(function(child) {
    max = Math.max(max, 1 + outlineDepth(child));
  });
  return max;
}

function createProjectFromOutline(p) {
  var projectSpec = p.project || p;
  if (!projectSpec.name) fail("OF_VALIDATION", "project.name is required");
  var tasks = projectSpec.tasks || [];
  var total = 0;
  var depth = 0;
  tasks.forEach(function(t) {
    total += countOutline(t);
    depth = Math.max(depth, outlineDepth(t));
  });
  if (total > 200) fail("OF_VALIDATION", "Outline exceeds 200 tasks", {taskCount: total});
  if (depth > 8) fail("OF_VALIDATION", "Outline exceeds 8 levels", {depth: depth});
  if (projectSpec.folderId) resolveFolder(projectSpec.folderId, null);
  if (projectSpec.tagIds) resolveTags(projectSpec.tagIds, null);
  var created = null;
  try {
    created = addProject(projectSpec);
    var readBack = Project.byIdentifier(created.project.id);
    if (!readBack) fail("OF_SCRIPT_ERROR", "Project was not readable after create");
    return {project: serializeProject(readBack, {output: "detailed"}), taskCount: total, verified: true};
  } catch (e) {
    try { if (document.canUndo) document.undo(); } catch (e2) {}
    throw e;
  }
}

function editItem(p) {
  var kind = p.itemType || p.type || "task";
  if (kind === "task") {
    var task = resolveTask(p.id || p.taskId, p.name || p.taskName);
    if (p.newName) task.name = p.newName;
    var destPayload = {
      projectId: p.newProjectId || p.projectId,
      projectName: p.newProjectName || p.projectName,
      parentTaskId: p.newParentTaskId || p.parentTaskId,
      parentTaskName: p.newParentTaskName || p.parentTaskName,
      moveToInbox: p.moveToInbox
    };
    var dest = destinationForTask(destPayload);
    if (dest) {
      if (wouldCycle(task, dest)) fail("OF_VALIDATION", "Move would create a cycle");
      moveTasks([task], dest);
    }
    applyTaskFields(task, p);
    return {item: serializeTask(task, {output: "detailed"})};
  }
  if (kind === "project") {
    var project = resolveProject(p.id || p.projectId, p.name || p.projectName);
    if (p.newName) project.name = p.newName;
    if (p.newFolderId || p.newFolderName) {
      var folder = resolveFolder(p.newFolderId, p.newFolderName);
      moveSections([project], folder);
    }
    applyProjectFields(project, p);
    return {item: serializeProject(project, {output: "detailed"})};
  }
  fail("OF_VALIDATION", "itemType must be task or project");
}

function completeItems(p) {
  var action = p.action || "complete";
  var results = [];
  (p.ids || []).forEach(function(id) {
    var task = Task.byIdentifier(id);
    var project = task ? null : Project.byIdentifier(id);
    if (!task && !project) fail("OF_NOT_FOUND", "Item not found: " + id, {id: id});
    var target = task || project;
    var before = task ? !!task.completed : !!project.completed;
    if (action === "complete") {
      if (before) {
        results.push({id: id, status: "unchanged", completed: true});
        return;
      }
      var generated = target.markComplete(p.completionDate ? parseDate(p.completionDate) : null);
      var info = {id: id, status: "completed", completed: true};
      if (generated && idOf(generated) !== id) info.generatedTaskId = idOf(generated);
      if (task && task.repetitionRule) {
        try { info.nextOccurrence = formatDate(task.repetitionRule.firstDateAfterDate(new Date())); } catch (e) {}
      }
      results.push(info);
    } else if (action === "incomplete") {
      if (!before) {
        results.push({id: id, status: "unchanged", completed: false});
        return;
      }
      target.markIncomplete();
      results.push({id: id, status: "reopened", completed: false});
    } else if (action === "drop") {
      target.drop(p.allOccurrences === true);
      results.push({id: id, status: "dropped"});
    } else {
      fail("OF_VALIDATION", "Unknown complete action: " + action);
    }
  });
  return {results: results, count: results.length};
}

function moveItems(p) {
  var results = [];
  (p.moves || []).forEach(function(move) {
    var task = resolveTask(move.taskId, move.taskName);
    var dest = destinationForTask(move);
    if (!dest) fail("OF_VALIDATION", "Each move needs a project, parent task, or inbox destination");
    if (wouldCycle(task, dest)) fail("OF_VALIDATION", "Move would create a cycle", {taskId: idOf(task)});
    moveTasks([task], dest);
    results.push(serializeTask(task, {output: "compact"}));
  });
  return {results: results, count: results.length};
}

function previewDelete(id) {
  var task = Task.byIdentifier(id);
  if (task && isActionTask(task)) {
    return {
      id: id,
      type: "task",
      name: task.name,
      descendantTaskCount: task.flattenedTasks.filter(isActionTask).length
    };
  }
  var project = Project.byIdentifier(id);
  if (project) {
    return {
      id: id,
      type: "project",
      name: project.name,
      descendantTaskCount: project.flattenedTasks.filter(isActionTask).length
    };
  }
  var folder = Folder.byIdentifier(id);
  if (folder) {
    var projects = [];
    function collectProjects(node) {
      node.projects.forEach(function(proj) { projects.push(proj); });
      node.folders.forEach(collectProjects);
    }
    collectProjects(folder);
    var taskCount = 0;
    projects.forEach(function(proj) {
      taskCount += proj.flattenedTasks.filter(isActionTask).length;
    });
    return {
      id: id,
      type: "folder",
      name: folder.name,
      descendantProjectCount: projects.length,
      descendantTaskCount: taskCount,
      warning: "Deleting a folder permanently deletes the projects and tasks inside it."
    };
  }
  fail("OF_NOT_FOUND", "Item not found: " + id, {id: id});
}

function removeItems(p) {
  if (p.previewOnly) {
    return {preview: (p.ids || []).map(previewDelete)};
  }
  var removed = [];
  (p.ids || []).forEach(function(id) {
    var preview = previewDelete(id);
    var obj = Task.byIdentifier(id) || Project.byIdentifier(id) || Folder.byIdentifier(id);
    deleteObject(obj);
    removed.push(preview);
  });
  (p.ids || []).forEach(function(id) {
    if (Task.byIdentifier(id) || Project.byIdentifier(id) || Folder.byIdentifier(id)) {
      fail("OF_SCRIPT_ERROR", "Delete did not remove " + id, {id: id});
    }
  });
  return {removed: removed, count: removed.length};
}

function duplicateItems(p) {
  var results = [];
  (p.ids || []).forEach(function(id) {
    var task = Task.byIdentifier(id);
    if (task) {
      var copies = duplicateTasks([task], p.includeSubtasks === false ? task.after : task.after);
      var copy = copies[0];
      if (p.newName) copy.name = p.newName;
      results.push(serializeTask(copy, {output: "detailed"}));
      return;
    }
    var project = Project.byIdentifier(id);
    if (project) {
      var dest = project.parentFolder || project.after;
      var copiesP = duplicateSections([project], dest);
      var copyP = copiesP[0];
      if (p.newName) copyP.name = p.newName;
      results.push(serializeProject(copyP, {output: "detailed"}));
      return;
    }
    fail("OF_NOT_FOUND", "Item not found: " + id, {id: id});
  });
  return {items: results, count: results.length};
}

function setRepetition(p) {
  var task = resolveTask(p.taskId || p.id, p.taskName || p.name);
  var previous = serializeRepetition(task.repetitionRule);
  try {
    setRepetitionOn(task, p.clear ? {clear: true} : p);
    var current = serializeRepetition(task.repetitionRule);
    if (!p.clear && p.ruleString && current && current.ruleString !== p.ruleString) {
      fail("OF_SCRIPT_ERROR", "Repetition rule did not save as requested");
    }
    return {id: idOf(task), previous: previous, current: current};
  } catch (e) {
    try { if (previous) setRepetitionOn(task, previous); else task.repetitionRule = null; } catch (e2) {}
    throw e;
  }
}

function manageFolder(p) {
  var action = p.action;
  if (action === "add") {
    var parent = (p.parentFolderId || p.parentFolderName) ? resolveFolder(p.parentFolderId, p.parentFolderName) : null;
    var folder = parent ? new Folder(p.name, parent) : new Folder(p.name);
    if (p.status === "Dropped") folder.status = Folder.Status.Dropped;
    return {folder: serializeFolder(folder, {output: "detailed"})};
  }
  var folder = resolveFolder(p.folderId || p.id, p.folderName || p.name);
  if (action === "edit") {
    if (p.newName) folder.name = p.newName;
    if (p.parentFolderId || p.parentFolderName) {
      var dest = resolveFolder(p.parentFolderId, p.parentFolderName);
      var current = dest;
      while (current) {
        if (idOf(current) === idOf(folder)) fail("OF_VALIDATION", "Folder move would create a cycle");
        current = current.parent;
      }
      moveSections([folder], dest);
    }
    if (p.status === "Active") folder.status = Folder.Status.Active;
    if (p.status === "Dropped") folder.status = Folder.Status.Dropped;
    return {folder: serializeFolder(folder, {output: "detailed"})};
  }
  if (action === "remove") {
    var preview = previewDelete(idOf(folder));
    if (p.previewOnly) return {preview: [preview]};
    deleteObject(folder);
    return {removed: [preview]};
  }
  fail("OF_VALIDATION", "Unknown folder action: " + action);
}

function manageTag(p) {
  var action = p.action;
  if (action === "add") {
    var parent = (p.parentTagId || p.parentTagName) ? resolveTag(p.parentTagId, p.parentTagName, true) : null;
    var tag = parent ? new Tag(p.name, parent) : new Tag(p.name);
    if (p.allowsNextAction != null) tag.allowsNextAction = !!p.allowsNextAction;
    if (p.status === "OnHold") tag.status = Tag.Status.OnHold;
    if (p.status === "Dropped") tag.status = Tag.Status.Dropped;
    return {tag: serializeTag(tag, {output: "detailed"})};
  }
  var tag = resolveTag(p.tagId || p.id, p.tagName || p.name, true);
  if (action === "edit") {
    if (p.newName) tag.name = p.newName;
    if (p.allowsNextAction != null) tag.allowsNextAction = !!p.allowsNextAction;
    if (p.status === "Active") tag.status = Tag.Status.Active;
    if (p.status === "OnHold") tag.status = Tag.Status.OnHold;
    if (p.status === "Dropped") tag.status = Tag.Status.Dropped;
    if (p.parentTagId || p.parentTagName) {
      var dest = resolveTag(p.parentTagId, p.parentTagName, true);
      var current = dest;
      while (current) {
        if (idOf(current) === idOf(tag)) fail("OF_VALIDATION", "Tag move would create a cycle");
        current = current.parent;
      }
      moveTags([tag], dest);
    }
    return {tag: serializeTag(tag, {output: "detailed"})};
  }
  if (action === "remove") {
    deleteObject(tag);
    return {removed: {id: p.tagId || idOf(tag), type: "tag"}};
  }
  fail("OF_VALIDATION", "Unknown tag action: " + action);
}

function managePerspective(p) {
  var persp = p.perspectiveId
    ? Perspective.Custom.byIdentifier(p.perspectiveId)
    : Perspective.Custom.byName(p.perspectiveName);
  if (!persp) fail("OF_NOT_FOUND", "Custom perspective not found");
  var previousRules = null;
  var previousAgg = null;
  try { previousRules = persp.archivedFilterRules; } catch (e) {}
  try { previousAgg = persp.archivedTopLevelFilterAggregation; } catch (e) {}
  try {
    if (p.rules) persp.archivedFilterRules = p.rules;
    if (p.aggregation) persp.archivedTopLevelFilterAggregation = p.aggregation;
    return queryPerspectives({action: "get", perspectiveId: persp.identifier});
  } catch (e) {
    try {
      if (previousRules) persp.archivedFilterRules = previousRules;
      if (previousAgg) persp.archivedTopLevelFilterAggregation = previousAgg;
    } catch (e2) {}
    throw e;
  }
}

function manageNotifications(p) {
  var action = p.action || "list";
  var task = resolveTask(p.taskId, p.taskName);
  if (action === "list") {
    return {taskId: idOf(task), notifications: task.notifications.map(serializeNotification)};
  }
  if (action === "add") {
    var info = p.absoluteDate ? parseDate(p.absoluteDate) : (p.minutesBeforeDue != null ? -Math.abs(p.minutesBeforeDue) : p.offsetMinutes);
    if (info == null) fail("OF_VALIDATION", "Provide absoluteDate or minutesBeforeDue");
    var n = task.addNotification(info);
    return {notification: serializeNotification(n)};
  }
  if (action === "remove") {
    var list = task.notifications;
    var target = null;
    for (var i = 0; i < list.length; i++) {
      if (idOf(list[i]) === p.notificationId) target = list[i];
    }
    if (!target) fail("OF_NOT_FOUND", "Notification not found: " + p.notificationId);
    task.removeNotification(target);
    return {removed: p.notificationId};
  }
  fail("OF_VALIDATION", "Unknown notification action: " + action);
}

function appendNote(p) {
  var text = p.text;
  if (!text) fail("OF_VALIDATION", "text is required");
  if (p.itemType === "project" || p.projectId || p.projectName) {
    var project = resolveProject(p.id || p.projectId, p.name || p.projectName);
    project.appendStringToNote(text);
    return {id: idOf(project), type: "project", note: project.note};
  }
  var task = resolveTask(p.id || p.taskId, p.name || p.taskName);
  task.appendStringToNote(text);
  return {id: idOf(task), type: "task", note: task.note};
}

function markReviewed(p) {
  var now = p.reviewDate ? parseDate(p.reviewDate) : new Date();
  var results = [];
  (p.ids || []).forEach(function(id) {
    var project = Project.byIdentifier(id);
    if (!project) fail("OF_NOT_FOUND", "Project not found: " + id, {id: id});
    var previous = formatDate(project.lastReviewDate);
    project.lastReviewDate = now;
    results.push({
      id: id,
      name: project.name,
      previousLastReviewDate: previous,
      lastReviewDate: formatDate(project.lastReviewDate),
      nextReviewDate: formatDate(project.nextReviewDate)
    });
  });
  return {results: results, reviewedAt: formatDate(now)};
}

function session(p) {
  var action = p.action;
  if (action === "undo") {
    if (!document.canUndo) fail("OF_UNSUPPORTED", "Nothing to undo");
    document.undo();
    return {undone: true, canUndo: !!document.canUndo, canRedo: !!document.canRedo};
  }
  if (action === "redo") {
    if (!document.canRedo) fail("OF_UNSUPPORTED", "Nothing to redo");
    document.redo();
    return {redone: true, canUndo: !!document.canUndo, canRedo: !!document.canRedo};
  }
  if (action === "clean_up") {
    cleanUp();
    return {cleaned: true};
  }
  if (action === "reveal") {
    var kind = p.itemType || "task";
    var id = p.id;
    if (!id) {
      if (kind === "task") id = idOf(resolveTask(null, p.name));
      else if (kind === "project") id = idOf(resolveProject(null, p.name));
      else if (kind === "folder") id = idOf(resolveFolder(null, p.name));
    }
    URL.fromString("omnifocus:///" + kind + "/" + id).open();
    return {revealed: true, url: "omnifocus:///" + kind + "/" + id};
  }
  fail("OF_VALIDATION", "Unknown session action: " + action);
}

function addItems(p) {
  var created = [];
  var byName = {};
  (p.items || []).forEach(function(item) {
    var type = item.type || "task";
    if (type === "project") {
      var result = addProject(item);
      created.push(result.project);
      byName[result.project.name] = result.project.id;
    } else {
      if ((item.parentTaskName && !item.parentTaskId) && byName[item.parentTaskName]) {
        item.parentTaskId = byName[item.parentTaskName];
        delete item.parentTaskName;
      }
      var added = addTask(item);
      added.items.forEach(function(t) {
        created.push(t);
        byName[t.name] = t.id;
      });
    }
  });
  return {items: created, count: created.length};
}
