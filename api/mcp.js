// Streamable-HTTP MCP endpoint for Think Forward-Reverse.
// JSON-RPC 2.0 over POST, with batch + CORS. GET returns server info.

const VERSION = "1.0.0";
const DOCS_URL = "https://think-forward-reverse.vercel.app";

const TOOLS = [
  {
    name: "list_sessions",
    description:
      "List recent TFR thinking sessions (stub payload). Returns {id, topic, direction, created} tuples covering forward, reverse, and both directions.",
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
    name: "latest_thinking",
    description:
      "Return the most recent TFR session's current state: topic, forwardBranch steps, reverseBranch steps, and synthesis. Stub payload illustrating the shape.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "start_session",
    description:
      "Start a new forward-reverse thinking session for a topic. Returns {sessionId, initialQuestion, direction} stub. Direction is one of 'forward', 'reverse', 'both'.",
    inputSchema: {
      type: "object",
      required: ["topic"],
      properties: {
        topic: {
          type: "string",
          description: "The root question or goal to think through.",
        },
        direction: {
          type: "string",
          enum: ["forward", "reverse", "both"],
          description:
            "Which direction to seed. 'forward' = from now toward goal, 'reverse' = from goal back to now, 'both' = seed both branches.",
        },
      },
    },
  },
  {
    name: "explain_technique",
    description:
      "Return a structured explanation of the forward-reverse thinking technique: what it is, when to use each direction, and the synthesis step.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function seedDemoSessions() {
  const now = Date.now();
  return [
    {
      id: "demo-01",
      topic: "How do I launch Keep to 100 paying users in 90 days?",
      direction: "forward",
      created: new Date(now - 1000 * 60 * 60 * 24 * 3).toISOString(),
    },
    {
      id: "demo-02",
      topic: "Should I raise a pre-seed now or wait 3 months?",
      direction: "reverse",
      created: new Date(now - 1000 * 60 * 60 * 24 * 7).toISOString(),
    },
    {
      id: "demo-03",
      topic: "What would make TFR worth paying for?",
      direction: "both",
      created: new Date(now - 1000 * 60 * 60 * 12).toISOString(),
    },
  ];
}

async function handleTool(name, args) {
  if (name === "list_sessions") {
    const limit = typeof args?.limit === "number" ? args.limit : 10;
    return {
      sessions: seedDemoSessions().slice(0, limit),
      note: "Stub payload. Real sessions live in browser localStorage (key: tfr-tree-v1).",
    };
  }

  if (name === "latest_thinking") {
    return {
      topic: "What would make TFR worth paying for?",
      direction: "both",
      forwardBranch: [
        "Current: free static tool, ~100 weekly users, no auth.",
        "Next: ship MCP endpoint so Claude desktop can invoke sessions.",
        "Then: persist sessions server-side with magic-link auth.",
        "Then: Pro tier ($9/mo) unlocks Claude Opus seeding + export to Notion.",
      ],
      reverseBranch: [
        "Goal: 200 paying users at $9/mo = $1,800 MRR.",
        "Before that: one viral artifact showing a real forward-reverse collision solving a real problem.",
        "Before that: 5 power users generating shareable trees.",
        "Before that: trees must be beautiful, exportable, and embed-friendly.",
      ],
      synthesis:
        "The convergence point is a shareable artifact. Both paths end at 'tree as public object,' so the next move is making a single tree export that's gorgeous and embeddable.",
      updated: new Date().toISOString(),
    };
  }

  if (name === "start_session") {
    const topic = args?.topic;
    if (!topic || typeof topic !== "string") {
      throw new Error("topic is required");
    }
    const direction = ["forward", "reverse", "both"].includes(args?.direction)
      ? args.direction
      : "both";
    const initialQuestion =
      direction === "forward"
        ? `Starting from now, what's the first concrete move toward: ${topic}?`
        : direction === "reverse"
          ? `Imagine the goal is achieved: ${topic}. What's the last step before it?`
          : `Seed both paths for: ${topic}. Forward from now, reverse from the answer.`;
    return {
      sessionId: uid(),
      initialQuestion,
      direction,
      topic,
      note: "Stub. Persist client-side under localStorage key 'tfr-tree-v1' to render in the TFR UI.",
    };
  }

  if (name === "explain_technique") {
    return {
      name: "Forward-Reverse Thinking",
      summary:
        "A structured thinking technique that reasons about a goal from two directions at once: forward from the current state, and reverse from the achieved outcome. The two paths meet in the middle and surface the critical move.",
      directions: {
        forward:
          "Start from the current state and project the next concrete move. Repeat. Good for surfacing hidden steps and incremental progress.",
        reverse:
          "Start from the achieved outcome and work backward one step at a time. Good for cutting through speculation and forcing specificity about what success actually looks like.",
        both: "Run both branches and look for the convergence point. The step that appears in both branches is the critical move.",
      },
      synthesis:
        "Compare the two branches. Where they meet is the next action. Where they diverge reveals hidden assumptions.",
      whenToUse: [
        "High-stakes strategic decisions where speculation is cheap.",
        "Goals that feel far away and have too many possible first steps.",
        "Situations where you keep looping on the same plan without committing.",
      ],
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
