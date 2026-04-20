// Streamable-HTTP MCP endpoint for Think Forward-Reverse.
// JSON-RPC 2.0 over POST, with batch + CORS. GET returns server info.

const VERSION = "1.0.0";
const DOCS_URL = "https://think-forward-reverse.vercel.app";

const TOOLS = [
  {
    name: "list_sessions",
    description:
      "List the user's TFR thinking sessions. TFR stores sessions in client-side localStorage (tfr-tree-v1), so the server returns a client-only note plus demo sessions. Future: client-invocable path so the browser can return real sessions.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Max sessions to return (default 10)",
        },
      },
    },
  },
  {
    name: "new_session",
    description:
      "Start a new forward-reverse thinking session for a question. Returns a starter tree with a forward-seeded node and a reverse-seeded node. If ANTHROPIC_API_KEY is set, uses Claude Haiku to seed both paths; otherwise returns a stub shell.",
    inputSchema: {
      type: "object",
      required: ["question"],
      properties: {
        question: {
          type: "string",
          description:
            "The root question or goal to think through forward + reverse.",
        },
        current: {
          type: "string",
          description:
            "Optional: current state / starting context for the forward path.",
        },
      },
    },
  },
  {
    name: "get_session",
    description:
      "Get a TFR session tree by id. Sessions live in client localStorage, so the server returns a stub session matching the shape the client would produce.",
    inputSchema: {
      type: "object",
      required: ["sessionId"],
      properties: {
        sessionId: {
          type: "string",
          description:
            "Session id (as returned by list_sessions or new_session).",
        },
      },
    },
  },
  {
    name: "explain_technique",
    description:
      "Return a structured explanation of the forward-reverse thinking technique: what it is, when to use each direction, and the synthesis step.",
    inputSchema: { type: "object", properties: {} },
  },
];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function emptyTree(rootPrompt) {
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

function seedDemoSessions() {
  return [
    {
      sessionId: "demo-01",
      question: "How do I launch Keep to 100 paying users in 90 days?",
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
      forwardSeed:
        "Start: landing page live, Whoop oracle prototype working. Next: 5 beta forfeits running on fake money, then real charity forfeit flow on Stripe, then narrow to one commitment type (sleep) and hand-recruit 50 friends.",
      reverseSeed:
        "Goal: 100 paying users. Back from there: 100 users means ~300 signups with 33% conversion. 300 signups means 1 viral Substack + 1 HN front-page moment. The critical shared move is a sharp public artifact that demos the charity-forfeit mechanic.",
    },
    {
      sessionId: "demo-02",
      question: "Should I raise a pre-seed now or wait 3 months?",
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 7,
      forwardSeed:
        "Now: strong content flywheel, weak revenue, oracle tech novel. Forward: ship real-money Gibraltar flow, get 20 users paying forfeits, then raise on traction instead of deck.",
      reverseSeed:
        "From a closed $1.5M round: reverse-engineer what investors needed to see. Answer: founding story + oracle defensibility + one working commitment loop. Convergence: ship the loop before the deck.",
    },
  ];
}

async function seedWithClaude({ question, current, apiKey }) {
  const prompt = `You are seeding a Forward-Reverse thinking tree for this question.

Question: ${question}
${current ? `Current state: ${current}` : ""}

Return ONLY valid JSON (no markdown, no code fences):
{
  "forward": "2-3 sentences seeding the forward path from current state toward the answer",
  "reverse": "2-3 sentences seeding the reverse path from the achieved answer back to now"
}`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!r.ok) {
    const err = await r.text().catch(() => "");
    throw new Error(`Anthropic API error ${r.status}: ${err}`);
  }
  const j = await r.json();
  const text = j.content?.[0]?.text || "";
  const cleaned = text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return { forward: cleaned, reverse: "" };
  }
}

async function handleTool(name, args) {
  if (name === "list_sessions") {
    const limit = typeof args?.limit === "number" ? args.limit : 10;
    const demos = seedDemoSessions().slice(0, limit);
    return {
      source: "client-only",
      note: "TFR sessions live in browser localStorage (key: tfr-tree-v1). The server cannot read them. Below are demo sessions illustrating the shape. A future client-invocable path can let the browser return the real list.",
      sessions: demos,
      storageHint: {
        storage: "localStorage",
        key: "tfr-tree-v1",
        shape:
          "{ rootId, nodes: { [id]: { id, parentId, prompt, response, kind, createdAt } } }",
      },
    };
  }

  if (name === "new_session") {
    const question = args?.question;
    if (!question || typeof question !== "string") {
      throw new Error("question is required");
    }
    const current = typeof args?.current === "string" ? args.current : null;

    const tree = emptyTree(question);
    const rootId = tree.rootId;

    const forwardId = uid();
    const reverseId = uid();
    tree.nodes[forwardId] = {
      id: forwardId,
      parentId: rootId,
      prompt: "Forward: what's the next concrete move from here?",
      response: "",
      kind: "forward",
      collapsed: false,
      createdAt: Date.now(),
    };
    tree.nodes[reverseId] = {
      id: reverseId,
      parentId: rootId,
      prompt: "Reverse: from the answer, what's the last step before it?",
      response: "",
      kind: "reverse",
      collapsed: false,
      createdAt: Date.now() + 1,
    };

    const apiKey = process.env.ANTHROPIC_API_KEY?.replace(/\\n/g, "").trim();
    let seedSource = "stub";
    if (apiKey) {
      try {
        const seeded = await seedWithClaude({ question, current, apiKey });
        if (seeded.forward) tree.nodes[forwardId].response = seeded.forward;
        if (seeded.reverse) tree.nodes[reverseId].response = seeded.reverse;
        seedSource = "claude-haiku-4-5";
      } catch (err) {
        seedSource = `stub (seed-failed: ${err.message})`;
      }
    }

    return {
      sessionId: rootId,
      question,
      current,
      seedSource,
      tree,
      note: "Persist this tree in the browser under localStorage key 'tfr-tree-v1' to have the TFR UI pick it up.",
    };
  }

  if (name === "get_session") {
    const sessionId = args?.sessionId;
    if (!sessionId || typeof sessionId !== "string") {
      throw new Error("sessionId is required");
    }
    const demos = seedDemoSessions();
    const match = demos.find((d) => d.sessionId === sessionId);
    if (match) {
      const tree = emptyTree(match.question);
      const rootId = tree.rootId;
      const fwdId = uid();
      const revId = uid();
      tree.nodes[fwdId] = {
        id: fwdId,
        parentId: rootId,
        prompt: "Forward seed",
        response: match.forwardSeed,
        kind: "forward",
        collapsed: false,
        createdAt: match.createdAt + 1,
      };
      tree.nodes[revId] = {
        id: revId,
        parentId: rootId,
        prompt: "Reverse seed",
        response: match.reverseSeed,
        kind: "reverse",
        collapsed: false,
        createdAt: match.createdAt + 2,
      };
      return {
        sessionId,
        source: "demo",
        question: match.question,
        tree,
      };
    }
    return {
      sessionId,
      source: "client-only",
      note: "Real sessions live in browser localStorage (tfr-tree-v1). Server returned a stub. See list_sessions for demo ids.",
      tree: emptyTree(`(unknown session: ${sessionId})`),
    };
  }

  if (name === "explain_technique") {
    return {
      name: "Forward-Reverse Thinking",
      summary:
        "A structured thinking technique that reasons about a goal from two directions simultaneously: forward from current state, reverse from achieved outcome. The paths meet in the middle to surface the critical move.",
      directions: {
        forward:
          "Project the next concrete move from current state. Good for surfacing hidden steps.",
        reverse:
          "Work backward one step at a time from the achieved outcome. Forces specificity about what success looks like.",
        both: "Run both branches and look for convergence. The step that appears in both is the critical move.",
      },
      synthesis:
        "Compare branches. Where they meet is the next action. Where they diverge reveals hidden assumptions.",
      docs: DOCS_URL,
    };
  }

  throw new Error(`unknown tool: ${name}`);
}

async function handleRpc(req) {
  const id = req?.id ?? null;
  try {
    if (!req || req.jsonrpc !== "2.0" || typeof req.method !== "string") {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32600, message: "invalid request" },
      };
    }
    if (req.method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "tfr-mcp", version: VERSION },
        },
      };
    }
    if (req.method === "notifications/initialized") {
      return { jsonrpc: "2.0", id, result: {} };
    }
    if (req.method === "tools/list") {
      return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    }
    if (req.method === "tools/call") {
      const params = req.params || {};
      const name = params.name;
      const args = params.arguments;
      const out = await handleTool(name, args);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        },
      };
    }
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `method not found: ${req.method}` },
    };
  } catch (err) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32000,
        message: err instanceof Error ? err.message : "internal error",
      },
    };
  }
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({
      name: "tfr-mcp",
      version: VERSION,
      transport: "streamable-http",
      tools: TOOLS.map((t) => t.name),
      docs: DOCS_URL,
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "parse error" },
      });
    }
  }
  if (!body) {
    return res.status(400).json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "missing body" },
    });
  }

  const batch = Array.isArray(body) ? body : [body];
  const responses = await Promise.all(batch.map(handleRpc));
  const out = Array.isArray(body) ? responses : responses[0];
  return res.status(200).json(out);
}
