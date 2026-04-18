const STORAGE_KEY = "tfr-sessions",
  AUTOSAVE_KEY = "tfr-autosave";
let autoSaveTimer = null,
  dragSrcEl = null,
  resizeTimer = null;
const CONF_LEVELS = ["none", "low", "med", "high"],
  CONF_COLORS = {
    high: "rgba(160,196,168,",
    med: "rgba(201,168,124,",
    low: "rgba(196,154,139,",
    none: "rgba(42,42,48,",
  },
  TEMPLATES = [
    {
      name: "Fundraise",
      desc: "Plan a funding round from both ends",
      goal: "Close a funding round",
      current: "",
      forward: [
        "Research target investors",
        "Build pitch deck",
        "Get warm intros",
        "Schedule meetings",
      ],
      reverse: [
        "Term sheet signed",
        "Due diligence passed",
        "Lead investor committed",
        "First meeting went well",
      ],
    },
    {
      name: "Product Launch",
      desc: "Ship a product from idea to live",
      goal: "Product live with first 100 users",
      current: "",
      forward: [
        "Define MVP scope",
        "Build core feature",
        "Set up landing page",
        "Beta test with 10 users",
      ],
      reverse: [
        "100 users signed up",
        "Product Hunt launch went well",
        "Beta feedback incorporated",
        "MVP was compelling enough to share",
      ],
    },
    {
      name: "Career Move",
      desc: "Navigate a career transition",
      goal: "Start new role at target company",
      current: "",
      forward: [
        "Update resume and portfolio",
        "Research target companies",
        "Network with employees",
        "Apply and prep interviews",
      ],
      reverse: [
        "Accepted the offer",
        "Nailed final interview",
        "Got past initial screen",
        "Referral got me in the door",
      ],
    },
    {
      name: "Habit Change",
      desc: "Build or break a habit systematically",
      goal: "New habit is automatic (60+ days)",
      current: "",
      forward: [
        "Define tiny version of habit",
        "Attach to existing trigger",
        "Track for first 7 days",
        "Add accountability partner",
      ],
      reverse: [
        "Habit feels effortless",
        "Made it through multiple hard days",
        "Built a 30-day streak",
        "First week consistency proved it works",
      ],
    },
    {
      name: "Ship Content",
      desc: "Write and publish something meaningful",
      goal: "Published piece with strong engagement",
      current: "",
      forward: [
        "Pick a spiky topic you care about",
        "Write ugly first draft",
        "Get 2 trusted readers to review",
        "Edit ruthlessly and publish",
      ],
      reverse: [
        "Piece went viral in your niche",
        "Distribution channels amplified it",
        "Title and hook were irresistible",
        "Core insight was genuinely original",
      ],
    },
    {
      name: "Blank",
      desc: "Start from scratch",
      goal: "",
      current: "",
      forward: ["", "", ""],
      reverse: ["", "", ""],
    },
  ];
function init() {
  const e = localStorage.getItem(AUTOSAVE_KEY);
  if (e)
    try {
      loadState(JSON.parse(e));
    } catch {
      createEmptySteps();
    }
  else createEmptySteps();
  (loadSavedList(),
    renderTemplates(),
    updateProgress(),
    updateCounts(),
    initCanvas(),
    window.addEventListener("resize", () => {
      (clearTimeout(resizeTimer),
        (resizeTimer = setTimeout(() => {
          (initCanvas(), drawVis());
        }, 150)));
    }));
}
function createEmptySteps() {
  ["forward", "reverse"].forEach((e) => {
    document.getElementById(`${e}-steps`).innerHTML = "";
    for (let n = 0; n < 3; n++) addStep(e, "", !1, "none");
  });
}
function addStep(e, n = "", o = !0, r = "none") {
  const t = document.getElementById(`${e}-steps`),
    a = document.createElement("div");
  ((a.className = `step-row ${e}-step`),
    (a.draggable = !0),
    (a.innerHTML = `
    <div class="drag-handle" title="Drag to reorder"><span></span><span></span><span></span></div>
    <div class="step-check" onclick="toggleCheck(this)" title="Mark complete"><svg viewBox="0 0 24 24" fill="none" stroke="#08080a" stroke-width="3"><path d="M5 12l5 5L19 7"/></svg></div>
    <span class="step-num">1</span>
    <input type="text" class="step-input" data-type="${e}" value="${esc(n)}" placeholder="${e === "forward" ? "Next step from here..." : "What had to happen before this?"}" oninput="onInput()">
    <div class="conf-bar ${r}" data-conf="${r}" data-label="${confLabel(r)}" onclick="cycleConf(this)" title="Click to set confidence"></div>
    <button class="remove-btn" onclick="removeStep(this)" title="Remove">&times;</button>`),
    t.appendChild(a),
    renumber(e),
    setupDragEvents(a));
  const s = a.querySelector("input");
  return (
    s.addEventListener("keydown", (d) => {
      if (
        (d.key === "Enter" && !d.shiftKey && (d.preventDefault(), addStep(e)),
        d.key === "Enter" &&
          d.shiftKey &&
          (d.preventDefault(), toggleCheck(a.querySelector(".step-check"))),
        d.key === "Backspace" && s.value === "" && t.children.length > 1)
      ) {
        d.preventDefault();
        const c = a.previousElementSibling;
        (removeStep(a.querySelector(".remove-btn")),
          c && c.querySelector("input").focus());
      }
    }),
    o && n === "" && ((a.style.animation = "slideIn 0.2s ease"), s.focus()),
    updateCounts(),
    drawVis(),
    a
  );
}
function confLabel(e) {
  return (
    {
      high: "High confidence",
      med: "Medium",
      low: "Speculative",
      none: "Not rated",
    }[e] || "Not rated"
  );
}
function cycleConf(e) {
  const n = CONF_LEVELS,
    o = e.dataset.conf || "none",
    r = n[(n.indexOf(o) + 1) % n.length];
  ((e.dataset.conf = r),
    (e.className = "conf-bar " + r),
    (e.dataset.label = confLabel(r)),
    drawVis(),
    onInput());
}
function removeStep(e) {
  const n = e.closest(".step-row"),
    o = n.querySelector(".step-input").dataset.type;
  ((n.style.opacity = "0"),
    (n.style.transform = "translateX(-10px)"),
    setTimeout(() => {
      (n.remove(), renumber(o), updateCounts(), drawVis(), onInput());
    }, 150));
}
function toggleCheck(e) {
  (e.classList.toggle("checked"),
    e.closest(".step-row").classList.toggle("completed"),
    updateProgress(),
    drawVis(),
    onInput());
}
function renumber(e) {
  document
    .querySelectorAll(`#${e}-steps .step-row`)
    .forEach((n, o) => (n.querySelector(".step-num").textContent = o + 1));
}
function updateCounts() {
  ["forward", "reverse"].forEach((e) => {
    const n = [...document.querySelectorAll(`#${e}-steps .step-input`)].filter(
        (r) => r.value.trim(),
      ).length,
      o = document.querySelectorAll(`#${e}-steps .step-row`).length;
    document.getElementById(`${e}-count`).textContent = `${n}/${o}`;
  });
}
function setupDragEvents(e) {
  (e.addEventListener("dragstart", (n) => {
    ((dragSrcEl = e),
      e.classList.add("dragging"),
      (n.dataTransfer.effectAllowed = "move"));
  }),
    e.addEventListener("dragover", (n) => {
      (n.preventDefault(),
        (n.dataTransfer.dropEffect = "move"),
        dragSrcEl !== e && e.classList.add("drag-over"));
    }),
    e.addEventListener("dragleave", () => e.classList.remove("drag-over")),
    e.addEventListener("drop", (n) => {
      if (
        (n.preventDefault(),
        e.classList.remove("drag-over"),
        dragSrcEl !== e && dragSrcEl)
      ) {
        const o = e.parentNode,
          r = dragSrcEl.querySelector(".step-input").dataset.type,
          t = e.querySelector(".step-input").dataset.type;
        if (r === t) {
          const a = [...o.children],
            s = a.indexOf(dragSrcEl),
            d = a.indexOf(e);
          (s < d
            ? o.insertBefore(dragSrcEl, e.nextSibling)
            : o.insertBefore(dragSrcEl, e),
            renumber(r),
            onInput());
        }
      }
    }),
    e.addEventListener("dragend", () => {
      (dragSrcEl?.classList.remove("dragging"),
        document
          .querySelectorAll(".drag-over")
          .forEach((n) => n.classList.remove("drag-over")),
        (dragSrcEl = null));
    }));
}
async function aiGenerate() {
  const e = document.getElementById("goal").value.trim();
  if (!e) {
    (document.getElementById("goal").focus(), toast("Enter a goal first"));
    return;
  }
  const n = document.getElementById("ai-btn");
  (n.classList.add("loading"), (n.disabled = !0));
  const o = [...document.querySelectorAll("#forward-steps .step-input")]
      .map((t) => t.value)
      .filter((t) => t.trim()),
    r = [...document.querySelectorAll("#reverse-steps .step-input")]
      .map((t) => t.value)
      .filter((t) => t.trim());
  try {
    const t = localStorage.getItem("tfr-api-key") || "",
      a = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: e,
          current: document.getElementById("current").value,
          forward: o,
          reverse: r,
          apiKey: t,
        }),
      });
    if (!a.ok) {
      const m = await a.json();
      throw new Error(m.error || "API error");
    }
    const s = await a.json(),
      d = document.getElementById("forward-steps");
    ((d.innerHTML = ""),
      (s.forward || []).forEach((m, l) => {
        const f = s.confidence?.forward?.[l],
          i = f >= 0.7 ? "high" : f >= 0.4 ? "med" : f > 0 ? "low" : "none";
        addStep("forward", m, !1, i);
      }));
    const c = document.getElementById("reverse-steps");
    ((c.innerHTML = ""),
      (s.reverse || []).forEach((m, l) => {
        const f = s.confidence?.reverse?.[l],
          i = f >= 0.7 ? "high" : f >= 0.4 ? "med" : f > 0 ? "low" : "none";
        addStep("reverse", m, !1, i);
      }),
      s.convergence &&
        (document.getElementById("convergence").value = s.convergence),
      s.gaps && (document.getElementById("insight-gaps").value = s.gaps),
      s.firstMove &&
        (document.getElementById("insight-move").value = s.firstMove),
      updateProgress(),
      updateCounts(),
      drawVis(),
      onInput(),
      toast("AI paths generated with confidence scores"));
    const u = document.getElementById("conf-hint");
    u && (u.style.display = "inline");
  } catch (t) {
    toast("Error: " + t.message);
  } finally {
    (n.classList.remove("loading"), (n.disabled = !1));
  }
}
let canvas, ctx;
function initCanvas() {
  canvas = document.getElementById("vis-canvas");
  const e = canvas.parentElement.getBoundingClientRect();
  ((canvas.width = e.width * 2),
    (canvas.height = e.height * 2),
    (ctx = canvas.getContext("2d")),
    drawVis());
}
function drawVis() {
  if (!ctx) return;
  const e = canvas.width,
    n = canvas.height;
  ctx.clearRect(0, 0, e, n);
  const o = [...document.querySelectorAll("#forward-steps .step-row")].filter(
      (l) => l.querySelector(".step-input").value.trim(),
    ),
    r = [...document.querySelectorAll("#reverse-steps .step-row")].filter((l) =>
      l.querySelector(".step-input").value.trim(),
    ),
    t = o.length,
    a = r.length,
    s = e / 2,
    d = n / 2,
    c = 80;
  function u(l, f) {
    const i = l.querySelector(".conf-bar")?.dataset.conf || "none";
    return (CONF_COLORS[i] || CONF_COLORS.none) + f + ")";
  }
  if (t > 0) {
    (ctx.beginPath(), ctx.moveTo(c, d + 15));
    const l = [];
    for (let f = 0; f < t; f++) {
      const i = (f + 1) / (t + 1);
      l.push({ x: c + i * (s - c), y: d + 15 - Math.sin(i * Math.PI) * 35 });
    }
    (l.forEach((f) => ctx.lineTo(f.x, f.y)),
      ctx.lineTo(s, d),
      (ctx.strokeStyle = "rgba(160,196,168,0.35)"),
      (ctx.lineWidth = 2),
      ctx.stroke(),
      l.forEach((f, i) => {
        const g = o[i].classList.contains("completed");
        (ctx.beginPath(),
          ctx.arc(f.x, f.y, g ? 7 : 5, 0, Math.PI * 2),
          (ctx.fillStyle = u(o[i], g ? "0.9" : "0.6")),
          ctx.fill(),
          g &&
            ((ctx.strokeStyle = "rgba(160,196,168,0.8)"),
            (ctx.lineWidth = 1.5),
            ctx.stroke()));
      }));
  }
  if (a > 0) {
    (ctx.beginPath(), ctx.moveTo(e - c, d - 15));
    const l = [];
    for (let f = 0; f < a; f++) {
      const i = (f + 1) / (a + 1);
      l.push({
        x: e - c - i * (e - c - s),
        y: d - 15 + Math.sin(i * Math.PI) * 35,
      });
    }
    (l.forEach((f) => ctx.lineTo(f.x, f.y)),
      ctx.lineTo(s, d),
      (ctx.strokeStyle = "rgba(196,154,139,0.35)"),
      (ctx.lineWidth = 2),
      ctx.stroke(),
      l.forEach((f, i) => {
        const g = r[i].classList.contains("completed");
        (ctx.beginPath(),
          ctx.arc(f.x, f.y, g ? 7 : 5, 0, Math.PI * 2),
          (ctx.fillStyle = u(r[i], g ? "0.9" : "0.6")),
          ctx.fill(),
          g &&
            ((ctx.strokeStyle = "rgba(196,154,139,0.8)"),
            (ctx.lineWidth = 1.5),
            ctx.stroke()));
      }));
  }
  const m = document.getElementById("convergence").value.trim();
  (ctx.beginPath(),
    ctx.arc(s, d, m ? 9 : 5, 0, Math.PI * 2),
    (ctx.fillStyle = m ? "rgba(201,168,124,0.85)" : "rgba(201,168,124,0.25)"),
    ctx.fill(),
    (document.getElementById("vis-pulse").style.display =
      t > 0 || a > 0 ? "block" : "none"),
    (document.getElementById("vis-center-label").textContent = m
      ? "Converged"
      : t + a > 0
        ? `${t + a} steps mapped`
        : "Start mapping"));
}
function updateProgress() {
  const e = ["goal", "current", "convergence", "insight-gaps", "insight-move"];
  let n = e.filter((a) => document.getElementById(a).value.trim()).length;
  const o = document.querySelectorAll(".step-input"),
    r = [...o].filter((a) => a.value.trim()).length,
    t = e.length + o.length;
  document.getElementById("progress").style.width =
    (t > 0 ? ((n + r) / t) * 100 : 0) + "%";
}
function onInput() {
  (updateProgress(),
    updateCounts(),
    drawVis(),
    clearTimeout(autoSaveTimer),
    (autoSaveTimer = setTimeout(() => {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(getState()));
      const e = document.getElementById("autosave");
      (e.classList.add("show"),
        setTimeout(() => e.classList.remove("show"), 1500));
    }, 800)));
}
function getState() {
  const e = (n) =>
    [...document.querySelectorAll(`#${n}-steps .step-row`)].map((o) => ({
      text: o.querySelector(".step-input").value,
      completed: o.querySelector(".step-check").classList.contains("checked"),
      confidence: o.querySelector(".conf-bar")?.dataset.conf || "none",
    }));
  return {
    goal: document.getElementById("goal").value,
    current: document.getElementById("current").value,
    forward: e("forward"),
    reverse: e("reverse"),
    convergence: document.getElementById("convergence").value,
    gaps: document.getElementById("insight-gaps").value,
    move: document.getElementById("insight-move").value,
    timestamp: new Date().toISOString(),
  };
}
function loadState(e) {
  ((document.getElementById("goal").value = e.goal || ""),
    (document.getElementById("current").value = e.current || ""),
    (document.getElementById("convergence").value = e.convergence || ""),
    (document.getElementById("insight-gaps").value = e.gaps || ""),
    (document.getElementById("insight-move").value = e.move || ""),
    ["forward", "reverse"].forEach((n) => {
      const o = document.getElementById(`${n}-steps`);
      o.innerHTML = "";
      const r = e[n] || [],
        t = Math.max(r.length, 3);
      for (let a = 0; a < t; a++) {
        const s = r[a],
          d = typeof s == "string" ? s : s?.text || "",
          c = typeof s == "object" ? s?.completed : !1,
          u = (typeof s == "object" && s?.confidence) || "none",
          m = addStep(n, d, !1, u);
        c &&
          (m.querySelector(".step-check").classList.add("checked"),
          m.classList.add("completed"));
      }
    }),
    updateProgress(),
    updateCounts(),
    drawVis());
}
function getSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveSession() {
  const e = getState();
  if (!e.goal.trim()) {
    (document.getElementById("goal").focus(), toast("Enter a goal first"));
    return;
  }
  const n = getSaved();
  ((e.id = Date.now().toString(36)),
    n.unshift(e),
    localStorage.setItem(STORAGE_KEY, JSON.stringify(n)),
    loadSavedList(),
    toast("Session saved"));
}
function loadSavedList() {
  const e = document.getElementById("saved-list"),
    n = getSaved();
  if (!n.length) {
    e.innerHTML = '<div class="empty-state">No saved sessions yet</div>';
    return;
  }
  e.innerHTML = n
    .map((o) => {
      const t = new Date(o.timestamp).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        a =
          (o.goal || "Untitled").substring(0, 55) +
          ((o.goal || "").length > 55 ? "..." : ""),
        s = (o.forward || []).filter((c) =>
          typeof c == "string" ? c.trim() : c?.text?.trim(),
        ).length,
        d = (o.reverse || []).filter((c) =>
          typeof c == "string" ? c.trim() : c?.text?.trim(),
        ).length;
      return `<div class="saved-item" onclick="loadSession('${o.id}')"><div class="meta"><span class="title">${escHtml(a)}</span><span class="date">${t}</span></div><span class="step-count">${s}+${d}</span><button class="delete" onclick="event.stopPropagation();deleteSession('${o.id}')">&times;</button></div>`;
    })
    .join("");
}
function loadSession(e) {
  const g = document.getElementById("goal").value.trim();
  if (g && !confirm("Load this session? Unsaved changes will be lost.")) return;
  const n = getSaved().find((o) => o.id === e);
  n && (loadState(n), toast("Session loaded"));
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => document.getElementById("goal").focus(), 300);
}
function deleteSession(e) {
  if (!confirm("Delete this session?")) return;
  const n = getSaved().filter((o) => o.id !== e);
  (localStorage.setItem(STORAGE_KEY, JSON.stringify(n)),
    loadSavedList(),
    toast("Deleted"));
}
function renderTemplates() {
  document.getElementById("template-grid").innerHTML = TEMPLATES.map(
    (e, n) =>
      `<div class="template-card" onclick="loadTemplate(${n})"><h4>${e.name}</h4><p>${e.desc}</p></div>`,
  ).join("");
}
function loadTemplate(e) {
  const n = TEMPLATES[e];
  ((document.getElementById("goal").value = n.goal),
    (document.getElementById("current").value = n.current),
    (document.getElementById("convergence").value = ""),
    (document.getElementById("insight-gaps").value = ""),
    (document.getElementById("insight-move").value = ""),
    ["forward", "reverse"].forEach((o) => {
      const r = document.getElementById(`${o}-steps`);
      if (
        ((r.innerHTML = ""),
        (n[o] || []).forEach((t) => addStep(o, t, !1, "none")),
        (n[o] || []).length < 3)
      )
        for (let t = (n[o] || []).length; t < 3; t++)
          addStep(o, "", !1, "none");
    }),
    switchTab(document.querySelector(".tab"), "saved-tab"),
    window.scrollTo({ top: 0, behavior: "smooth" }),
    toast(`"${n.name}" loaded`),
    onInput());
}
function exportSession() {
  const e = getState();
  let n = `THINK FORWARD-REVERSE
${"=".repeat(40)}

`;
  ((n += `GOAL: ${e.goal || "(not set)"}

CURRENT STATE: ${e.current || "(not set)"}

`),
    (n += `FORWARD PATH (from now)
${"-".repeat(30)}
`),
    e.forward.forEach((o, r) => {
      const t = typeof o == "string" ? o : o.text,
        a = typeof o == "object" && o.completed ? " [done]" : "",
        s =
          typeof o == "object" && o.confidence !== "none"
            ? ` [${o.confidence}]`
            : "";
      t.trim() &&
        (n += `  ${r + 1}. ${t}${s}${a}
`);
    }),
    (n += `
REVERSE PATH (from goal)
${"-".repeat(30)}
`),
    e.reverse.forEach((o, r) => {
      const t = typeof o == "string" ? o : o.text,
        a = typeof o == "object" && o.completed ? " [done]" : "",
        s =
          typeof o == "object" && o.confidence !== "none"
            ? ` [${o.confidence}]`
            : "";
      t.trim() &&
        (n += `  ${r + 1}. ${t}${s}${a}
`);
    }),
    (n += `
CONVERGENCE POINT
${"-".repeat(30)}
${e.convergence || "(not set)"}
`),
    (n += `
GAPS REVEALED: ${e.gaps || "(not set)"}
FIRST REAL MOVE: ${e.move || "(not set)"}
`),
    (document.getElementById("export-content").textContent = n),
    document.getElementById("modal").classList.add("active"));
}
function exportImage() {
  const e = getState(),
    n = document.getElementById("og-canvas"),
    o = 1200,
    r = 630;
  ((n.width = o), (n.height = r));
  const t = n.getContext("2d");
  ((t.fillStyle = "#08080a"), t.fillRect(0, 0, o, r));
  const a = t.createLinearGradient(0, 0, o, r);
  (a.addColorStop(0, "rgba(160,196,168,0.04)"),
    a.addColorStop(1, "rgba(196,154,139,0.04)"),
    (t.fillStyle = a),
    t.fillRect(0, 0, o, r),
    (t.strokeStyle = "#2a2a30"),
    (t.lineWidth = 2),
    t.strokeRect(1, 1, o - 2, r - 2),
    (t.font = "44px Instrument Serif, serif"),
    (t.fillStyle = "#e8e6e3"),
    t.fillText("Think", 40, 65),
    (t.fillStyle = "#a0c4a8"),
    t.fillText("Forward", 155, 65),
    (t.fillStyle = "#e8e6e3"),
    t.fillText("-", 310, 65),
    (t.fillStyle = "#c49a8b"),
    t.fillText("Reverse", 340, 65),
    (t.font = "500 18px DM Sans, sans-serif"),
    (t.fillStyle = "#9a9a9f"),
    t.fillText("GOAL", 40, 110),
    (t.font = "22px DM Sans, sans-serif"),
    (t.fillStyle = "#e8e6e3"));
  const s = e.goal || "(not set)";
  wrapText(t, s, 40, 140, 560, 28);
  const d = (e.forward || []).filter((i) =>
      (typeof i == "string" ? i : i.text).trim(),
    ),
    c = (e.reverse || []).filter((i) =>
      (typeof i == "string" ? i : i.text).trim(),
    );
  ((t.font = "500 13px JetBrains Mono, monospace"),
    (t.fillStyle = "#a0c4a8"),
    t.fillText("FORWARD PATH", 40, 220),
    (t.font = "15px DM Sans, sans-serif"),
    (t.fillStyle = "#9a9a9f"),
    d.slice(0, 5).forEach((i, g) => {
      const p = typeof i == "string" ? i : i.text,
        y = typeof i == "object" ? i.confidence : "none",
        h = {
          high: "#a0c4a8",
          med: "#c9a87c",
          low: "#c49a8b",
          none: "#2a2a30",
        };
      ((t.fillStyle = h[y] || h.none),
        t.fillRect(40, 232 + g * 26, 3, 18),
        (t.fillStyle = "#9a9a9f"),
        t.fillText(
          `${g + 1}. ${p.substring(0, 50)}${p.length > 50 ? "..." : ""}`,
          52,
          247 + g * 26,
        ));
    }),
    (t.font = "500 13px JetBrains Mono, monospace"),
    (t.fillStyle = "#c49a8b"),
    t.fillText("REVERSE PATH", 640, 220),
    (t.font = "15px DM Sans, sans-serif"),
    (t.fillStyle = "#9a9a9f"),
    c.slice(0, 5).forEach((i, g) => {
      const p = typeof i == "string" ? i : i.text,
        y = typeof i == "object" ? i.confidence : "none",
        h = {
          high: "#a0c4a8",
          med: "#c9a87c",
          low: "#c49a8b",
          none: "#2a2a30",
        };
      ((t.fillStyle = h[y] || h.none),
        t.fillRect(640, 232 + g * 26, 3, 18),
        (t.fillStyle = "#9a9a9f"),
        t.fillText(
          `${g + 1}. ${p.substring(0, 50)}${p.length > 50 ? "..." : ""}`,
          652,
          247 + g * 26,
        ));
    }));
  const u = Math.max(232 + d.length * 26 + 30, 232 + c.length * 26 + 30, 400),
    m = t.createLinearGradient(40, 0, o - 40, 0);
  (m.addColorStop(0, "#a0c4a8"),
    m.addColorStop(0.5, "#c9a87c"),
    m.addColorStop(1, "#c49a8b"),
    (t.strokeStyle = m),
    (t.lineWidth = 1),
    t.beginPath(),
    t.moveTo(40, u),
    t.lineTo(o - 40, u),
    t.stroke(),
    (t.font = "500 13px JetBrains Mono, monospace"),
    (t.fillStyle = "#c9a87c"),
    t.fillText("CONVERGENCE", 40, u + 25),
    (t.font = "17px DM Sans, sans-serif"),
    (t.fillStyle = "#e8e6e3"));
  const l = e.convergence || "Not yet identified";
  (wrapText(t, l, 40, u + 50, o - 80, 24),
    (t.font = "12px JetBrains Mono, monospace"),
    (t.fillStyle = "#5a5a60"),
    t.fillText("think-forward-reverse.vercel.app", 40, r - 25),
    (t.fillStyle = "#5a5a60"),
    (t.font = "11px JetBrains Mono, monospace"));
  const f = o - 300;
  ([
    { c: "#a0c4a8", l: "High" },
    { c: "#c9a87c", l: "Med" },
    { c: "#c49a8b", l: "Low" },
  ].forEach((i, g) => {
    ((t.fillStyle = i.c),
      t.fillRect(f + g * 90, r - 30, 3, 12),
      (t.fillStyle = "#5a5a60"),
      t.fillText(i.l, f + 8 + g * 90, r - 20));
  }),
    document.getElementById("img-modal").classList.add("active"));
}
function wrapText(e, n, o, r, t, a) {
  const s = n.split(" ");
  let d = "";
  (s.forEach((c) => {
    const u = d + c + " ";
    e.measureText(u).width > t && d
      ? (e.fillText(d.trim(), o, r), (r += a), (d = c + " "))
      : (d = u);
  }),
    e.fillText(d.trim(), o, r));
}
function downloadOG() {
  const e = document.getElementById("og-canvas"),
    n = document.createElement("a");
  ((n.download = "think-forward-reverse.png"),
    (n.href = e.toDataURL("image/png")),
    n.click(),
    toast("Card downloaded"));
}
function getShareText() {
  const e = getState(),
    n = e.forward.filter((s) => (typeof s == "string" ? s : s.text).trim()),
    o = e.reverse.filter((s) => (typeof s == "string" ? s : s.text).trim()),
    r = n.length,
    t = o.length;
  let a = `I mapped my path to: "${e.goal}"

`;
  return (
    (a += `Forward path (${r} steps from now):
`),
    n.slice(0, 4).forEach((s, d) => {
      a += `  ${d + 1}. ${typeof s == "string" ? s : s.text}
`;
    }),
    r > 4 &&
      (a += `  ... +${r - 4} more
`),
    (a += `
Reverse path (${t} steps from goal):
`),
    o.slice(0, 4).forEach((s, d) => {
      a += `  ${d + 1}. ${typeof s == "string" ? s : s.text}
`;
    }),
    t > 4 &&
      (a += `  ... +${t - 4} more
`),
    e.convergence &&
      (a += `
Convergence: ${e.convergence}
`),
    e.move &&
      (a += `
First move: ${e.move}
`),
    (a += `
Built with Think Forward-Reverse`),
    a
  );
}
function getShareURL() {
  const e = encodeSession();
  return location.origin + location.pathname + "#p=" + e;
}
function renderShareCard() {
  const e = getState(),
    n = document.getElementById("share-canvas"),
    o = 1080,
    r = 1080;
  ((n.width = o), (n.height = r));
  const t = n.getContext("2d");
  ((t.fillStyle = "#08080a"), t.fillRect(0, 0, o, r));
  const a = t.createLinearGradient(0, 0, o, r);
  (a.addColorStop(0, "rgba(160,196,168,0.06)"),
    a.addColorStop(1, "rgba(196,154,139,0.06)"),
    (t.fillStyle = a),
    t.fillRect(0, 0, o, r));
  const s = t.createLinearGradient(60, 0, o - 60, 0);
  (s.addColorStop(0, "#a0c4a8"),
    s.addColorStop(0.5, "#c9a87c"),
    s.addColorStop(1, "#c49a8b"),
    (t.strokeStyle = s),
    (t.lineWidth = 2),
    t.beginPath(),
    t.moveTo(60, 50),
    t.lineTo(o - 60, 50),
    t.stroke(),
    (t.font = "52px Instrument Serif, serif"),
    (t.fillStyle = "#e8e6e3"),
    t.fillText("Think", 60, 110),
    (t.fillStyle = "#a0c4a8"),
    t.fillText("Forward", 195, 110),
    (t.fillStyle = "#e8e6e3"),
    t.fillText("-", 385, 110),
    (t.fillStyle = "#c49a8b"),
    t.fillText("Reverse", 410, 110),
    (t.font = "500 16px JetBrains Mono, monospace"),
    (t.fillStyle = "#5a5a60"),
    t.fillText("GOAL", 60, 165),
    (t.font = "26px DM Sans, sans-serif"),
    (t.fillStyle = "#e8e6e3"),
    wrapText(t, e.goal || "(not set)", 60, 200, o - 120, 32));
  let c =
    200 +
    (Math.ceil(t.measureText(e.goal || "").width / (o - 120)) || 1) * 32 +
    20;
  const u = e.forward.filter((l) => (typeof l == "string" ? l : l.text).trim());
  ((t.font = "500 14px JetBrains Mono, monospace"),
    (t.fillStyle = "#a0c4a8"),
    t.fillText("FORWARD PATH", 60, c),
    (c += 28),
    (t.font = "18px DM Sans, sans-serif"),
    u.slice(0, 5).forEach((l, f) => {
      const i = typeof l == "string" ? l : l.text,
        g = typeof l == "object" ? l.confidence : "none",
        p = {
          high: "#a0c4a8",
          med: "#c9a87c",
          low: "#c49a8b",
          none: "#2a2a30",
        };
      ((t.fillStyle = p[g] || p.none),
        t.fillRect(60, c - 14, 4, 20),
        (t.fillStyle = "#9a9a9f"),
        t.fillText(
          `${f + 1}. ${i.substring(0, 45)}${i.length > 45 ? "..." : ""}`,
          76,
          c,
        ),
        (c += 30));
    }),
    (c += 15));
  const m = e.reverse.filter((l) => (typeof l == "string" ? l : l.text).trim());
  if (
    ((t.font = "500 14px JetBrains Mono, monospace"),
    (t.fillStyle = "#c49a8b"),
    t.fillText("REVERSE PATH", 60, c),
    (c += 28),
    (t.font = "18px DM Sans, sans-serif"),
    m.slice(0, 5).forEach((l, f) => {
      const i = typeof l == "string" ? l : l.text,
        g = typeof l == "object" ? l.confidence : "none",
        p = {
          high: "#a0c4a8",
          med: "#c9a87c",
          low: "#c49a8b",
          none: "#2a2a30",
        };
      ((t.fillStyle = p[g] || p.none),
        t.fillRect(60, c - 14, 4, 20),
        (t.fillStyle = "#9a9a9f"),
        t.fillText(
          `${f + 1}. ${i.substring(0, 45)}${i.length > 45 ? "..." : ""}`,
          76,
          c,
        ),
        (c += 30));
    }),
    e.convergence)
  ) {
    c += 20;
    const l = t.createLinearGradient(60, 0, o - 60, 0);
    (l.addColorStop(0, "#a0c4a8"),
      l.addColorStop(0.5, "#c9a87c"),
      l.addColorStop(1, "#c49a8b"),
      (t.strokeStyle = l),
      (t.lineWidth = 1),
      t.beginPath(),
      t.moveTo(60, c),
      t.lineTo(o - 60, c),
      t.stroke(),
      (c += 28),
      (t.font = "500 14px JetBrains Mono, monospace"),
      (t.fillStyle = "#c9a87c"),
      t.fillText("CONVERGENCE", 60, c),
      (c += 24),
      (t.font = "20px DM Sans, sans-serif"),
      (t.fillStyle = "#e8e6e3"),
      wrapText(t, e.convergence, 60, c, o - 120, 26));
  }
  if (e.move) {
    const l = Math.max(c + 60, r - 160);
    ((t.font = "500 14px JetBrains Mono, monospace"),
      (t.fillStyle = "#8ba4c4"),
      t.fillText("FIRST MOVE", 60, l),
      (t.font = "20px DM Sans, sans-serif"),
      (t.fillStyle = "#e8e6e3"),
      wrapText(t, e.move, 60, l + 26, o - 120, 26));
  }
  ((t.font = "13px JetBrains Mono, monospace"),
    (t.fillStyle = "#5a5a60"),
    t.fillText("think-forward-reverse.vercel.app", 60, r - 40),
    (t.strokeStyle = s),
    (t.lineWidth = 1),
    t.beginPath(),
    t.moveTo(60, r - 55),
    t.lineTo(o - 60, r - 55),
    t.stroke());
}
function shareResults() {
  if (!getState().goal.trim()) {
    (document.getElementById("goal").focus(), toast("Enter a goal first"));
    return;
  }
  (renderShareCard(),
    (document.getElementById("share-text-preview").textContent =
      getShareText()),
    document.getElementById("share-modal").classList.add("active"));
}
function shareToX() {
  const e = getState(),
    n = getShareURL(),
    o =
      `I mapped my path to: "${e.goal}"

` +
      (e.convergence
        ? `Convergence point: ${e.convergence}

`
        : "") +
      (e.move
        ? `First move: ${e.move}

`
        : "") +
      "Built with Think Forward-Reverse",
    r = `https://x.com/intent/tweet?text=${encodeURIComponent(o)}&url=${encodeURIComponent(n)}`;
  window.open(r, "_blank");
}
function shareToLinkedIn() {
  const e = getShareURL();
  window.open(
    `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(e)}`,
    "_blank",
  );
}
function shareToBluesky() {
  const e = getState(),
    n = getShareURL(),
    o =
      `I mapped my path to: "${e.goal}"

` +
      (e.convergence
        ? `Convergence: ${e.convergence}

`
        : "") +
      `Built with Think Forward-Reverse
${n}`;
  window.open(
    `https://bsky.app/intent/compose?text=${encodeURIComponent(o)}`,
    "_blank",
  );
}
function copyShareText() {
  navigator.clipboard
    .writeText(
      getShareText() +
        `

` +
        getShareURL(),
    )
    .then(() => toast("Copied to clipboard"))
    .catch(() => toast("Failed to copy"));
}
function downloadShareCard() {
  const e = document.getElementById("share-canvas"),
    n = document.createElement("a");
  ((n.download = "think-forward-reverse-results.png"),
    (n.href = e.toDataURL("image/png")),
    n.click(),
    toast("Card downloaded"));
}
function closeShareModal() {
  document.getElementById("share-modal").classList.remove("active");
}
function encodeSession() {
  const e = getState();
  return btoa(
    encodeURIComponent(
      JSON.stringify({
        g: e.goal,
        c: e.current,
        f: e.forward.map((n) => ({
          t: typeof n == "string" ? n : n.text,
          cf: typeof n == "object" ? n.confidence : "none",
        })),
        r: e.reverse.map((n) => ({
          t: typeof n == "string" ? n : n.text,
          cf: typeof n == "object" ? n.confidence : "none",
        })),
        v: e.convergence,
        ga: e.gaps,
        m: e.move,
      }),
    ),
  );
}
function publishSession() {
  if (!getState().goal.trim()) {
    (document.getElementById("goal").focus(), toast("Enter a goal first"));
    return;
  }
  const n = encodeSession(),
    o = location.origin + location.pathname + "#p=" + n;
  if (o.length > 8e3) {
    toast("Session too large \u2014 trim steps or use Export Card");
    return;
  }
  navigator.clipboard
    .writeText(o)
    .then(() => toast("Published link copied \u2014 share it anywhere"))
    .catch(() => toast("Failed to copy link"));
}
function loadFromURL() {
  const e = location.hash,
    n = e.startsWith("#p="),
    o = e.startsWith("#d=");
  if (!n && !o) return !1;
  try {
    const r = e.slice(3),
      t = JSON.parse(decodeURIComponent(atob(r)));
    return (
      (document.getElementById("goal").value = t.g || ""),
      (document.getElementById("current").value = t.c || ""),
      (document.getElementById("convergence").value = t.v || ""),
      (document.getElementById("insight-gaps").value = t.ga || ""),
      (document.getElementById("insight-move").value = t.m || ""),
      ["forward", "reverse"].forEach((a) => {
        const s = a === "forward" ? "f" : "r",
          d = document.getElementById(`${a}-steps`);
        d.innerHTML = "";
        const c = t[s] || [],
          u = Math.max(c.length, 3);
        for (let m = 0; m < u; m++) {
          const l = c[m],
            f = typeof l == "string" ? l : l?.t || "",
            i = (typeof l == "object" && l?.cf) || "none";
          addStep(a, f, !1, i);
        }
      }),
      n
        ? (document.body.classList.add("published"),
          (document.title =
            (t.g || "Session") + " \u2014 Think Forward-Reverse"))
        : ((location.hash = ""), toast("Session loaded \u2014 edit away")),
      !0
    );
  } catch {
    toast("Link is invalid or corrupted");
    return !1;
  }
}
function copyExport() {
  navigator.clipboard
    .writeText(document.getElementById("export-content").textContent)
    .then(() => toast("Copied"))
    .catch(() => toast("Failed to copy"));
}
function closeModal() {
  document.getElementById("modal").classList.remove("active");
}
function closeImgModal() {
  document.getElementById("img-modal").classList.remove("active");
}
function openSettings() {
  ((document.getElementById("settings-api-key").value =
    localStorage.getItem("tfr-api-key") || ""),
    document.getElementById("settings-modal").classList.add("active"));
}
function closeSettings() {
  document.getElementById("settings-modal").classList.remove("active");
}
function saveSettings() {
  const e = document.getElementById("settings-api-key").value.trim();
  (e && localStorage.setItem("tfr-api-key", e),
    closeSettings(),
    toast("API key saved"));
}
function clearApiKey() {
  (localStorage.removeItem("tfr-api-key"),
    (document.getElementById("settings-api-key").value = ""),
    toast("API key cleared"));
}
function clearAll() {
  confirm("Clear everything? This cannot be undone.") &&
    (document.querySelectorAll("textarea").forEach((e) => (e.value = "")),
    createEmptySteps(),
    localStorage.removeItem(AUTOSAVE_KEY),
    updateProgress(),
    updateCounts(),
    drawVis(),
    toast("Cleared"));
}
function toggleConcept() {
  (document.getElementById("concept-toggle").classList.toggle("open"),
    document.getElementById("concept-body").classList.toggle("open"));
}
function switchTab(e, n) {
  (document
    .querySelectorAll(".tab")
    .forEach((o) => o.classList.remove("active")),
    document
      .querySelectorAll(".tab-content")
      .forEach((o) => o.classList.remove("active")),
    e.classList.add("active"),
    document.getElementById(n).classList.add("active"));
}
function toast(e) {
  const n = document.getElementById("toast");
  ((n.textContent = e),
    n.classList.add("show"),
    setTimeout(() => n.classList.remove("show"), 2200));
}
function esc(e) {
  return e.replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
function escHtml(e) {
  const n = document.createElement("div");
  return ((n.textContent = e), n.innerHTML);
}
(document.addEventListener("keydown", (e) => {
  (e.key === "Escape" &&
    (closeModal(), closeImgModal(), closeSettings(), closeShareModal()),
    (e.metaKey || e.ctrlKey) &&
      e.key === "s" &&
      (e.preventDefault(), saveSession()),
    (e.metaKey || e.ctrlKey) &&
      e.key === "e" &&
      (e.preventDefault(), exportSession()));
}),
  document.getElementById("modal").addEventListener("click", (e) => {
    e.target === e.currentTarget && closeModal();
  }),
  document.getElementById("img-modal").addEventListener("click", (e) => {
    e.target === e.currentTarget && closeImgModal();
  }),
  document.getElementById("settings-modal").addEventListener("click", (e) => {
    e.target === e.currentTarget && closeSettings();
  }),
  document.getElementById("share-modal").addEventListener("click", (e) => {
    e.target === e.currentTarget && closeShareModal();
  }),
  loadFromURL()
    ? (updateProgress(),
      updateCounts(),
      initCanvas(),
      loadSavedList(),
      renderTemplates())
    : init(),
  localStorage.getItem("tfr-visited") ||
    (document.getElementById("concept-toggle").classList.add("open"),
    document.getElementById("concept-body").classList.add("open"),
    localStorage.setItem("tfr-visited", "1")));
