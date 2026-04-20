// Horizontal thought-tree renderer — pure SVG, no D3.
// Lays out: root on left, descendants sweep rightward column by column.

import { Tree } from "./tree.js";
import { StreamSession } from "./stream.js";

const NODE_W = 220;
const NODE_H = 96;
const COL_GAP = 56;
const ROW_GAP = 18;

let hostEl = null;
let selectedId = null;
let activeStream = null;
let activeStreamNodeId = null;

function measureLayout() {
  const visible = new Map();
  const walk = (id, depth) => {
    const n = Tree.node(id);
    if (!n) return 0;
    visible.set(id, { node: n, depth, y: 0, height: NODE_H });
    if (n.collapsed) return NODE_H;
    const kids = Tree.children(id);
    if (kids.length === 0) return NODE_H;
    let total = 0;
    kids.forEach((c, i) => {
      const h = walk(c.id, depth + 1);
      total += h;
      if (i < kids.length - 1) total += ROW_GAP;
    });
    return Math.max(NODE_H, total);
  };
  walk(Tree.state.rootId, 0);

  // Second pass — y positions.
  const assignY = (id, top) => {
    const v = visible.get(id);
    if (!v) return NODE_H;
    if (v.node.collapsed) {
      v.y = top;
      return NODE_H;
    }
    const kids = Tree.children(id);
    if (kids.length === 0) {
      v.y = top;
      return NODE_H;
    }
    let cursor = top;
    const childYs = [];
    kids.forEach((c, i) => {
      const h = subtreeHeight(c.id);
      assignY(c.id, cursor);
      childYs.push(cursor + h / 2);
      cursor += h;
      if (i < kids.length - 1) cursor += ROW_GAP;
    });
    const total = cursor - top;
    v.y = (childYs[0] + childYs[childYs.length - 1]) / 2 - NODE_H / 2;
    return total;
  };
  const subtreeHeight = (id) => {
    const n = Tree.node(id);
    if (!n) return NODE_H;
    if (n.collapsed) return NODE_H;
    const kids = Tree.children(id);
    if (kids.length === 0) return NODE_H;
    let total = 0;
    kids.forEach((c, i) => {
      total += subtreeHeight(c.id);
      if (i < kids.length - 1) total += ROW_GAP;
    });
    return Math.max(NODE_H, total);
  };
  assignY(Tree.state.rootId, 0);

  let maxDepth = 0;
  let maxY = 0;
  visible.forEach((v) => {
    if (v.depth > maxDepth) maxDepth = v.depth;
    if (v.y + NODE_H > maxY) maxY = v.y + NODE_H;
  });

  return {
    visible,
    width: (maxDepth + 1) * NODE_W + maxDepth * COL_GAP + 16,
    height: maxY + 16,
  };
}

function escText(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function render() {
  if (!hostEl) return;
  const layout = measureLayout();
  const { visible, width, height } = layout;

  const edges = [];
  const nodes = [];
  visible.forEach((v, id) => {
    const x = v.depth * (NODE_W + COL_GAP);
    const y = v.y;
    v.x = x;
    if (v.node.parentId && visible.has(v.node.parentId)) {
      const p = visible.get(v.node.parentId);
      const px = p.depth * (NODE_W + COL_GAP) + NODE_W;
      const py = p.y + NODE_H / 2;
      const cx = x;
      const cy = y + NODE_H / 2;
      const mx = (px + cx) / 2;
      edges.push(
        `<path class="tv-edge" d="M ${px} ${py} C ${mx} ${py} ${mx} ${cy} ${cx} ${cy}" />`,
      );
    }
    const kids = Tree.children(id);
    const hasKids = kids.length > 0;
    const collapsed = v.node.collapsed && hasKids;
    const isSelected = id === selectedId;
    const kindClass = v.node.kind === "root" ? "tv-root" : "tv-fork";
    const streaming = id === activeStreamNodeId;
    const promptText = v.node.prompt?.trim() || "(no prompt)";
    const respText = v.node.response?.trim() || "";
    const preview = respText ? respText.slice(0, 140) : "";
    const suffix = respText.length > 140 ? "…" : "";

    nodes.push(`
      <g class="tv-node ${kindClass} ${isSelected ? "tv-selected" : ""} ${streaming ? "tv-streaming" : ""}"
         data-id="${id}" transform="translate(${x}, ${y})">
        <rect class="tv-card" width="${NODE_W}" height="${NODE_H}" rx="10" ry="10" />
        <text class="tv-prompt" x="12" y="22">${escText(promptText).slice(0, 40)}${promptText.length > 40 ? "…" : ""}</text>
        <foreignObject x="12" y="30" width="${NODE_W - 24}" height="${NODE_H - 40}">
          <div xmlns="http://www.w3.org/1999/xhtml" class="tv-body">${escText(preview)}${suffix}${streaming ? '<span class="tv-cursor"></span>' : ""}</div>
        </foreignObject>
        ${
          hasKids
            ? `<g class="tv-toggle" data-action="toggle" data-id="${id}" transform="translate(${NODE_W - 18}, ${NODE_H - 16})">
                <circle r="8" />
                <text y="4" text-anchor="middle">${collapsed ? "+" : "−"}</text>
              </g>`
            : ""
        }
        <g class="tv-fork-btn" data-action="fork" data-id="${id}" transform="translate(${NODE_W - 18}, 16)">
          <circle r="8" />
          <text y="4" text-anchor="middle">↦</text>
        </g>
      </g>
    `);
  });

  hostEl.innerHTML = `
    <svg class="tv-svg" viewBox="0 0 ${Math.max(width, 400)} ${Math.max(height, 200)}"
         width="${Math.max(width, 400)}" height="${Math.max(height, 200)}"
         preserveAspectRatio="xMinYMin meet">
      <g class="tv-edges">${edges.join("")}</g>
      <g class="tv-nodes">${nodes.join("")}</g>
    </svg>
  `;
}

function getApiKey() {
  return (localStorage.getItem("tfr-api-key") || "").trim();
}

async function runFork(nodeId) {
  const node = Tree.node(nodeId);
  if (!node) return;
  const cursorEl = document.getElementById("tv-cursor-target");
  const payload = {
    goal: node.prompt,
    current: "",
    forward: [],
    reverse: [],
    apiKey: getApiKey(),
    mode: "thought",
    context: Tree.path(nodeId)
      .slice(0, -1)
      .map((n) => ({ prompt: n.prompt, response: n.response })),
  };

  activeStreamNodeId = nodeId;
  toggleStopBtn(true);
  render();

  activeStream = new StreamSession({
    onToken: (delta, full) => {
      Tree.setResponse(nodeId, full);
      render();
    },
    onDone: () => {
      Tree.commitResponse(nodeId);
      activeStreamNodeId = null;
      activeStream = null;
      toggleStopBtn(false);
      render();
    },
    onError: (err) => {
      Tree.setResponse(nodeId, `[error: ${err.message}]`);
      Tree.commitResponse(nodeId);
      activeStreamNodeId = null;
      activeStream = null;
      toggleStopBtn(false);
      render();
    },
  });

  const result = await activeStream.run(payload);
  if (result && result.aborted) {
    Tree.setResponse(
      nodeId,
      (Tree.node(nodeId)?.response || "") + " [stopped]",
    );
    Tree.commitResponse(nodeId);
    activeStreamNodeId = null;
    activeStream = null;
    toggleStopBtn(false);
    render();
  }
}

function toggleStopBtn(show) {
  const b = document.getElementById("tv-stop");
  if (b) b.style.display = show ? "inline-flex" : "none";
}

function onClick(e) {
  const target = e.target.closest("[data-action]");
  if (target) {
    const action = target.dataset.action;
    const id = target.dataset.id;
    e.stopPropagation();
    if (action === "toggle") {
      Tree.toggleCollapse(id);
      return;
    }
    if (action === "fork") {
      const parent = Tree.node(id);
      const suggestion = parent?.prompt ? `Alt: ${parent.prompt}` : "";
      const prompt = window.prompt(
        "Fork this thought — enter an alternative prompt:",
        suggestion,
      );
      if (!prompt || !prompt.trim()) return;
      const newId = Tree.fork(id, prompt.trim());
      selectedId = newId;
      render();
      runFork(newId);
      return;
    }
  }
  const nodeEl = e.target.closest(".tv-node");
  if (nodeEl) {
    selectedId = nodeEl.dataset.id;
    updateDetail();
    render();
  }
}

function updateDetail() {
  const detail = document.getElementById("tv-detail");
  if (!detail) return;
  if (!selectedId) {
    detail.innerHTML =
      '<p class="tv-detail-empty">Click a node to inspect. Click ↦ to fork.</p>';
    return;
  }
  const n = Tree.node(selectedId);
  if (!n) return;
  const isRoot = n.id === Tree.state.rootId;
  detail.innerHTML = `
    <div class="tv-detail-head">
      <span class="tv-kind">${isRoot ? "root" : "branch"}</span>
      <div class="tv-detail-actions">
        <button class="tv-btn" data-detail="fork">Fork</button>
        ${!isRoot ? '<button class="tv-btn" data-detail="promote">Promote</button>' : ""}
        ${!isRoot ? '<button class="tv-btn tv-btn-danger" data-detail="remove">Remove</button>' : ""}
      </div>
    </div>
    <label class="tv-label">Prompt</label>
    <textarea class="tv-textarea" data-detail="prompt" rows="2">${escText(n.prompt)}</textarea>
    <label class="tv-label">Response</label>
    <div class="tv-response">${escText(n.response) || '<span class="tv-muted">(empty — fork or run to populate)</span>'}</div>
  `;
}

function onDetailClick(e) {
  const btn = e.target.closest("[data-detail]");
  if (!btn || !selectedId) return;
  const kind = btn.dataset.detail;
  if (kind === "fork") {
    const parent = Tree.node(selectedId);
    const suggestion = parent?.prompt ? `Alt: ${parent.prompt}` : "";
    const prompt = window.prompt("Fork — alternative prompt:", suggestion);
    if (!prompt || !prompt.trim()) return;
    const newId = Tree.fork(selectedId, prompt.trim());
    selectedId = newId;
    render();
    updateDetail();
    runFork(newId);
  } else if (kind === "promote") {
    if (confirm("Promote this branch to the new trunk? (Undoable)")) {
      Tree.promote(selectedId);
    }
  } else if (kind === "remove") {
    if (confirm("Remove this node and its descendants? (Undoable)")) {
      Tree.remove(selectedId);
      selectedId = Tree.state.rootId;
    }
  }
}

let editingSnapshotted = false;
let editingId = null;

function onDetailInput(e) {
  const ta = e.target.closest('[data-detail="prompt"]');
  if (!ta || !selectedId) return;
  const n = Tree.node(selectedId);
  if (!n) return;
  if (!editingSnapshotted || editingId !== selectedId) {
    Tree.snapshot("edit prompt");
    editingSnapshotted = true;
    editingId = selectedId;
  }
  n.prompt = ta.value;
  Tree.save();
}

function onDetailBlur(e) {
  const ta = e.target.closest('[data-detail="prompt"]');
  if (!ta) return;
  editingSnapshotted = false;
  editingId = null;
}

function download(name, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setupToolbar() {
  document.getElementById("tv-undo")?.addEventListener("click", () => {
    const label = Tree.undo();
    if (!label) {
      notify("nothing to undo");
    } else {
      notify(`undo: ${label}`);
    }
  });
  document.getElementById("tv-reset")?.addEventListener("click", () => {
    if (!confirm("Reset the tree? (Undoable)")) return;
    const rootPrompt = (document.getElementById("goal")?.value || "").trim();
    Tree.reset(rootPrompt);
  });
  document.getElementById("tv-export-json")?.addEventListener("click", () => {
    download("thought-tree.json", Tree.toJSON(), "application/json");
  });
  document.getElementById("tv-export-md")?.addEventListener("click", () => {
    download("thought-tree.md", Tree.toMarkdown(), "text/markdown");
  });
  document.getElementById("tv-stop")?.addEventListener("click", () => {
    if (activeStream) activeStream.abort();
  });
  document.getElementById("tv-seed")?.addEventListener("click", () => {
    const rootPrompt = (document.getElementById("goal")?.value || "").trim();
    if (!rootPrompt) {
      notify("enter a goal above first");
      return;
    }
    const root = Tree.root();
    Tree.snapshot("seed root");
    root.prompt = rootPrompt;
    Tree.save();
    Tree.emit();
    runFork(root.id);
  });
}

function notify(msg) {
  if (typeof window.toast === "function") {
    window.toast(msg);
    return;
  }
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2000);
}

function keydown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
    const active = document.activeElement;
    if (active && active.closest("#tv-detail")) return; // let textarea undo natively
    if (active && active.closest("#thought-tree")) {
      e.preventDefault();
      Tree.undo();
    }
  }
}

export function mountTree(host, detailHost) {
  hostEl = host;
  host.addEventListener("click", onClick);
  if (detailHost) {
    detailHost.addEventListener("click", onDetailClick);
    detailHost.addEventListener("input", onDetailInput);
    detailHost.addEventListener("blur", onDetailBlur, true);
  }
  document.addEventListener("keydown", keydown);
  Tree.load();
  if (!Tree.root().prompt) {
    const seed = (document.getElementById("goal")?.value || "").trim();
    if (seed) {
      Tree.root().prompt = seed;
      Tree.save();
    }
  }
  Tree.subscribe(() => {
    render();
    updateDetail();
  });
  setupToolbar();
  render();
  updateDetail();
}
