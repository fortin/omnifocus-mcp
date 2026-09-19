function inRange(date, start, end) {
  if (!date) return false;
  if (start && date < start) return false;
  if (end && date >= end) return false;
  return true;
}

function taskMatches(task, p, now) {
  var hideCompleted = p.hideCompleted !== false;
  if (!isActionTask(task)) return false;
  if (hideCompleted && (task.completed || task.dropDate)) return false;
  if (p.includeCompleted === false && task.completed) return false;
  if (p.flagged === true && !task.effectiveFlagged) return false;
  if (p.flagged === false && task.effectiveFlagged) return false;
  if (p.inInbox === true && !task.inInbox) return false;
  if (p.inInbox === false && task.inInbox) return false;
  if (p.hasNote === true && !(task.note && task.note.trim())) return false;
  if (p.hasNote === false && task.note && task.note.trim()) return false;
  if (p.hasEstimate === true && task.estimatedMinutes == null) return false;
  if (p.hasEstimate === false && task.estimatedMinutes != null) return false;
  if (p.estimateMin != null && (task.estimatedMinutes == null || task.estimatedMinutes < p.estimateMin)) return false;
  if (p.estimateMax != null && (task.estimatedMinutes == null || task.estimatedMinutes > p.estimateMax)) return false;
  if (p.isRepeating === true && !task.repetitionRule) return false;
  if (p.isRepeating === false && task.repetitionRule) return false;

  if (p.taskStatus && p.taskStatus.length) {
    var status = taskStatusName(task.taskStatus);
    if (p.taskStatus.indexOf(status) < 0) return false;
  }

  var project = task.containingProject;
  if (p.projectId) {
    if (!project || idOf(project) !== p.projectId) return false;
  }
  if (p.projectName) {
    if (!project || project.name !== p.projectName) return false;
  }
  if (p.folderId) {
    if (!project || !project.parentFolder || idOf(project.parentFolder) !== p.folderId) return false;
  }

  if (p.tagId || p.tagName || (p.tagIds && p.tagIds.length) || (p.tagNames && p.tagNames.length)) {
    var wantedIds = {};
    var wantedNames = {};
    if (p.tagId) wantedIds[p.tagId] = true;
    (p.tagIds || []).forEach(function(id) { wantedIds[id] = true; });
    if (p.tagName) wantedNames[p.tagName.toLowerCase()] = true;
    (p.tagNames || []).forEach(function(n) { wantedNames[n.toLowerCase()] = true; });
    var tags = task.tags;
    var hit = false;
    for (var i = 0; i < tags.length; i++) {
      if (wantedIds[idOf(tags[i])] || wantedNames[tags[i].name.toLowerCase()]) {
        hit = true;
        break;
      }
    }
    if (!hit) return false;
  }

  if (p.search) {
    var q = String(p.search).toLowerCase();
    var hay = (task.name + "\n" + (task.note || "")).toLowerCase();
    if (hay.indexOf(q) < 0) return false;
  }

  var today = startOfDay(now);
  var tomorrow = addDays(today, 1);
  var weekEnd = addDays(today, 7);
  var monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  var due = task.effectiveDueDate;
  var defer = task.effectiveDeferDate;
  var planned = plannedDateOf(task);
  var completed = task.completionDate;

  if (p.dueBefore && (!due || due >= parseDate(p.dueBefore))) return false;
  if (p.dueAfter && (!due || due < parseDate(p.dueAfter))) return false;
  if (p.deferBefore && (!defer || defer >= parseDate(p.deferBefore))) return false;
  if (p.deferAfter && (!defer || defer < parseDate(p.deferAfter))) return false;
  if (p.plannedBefore && (!planned || planned >= parseDate(p.plannedBefore))) return false;
  if (p.plannedAfter && (!planned || planned < parseDate(p.plannedAfter))) return false;

  if (p.dueToday && !inRange(due, today, tomorrow)) return false;
  if (p.dueThisWeek && !inRange(due, today, weekEnd)) return false;
  if (p.dueThisMonth && !inRange(due, today, monthEnd)) return false;
  if (p.overdue && !(due && due < now && !task.completed)) return false;
  if (p.plannedToday && !inRange(planned, today, tomorrow)) return false;
  if (p.completedToday) {
    if (!completed || !inRange(completed, today, tomorrow)) return false;
  }
  if (p.availableOnly) {
    var st = task.taskStatus;
    if (st !== Task.Status.Available && st !== Task.Status.Next && st !== Task.Status.DueSoon && st !== Task.Status.Overdue) return false;
  }
  return true;
}

function collectSourceTasks(p, now) {
  var source = p.source || "filter";
  var hideCompleted = p.hideCompleted !== false;
  var days = p.days == null ? 7 : Number(p.days);
  var today = startOfDay(now);
  var horizon = addDays(today, days + 1);

  if (source === "id") {
    return [resolveTask(p.taskId || p.id, p.taskName || p.name)];
  }
  if (source === "inbox") {
    var inboxTasks = [];
    for (var i = 0; i < inbox.length; i++) {
      var t = inbox[i];
      if (hideCompleted && t.completed) continue;
      inboxTasks.push(t);
    }
    return inboxTasks;
  }
  if (source === "flagged") {
    return flattenedTasks.filter(function(t) {
      return isActionTask(t) && t.effectiveFlagged && (!hideCompleted || (!t.completed && !t.dropDate));
    });
  }
  if (source === "available") {
    return flattenedTasks.filter(function(t) {
      if (!isActionTask(t) || t.completed || t.dropDate) return false;
      var st = t.taskStatus;
      return st === Task.Status.Available || st === Task.Status.Next || st === Task.Status.DueSoon || st === Task.Status.Overdue;
    });
  }
  if (source === "overdue") {
    return flattenedTasks.filter(function(t) {
      return isActionTask(t) && !t.completed && !t.dropDate && t.effectiveDueDate && t.effectiveDueDate < now;
    });
  }
  if (source === "completed_today") {
    return flattenedTasks.filter(function(t) {
      return isActionTask(t) && t.completionDate && inRange(t.completionDate, today, addDays(today, 1));
    });
  }
  if (source === "forecast") {
    return flattenedTasks.filter(function(t) {
      if (!isActionTask(t) || (hideCompleted && (t.completed || t.dropDate))) return false;
      var due = t.effectiveDueDate;
      var defer = t.effectiveDeferDate;
      var planned = plannedDateOf(t);
      if (due && due < horizon) return true;
      if (defer && defer >= today && defer < horizon) return true;
      if (planned && planned >= today && planned < horizon) return true;
      if (t.effectiveFlagged) return true;
      return false;
    });
  }
  if (source === "tag") {
    var tag = resolveTag(p.tagId, p.tagName, p.exactMatch !== false);
    var tagged = p.availableOnly ? tag.availableTasks : tag.remainingTasks;
    if (!hideCompleted) tagged = tag.tasks;
    return tagged.filter(isActionTask);
  }
  if (source === "project") {
    var project = resolveProject(p.projectId, p.projectName);
    return project.flattenedTasks.filter(function(t) {
      return isActionTask(t) && (!hideCompleted || (!t.completed && !t.dropDate));
    });
  }
  if (source === "custom") {
    return tasksFromPerspective(p);
  }
  if (source === "search" || source === "filter") {
    var out = [];
    flattenedTasks.forEach(function(t) {
      if (taskMatches(t, p, now)) out.push(t);
    });
    return out;
  }
  fail("OF_VALIDATION", "Unknown source: " + source, {source: source});
}

function tasksFromPerspective(p) {
  if (!document.windows || document.windows.length === 0) {
    fail("OF_WINDOW_UNAVAILABLE", "Open an OmniFocus window to read a perspective");
  }
  var win = document.windows[0];
  var previous = win.perspective;
  var persp = null;
  if (p.perspectiveId) {
    persp = Perspective.Custom.byIdentifier(p.perspectiveId);
  } else if (p.perspectiveName) {
    persp = Perspective.Custom.byName(p.perspectiveName);
    if (!persp) {
      var builtins = {
        Inbox: Perspective.BuiltIn.Inbox,
        Projects: Perspective.BuiltIn.Projects,
        Tags: Perspective.BuiltIn.Tags,
        Forecast: Perspective.BuiltIn.Forecast,
        Flagged: Perspective.BuiltIn.Flagged,
        Review: Perspective.BuiltIn.Review
      };
      persp = builtins[p.perspectiveName] || null;
    }
  } else {
    fail("OF_VALIDATION", "Provide perspectiveName or perspectiveId");
  }
  if (!persp) fail("OF_NOT_FOUND", "Perspective not found", {name: p.perspectiveName, id: p.perspectiveId});
  var collected = [];
  try {
    win.perspective = persp;
    var content = win.content;
    if (!content) fail("OF_WINDOW_UNAVAILABLE", "Perspective has no content tree");
    function walk(node) {
      if (!node) return;
      var obj = node.object;
      if (obj instanceof Task && isActionTask(obj)) collected.push(obj);
      var children = node.children;
      if (children) {
        for (var i = 0; i < children.length; i++) walk(children[i]);
      }
    }
    if (content.rootNode) walk(content.rootNode);
    else if (content.leaves) {
      content.leaves.forEach(function(node) { walk(node); });
    }
  } catch (e) {
    if (String(e).indexOf("Pro") >= 0) {
      fail("OF_FEATURE_REQUIRES_PRO", "Custom perspectives require OmniFocus Pro");
    }
    throw e;
  } finally {
    try { win.perspective = previous; } catch (e2) {}
  }
  var seen = {};
  return collected.filter(function(t) {
    var id = idOf(t);
    if (seen[id]) return false;
    seen[id] = true;
    return true;
  });
}

function queryTasks(p) {
  var now = new Date();
  var tasks = collectSourceTasks(p, now);
  if ((p.source || "filter") !== "id") {
    tasks = tasks.filter(function(t) { return taskMatches(t, p, now); });
  }
  tasks = sortTasks(tasks, p.sortBy);
  var page = paginate(tasks.map(function(t) { return serializeTask(t, p); }), p);
  if (p.showSubtasks) {
    var originals = [];
    var serialized = [];
    tasks.forEach(function(t) {
      serialized.push(serializeTask(t, p));
      originals.push(t);
    });
    var depth = p.maxSubtaskDepth == null ? 8 : Number(p.maxSubtaskDepth);
    page.items = nestTasks(serialized, originals, depth);
    page.returnedCount = page.items.length;
  }
  page.source = p.source || "filter";
  return page;
}

function countTasks(p) {
  var now = new Date();
  var tasks = collectSourceTasks(p, now).filter(function(t) { return taskMatches(t, p, now); });
  var byStatus = {};
  var flagged = 0;
  var overdue = 0;
  var dueToday = 0;
  var estimated = 0;
  var unknownEstimate = 0;
  var today = startOfDay(now);
  var tomorrow = addDays(today, 1);
  tasks.forEach(function(t) {
    var st = taskStatusName(t.taskStatus);
    byStatus[st] = (byStatus[st] || 0) + 1;
    if (t.effectiveFlagged) flagged++;
    if (t.effectiveDueDate && t.effectiveDueDate < now && !t.completed) overdue++;
    if (inRange(t.effectiveDueDate, today, tomorrow)) dueToday++;
    if (t.estimatedMinutes == null) unknownEstimate++;
    else estimated += t.estimatedMinutes;
  });
  return {
    totalCount: tasks.length,
    byStatus: byStatus,
    flagged: flagged,
    overdue: overdue,
    dueToday: dueToday,
    estimatedMinutes: estimated,
    missingEstimateCount: unknownEstimate
  };
}

function statusInfo(p) {
  if (p.launch) {
    try { document.windows; } catch (e) {}
  }
  var now = new Date();
  var today = startOfDay(now);
  var tomorrow = addDays(today, 1);
  var inboxCount = inbox.length;
  var flagged = 0;
  var overdue = 0;
  var dueToday = 0;
  var available = 0;
  var remaining = 0;
  flattenedTasks.forEach(function(t) {
    if (!isActionTask(t)) return;
    if (t.completed || t.dropDate) return;
    remaining++;
    if (t.effectiveFlagged) flagged++;
    if (t.effectiveDueDate && t.effectiveDueDate < now) overdue++;
    if (inRange(t.effectiveDueDate, today, tomorrow)) dueToday++;
    var st = t.taskStatus;
    if (st === Task.Status.Available || st === Task.Status.Next || st === Task.Status.DueSoon || st === Task.Status.Overdue) available++;
  });
  var activeProjects = 0;
  var onHold = 0;
  var reviewDue = 0;
  var stalled = 0;
  flattenedProjects.forEach(function(proj) {
    var st = projectStatusName(proj.status);
    if (st === "Active") activeProjects++;
    if (st === "OnHold") onHold++;
    if ((st === "Active" || st === "OnHold") && proj.nextReviewDate && proj.nextReviewDate <= now) reviewDue++;
  });
  var version = null;
  try { version = app.version; } catch (e) {}
  var edition = "unknown";
  try {
    if (Perspective.Custom && Perspective.Custom.all) {
      edition = "pro";
    }
  } catch (e) {
    edition = "standard";
  }
  return {
    running: true,
    version: version,
    edition: edition,
    canUndo: !!document.canUndo,
    canRedo: !!document.canRedo,
    windowCount: document.windows ? document.windows.length : 0,
    counts: {
      inbox: inboxCount,
      remainingTasks: remaining,
      availableTasks: available,
      flagged: flagged,
      overdue: overdue,
      dueToday: dueToday,
      activeProjects: activeProjects,
      onHoldProjects: onHold,
      projectsDueForReview: reviewDue,
      folders: flattenedFolders.length,
      tags: flattenedTags.length,
      customPerspectives: (function() {
        try { return Perspective.Custom.all.length; } catch (e) { return 0; }
      })()
    }
  };
}

function queryProjects(p) {
  var now = new Date();
  var view = p.view || "all";
  var items = [];
  flattenedProjects.forEach(function(proj) {
    if (p.projectId && idOf(proj) !== p.projectId) return;
    if (p.projectName && proj.name !== p.projectName) return;
    if (p.folderId) {
      if (!proj.parentFolder || idOf(proj.parentFolder) !== p.folderId) return;
    }
    if (p.folderName) {
      if (!proj.parentFolder || proj.parentFolder.name !== p.folderName) return;
    }
    if (p.status && p.status.length && p.status.indexOf(projectStatusName(proj.status)) < 0) return;
    if (p.search) {
      var q = String(p.search).toLowerCase();
      if ((proj.name + "\n" + (proj.note || "")).toLowerCase().indexOf(q) < 0) return;
    }
    var serialized = serializeProject(proj, p);
    if (view === "due_for_review") {
      var st = serialized.status;
      if (!(st === "Active" || st === "OnHold")) return;
      if (!proj.nextReviewDate || proj.nextReviewDate > now) return;
    }
    if (view === "stalled" && !serialized.stalled) return;
    if (view === "active" && serialized.status !== "Active") return;
    items.push(serialized);
  });
  if (p.sortBy === "nextReviewDate") {
    items.sort(function(a, b) {
      if (!a.nextReviewDate && !b.nextReviewDate) return 0;
      if (!a.nextReviewDate) return 1;
      if (!b.nextReviewDate) return -1;
      return a.nextReviewDate < b.nextReviewDate ? -1 : 1;
    });
  } else if (p.sortBy === "name") {
    items.sort(function(a, b) { return a.name.localeCompare(b.name); });
  }
  var page = paginate(items, p);
  page.view = view;
  return page;
}

function queryFolders(p) {
  var items = [];
  flattenedFolders.forEach(function(folder) {
    if (p.folderId && idOf(folder) !== p.folderId) return;
    if (p.folderName && folder.name !== p.folderName) return;
    if (p.search && folder.name.toLowerCase().indexOf(String(p.search).toLowerCase()) < 0) return;
    items.push(serializeFolder(folder, p));
  });
  return paginate(items, p);
}

function queryTags(p) {
  var items = [];
  var q = p.search ? String(p.search).toLowerCase() : null;
  flattenedTags.forEach(function(tag) {
    if (p.tagId && idOf(tag) !== p.tagId) return;
    if (p.tagName && tag.name !== p.tagName) return;
    if (q && tag.name.toLowerCase().indexOf(q) < 0 && tagPath(tag).toLowerCase().indexOf(q) < 0) return;
    if (p.status && p.status.length && p.status.indexOf(tagStatusName(tag.status)) < 0) return;
    items.push(serializeTag(tag, p));
  });
  return paginate(items, p);
}

function explainRule(rule) {
  if (!rule || typeof rule !== "object") return String(rule);
  var keys = Object.keys(rule);
  if (rule.actionHasDuration) return "Has an estimated duration";
  if (rule.actionHasNoDuration) return "Has no estimated duration";
  if (rule.actionIsFlagged) return "Is flagged";
  if (rule.actionIsUnflagged) return "Is not flagged";
  if (rule.actionIsProject) return "Is a project";
  if (rule.actionIsGroup) return "Is an action group";
  if (rule.actionIsLeaf) return "Is a leaf action";
  if (rule.actionHasNoProject) return "Is in the Inbox";
  if (rule.actionRepeats) return "Repeats";
  if (rule.actionHasPlannedDate) return "Has a planned date";
  if (rule.actionMatchingSearch) return "Matches search: " + JSON.stringify(rule.actionMatchingSearch);
  if (rule.actionHasAnyOfTags) return "Has any of tags " + JSON.stringify(rule.actionHasAnyOfTags);
  if (rule.actionHasAllOfTags) return "Has all of tags " + JSON.stringify(rule.actionHasAllOfTags);
  if (rule.actionWithinFocus) return "Contained in " + JSON.stringify(rule.actionWithinFocus);
  if (rule.actionHasProjectWithStatus) return "Project status is " + rule.actionHasProjectWithStatus;
  if (rule.actionDateIsToday) return (rule.actionDateField || "date") + " is today";
  if (rule.actionDateIsYesterday) return (rule.actionDateField || "date") + " is yesterday";
  if (rule.actionDateIsTomorrow) return (rule.actionDateField || "date") + " is tomorrow";
  if (rule.aggregateType) return "Nested " + rule.aggregateType + " group";
  return keys.join(", ");
}

function queryPerspectives(p) {
  var action = p.action || "list";
  var builtins = [
    {name: "Inbox", type: "builtin"},
    {name: "Projects", type: "builtin"},
    {name: "Tags", type: "builtin"},
    {name: "Forecast", type: "builtin"},
    {name: "Flagged", type: "builtin"},
    {name: "Review", type: "builtin"}
  ];
  var customs = [];
  try {
    Perspective.Custom.all.forEach(function(persp) {
      customs.push({
        id: persp.identifier,
        name: persp.name,
        type: "custom"
      });
    });
  } catch (e) {
    fail("OF_FEATURE_REQUIRES_PRO", "Custom perspectives require OmniFocus Pro");
  }
  if (action === "list") {
    return {builtins: builtins, custom: customs, totalCount: builtins.length + customs.length};
  }
  var persp = p.perspectiveId
    ? Perspective.Custom.byIdentifier(p.perspectiveId)
    : Perspective.Custom.byName(p.perspectiveName);
  if (!persp) fail("OF_NOT_FOUND", "Custom perspective not found", {name: p.perspectiveName, id: p.perspectiveId});
  var rules = [];
  try { rules = persp.archivedFilterRules || []; } catch (e) { rules = []; }
  var aggregation = null;
  try { aggregation = persp.archivedTopLevelFilterAggregation; } catch (e) {}
  return {
    id: persp.identifier,
    name: persp.name,
    type: "custom",
    aggregation: aggregation,
    rules: rules,
    explained: (rules || []).map(explainRule)
  };
}

function readAttachment(p) {
  var task = resolveTask(p.taskId, p.taskName);
  var attachments = serializeAttachments(task);
  var wanted = attachments.filter(function(a) { return a.id === p.attachmentId; })[0];
  if (!wanted) fail("OF_NOT_FOUND", "Attachment not found: " + p.attachmentId, {attachmentId: p.attachmentId});
  if (wanted.source === "linked") {
    return {attachment: wanted, content: null, note: "Linked files are not inlined; open the URL locally."};
  }
  var index = Number(String(p.attachmentId).replace("embedded-", "")) - 1;
  var fw = task.attachments[index];
  var data = null;
  try { data = fw.contents.toBase64(); } catch (e) {
    try { data = fw.contents.toString(); } catch (e2) {}
  }
  return {attachment: wanted, contentBase64: data};
}
