// Branching thought tree — data model, persistence, undo, promote.
// Pure ES module. No framework.

const TREE_KEY = "tfr-tree-v1";
const UNDO_KEY = "tfr-tree-undo-v1";
const UNDO_MAX = 20;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function emptyTree(rootPrompt = "") {
  const rootId = uid();
  return {
    rootId,
    nodes: {
      [rootId]: {
        id: rootId,
        parentId: null,
        prompt: rootPrompt,
        response: "",
        kind: "root",
        collapsed: false,
        createdAt: Date.now(),
      },
    },
  };
}

export const Tree = {
  state: null,
  undoStack: [],
  listeners: new Set(),

  load() {
    try {
      const raw = localStorage.getItem(TREE_KEY);
      this.state = raw ? JSON.parse(raw) : emptyTree();
    } catch {
      this.state = emptyTree();
    }
    try {
      const u = localStorage.getItem(UNDO_KEY);
      this.undoStack = u ? JSON.parse(u) : [];
    } catch {
      this.undoStack = [];
    }
    return this.state;
  },

  save() {
    try {
      localStorage.setItem(TREE_KEY, JSON.stringify(this.state));
      localStorage.setItem(UNDO_KEY, JSON.stringify(this.undoStack));
    } catch (e) {
      // quota exceeded — drop oldest undo frames
      this.undoStack = this.undoStack.slice(-5);
      try {
        localStorage.setItem(TREE_KEY, JSON.stringify(this.state));
        localStorage.setItem(UNDO_KEY, JSON.stringify(this.undoStack));
      } catch {}
    }
  },

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },

  emit() {
    this.listeners.forEach((fn) => fn(this.state));
  },

  snapshot(label) {
    this.undoStack.push({
      label,
      state: JSON.parse(JSON.stringify(this.state)),
      at: Date.now(),
    });
    if (this.undoStack.length > UNDO_MAX) {
      this.undoStack.shift();
    }
  },

  undo() {
    const frame = this.undoStack.pop();
    if (!frame) return false;
    this.state = frame.state;
    this.save();
    this.emit();
    return frame.label || "undone";
  },

  canUndo() {
    return this.undoStack.length > 0;
  },

  reset(rootPrompt = "") {
    this.snapshot("reset");
    this.state = emptyTree(rootPrompt);
    this.save();
    this.emit();
  },

  node(id) {
    return this.state.nodes[id];
  },

  root() {
    return this.state.nodes[this.state.rootId];
  },

  children(id) {
    return Object.values(this.state.nodes)
      .filter((n) => n.parentId === id)
      .sort((a, b) => a.createdAt - b.createdAt);
  },

  fork(parentId, prompt, kind = "fork") {
    const parent = this.node(parentId);
    if (!parent) return null;
    this.snapshot("fork");
    const id = uid();
    this.state.nodes[id] = {
      id,
      parentId,
      prompt,
      response: "",
      kind,
      collapsed: false,
      createdAt: Date.now(),
    };
    this.save();
    this.emit();
    return id;
  },

  setResponse(id, text) {
    const n = this.node(id);
    if (!n) return;
    n.response = text;
    // streaming updates don't snapshot each chunk; just save lazily via caller.
    this.emit();
  },

  commitResponse(id) {
    // called when a stream finishes; snapshot AFTER so undo reverts to pre-finish state.
    this.save();
  },

  editPrompt(id, prompt) {
    const n = this.node(id);
    if (!n) return;
    this.snapshot("edit prompt");
    n.prompt = prompt;
    this.save();
    this.emit();
  },

  toggleCollapse(id) {
    const n = this.node(id);
    if (!n) return;
    n.collapsed = !n.collapsed;
    this.save();
    this.emit();
  },

  remove(id) {
    if (id === this.state.rootId) return false;
    this.snapshot("remove");
    const toDelete = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of Object.values(this.state.nodes)) {
        if (!toDelete.has(n.id) && toDelete.has(n.parentId)) {
          toDelete.add(n.id);
          grew = true;
        }
      }
    }
    toDelete.forEach((nid) => delete this.state.nodes[nid]);
    this.save();
    this.emit();
    return true;
  },

  // Promote: make a node the new root. Keeps only the node + its descendants.
  // Orphans (siblings, ancestors, ancestor-siblings) are pruned.
  promote(id) {
    if (id === this.state.rootId) return false;
    const n = this.node(id);
    if (!n) return false;
    this.snapshot("promote");
    const keep = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const m of Object.values(this.state.nodes)) {
        if (!keep.has(m.id) && keep.has(m.parentId)) {
          keep.add(m.id);
          grew = true;
        }
      }
    }
    const nextNodes = {};
    for (const nid of keep) {
      nextNodes[nid] = this.state.nodes[nid];
    }
    nextNodes[id].parentId = null;
    nextNodes[id].kind = "root";
    this.state = { rootId: id, nodes: nextNodes };
    this.save();
    this.emit();
    return true;
  },

  // Path from root to node (inclusive). Useful for context in prompts.
  path(id) {
    const out = [];
    let cur = this.node(id);
    while (cur) {
      out.unshift(cur);
      cur = cur.parentId ? this.node(cur.parentId) : null;
    }
    return out;
  },

  toJSON() {
    return JSON.stringify(this.state, null, 2);
  },

  toMarkdown() {
    const lines = [];
    const walk = (id, depth) => {
      const n = this.node(id);
      if (!n) return;
      const indent = "  ".repeat(depth);
      const title = n.prompt?.trim() || "(empty)";
      lines.push(`${indent}- **${title}**`);
      if (n.response?.trim()) {
        n.response
          .trim()
          .split("\n")
          .forEach((line) => lines.push(`${indent}  > ${line}`));
      }
      this.children(n.id).forEach((c) => walk(c.id, depth + 1));
    };
    walk(this.state.rootId, 0);
    return lines.join("\n");
  },
};
