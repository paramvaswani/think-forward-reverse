import { mountTree } from "./tree-view.js";

function boot() {
  const host = document.getElementById("thought-tree");
  const detail = document.getElementById("tv-detail");
  if (!host) return;
  mountTree(host, detail);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
