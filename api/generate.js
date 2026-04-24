export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const {
    goal,
    current,
    forward,
    reverse,
    apiKey: clientKey,
    mode,
    context,
  } = req.body || {};
  if (!goal) return res.status(400).json({ error: "Goal is required" });

  const apiKey =
    clientKey?.trim() ||
    process.env.GEMINI_API_KEY?.replace(/\\n/g, "").trim() ||
    process.env.GOOGLE_API_KEY?.replace(/\\n/g, "").trim();
  if (!apiKey)
    return res
      .status(500)
      .json({ error: "No API key. Add your Gemini key in Settings." });

  const wantStream =
    (req.query && (req.query.stream === "1" || req.query.stream === "true")) ||
    mode === "thought";

  if (mode === "thought") {
    const ctxLines = Array.isArray(context)
      ? context
          .filter((c) => c && (c.prompt || c.response))
          .map(
            (c, i) =>
              `Ancestor ${i + 1} prompt: ${c.prompt || "(none)"}\nAncestor ${i + 1} response: ${c.response || "(none)"}`,
          )
          .join("\n\n")
      : "";
    const thoughtPrompt = `You are a sharp strategic thinking partner. A user is exploring a branching thought tree.

${ctxLines ? `Prior branch context:\n${ctxLines}\n\n` : ""}Current prompt: ${goal}

Respond in 2-4 tight paragraphs. Be specific, concrete, and contrarian when warranted. No hedging, no bullet list unless it clarifies. Plain prose.`;

    return streamOrBuffer({
      req,
      res,
      apiKey,
      prompt: thoughtPrompt,
      wantStream,
      maxTokens: 700,
    });
  }

  const hasSteps =
    (forward?.length > 0 && forward.some((s) => s.trim())) ||
    (reverse?.length > 0 && reverse.some((s) => s.trim()));

  const prompt = hasSteps
    ? `You are a strategic thinking assistant using the Forward-Reverse method.

Goal: ${goal}
Current state: ${current || "Not specified"}

Existing forward steps (from now toward goal): ${forward?.filter((s) => s.trim()).join(" → ") || "None yet"}
Existing reverse steps (from goal back to now): ${reverse?.filter((s) => s.trim()).join(" → ") || "None yet"}

Analyze these paths and respond with ONLY valid JSON (no markdown, no code fences):
{
  "forward": ["step1", "step2", ...],
  "reverse": ["step1", "step2", ...],
  "convergence": "Where the paths meet — the critical shared action",
  "gaps": "What the reverse path reveals that forward thinking missed",
  "firstMove": "The single most important next action right now",
  "confidence": {
    "forward": [0.0-1.0 for each step],
    "reverse": [0.0-1.0 for each step]
  }
}

Rules:
- If existing steps are provided, improve/expand them (keep what's good, add what's missing, reorder if needed). Generate 4-6 steps per path.
- If no existing steps, generate 4-6 fresh steps per path.
- Forward steps go from current state toward goal chronologically.
- Reverse steps go from achieved goal backwards to current state.
- Confidence scores: 1.0 = highly certain this step is correct, 0.5 = moderate confidence, 0.0 = speculative.
- Convergence should identify where both paths point to the same critical action.
- Be specific and actionable, not generic. Use the actual goal and context.`
    : `You are a strategic thinking assistant using the Forward-Reverse method.

Goal: ${goal}
Current state: ${current || "Not specified"}

Generate forward and reverse paths. Respond with ONLY valid JSON (no markdown, no code fences):
{
  "forward": ["step1", "step2", ...],
  "reverse": ["step1", "step2", ...],
  "convergence": "Where the paths meet — the critical shared action",
  "gaps": "What the reverse path reveals that forward thinking missed",
  "firstMove": "The single most important next action right now",
  "confidence": {
    "forward": [0.0-1.0 for each step],
    "reverse": [0.0-1.0 for each step]
  }
}

Rules:
- Generate 4-6 steps per path.
- Forward steps: chronological from current state toward goal.
- Reverse steps: from achieved goal backwards toward current state.
- Confidence: 1.0 = certain, 0.5 = moderate, 0.0 = speculative.
- Convergence: the critical action both paths point to.
- Be specific and actionable using the actual goal and context.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 8192, temperature: 0.7 },
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      return res
        .status(response.status)
        .json({ error: `Gemini API error: ${err}` });
    }

    const data = await response.json();
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";

    let parsed;
    try {
      const cleaned = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return res
        .status(500)
        .json({ error: "Failed to parse AI response", raw: text });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function streamOrBuffer({
  req,
  res,
  apiKey,
  prompt,
  wantStream,
  maxTokens,
}) {
  if (!wantStream) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
          }),
        },
      );
      if (!r.ok) {
        const txt = await r.text();
        return res.status(r.status).json({ error: txt });
      }
      const j = await r.json();
      const text =
        j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
      return res.status(200).json({ response: text });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  const write = (event, data) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {}
  };

  let closed = false;
  req.on("close", () => {
    closed = true;
  });

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
        }),
      },
    );

    if (!upstream.ok || !upstream.body) {
      const txt = await upstream.text().catch(() => "");
      write("error", { message: `upstream ${upstream.status}: ${txt}` });
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let full = "";

    while (!closed) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let dataStr = "";
        for (const line of frame.split("\n")) {
          if (line.startsWith("data:")) dataStr += line.slice(5).trim();
        }
        if (!dataStr) continue;
        try {
          const p = JSON.parse(dataStr);
          const delta =
            p.candidates?.[0]?.content?.parts?.map((x) => x.text).join("") ||
            "";
          if (delta) {
            full += delta;
            write("token", { delta });
          }
          const finish = p.candidates?.[0]?.finishReason;
          if (finish) {
            write("done", { text: full });
            res.end();
            return;
          }
        } catch {
          // ignore malformed
        }
      }
    }
    write("done", { text: full });
    res.end();
  } catch (err) {
    write("error", { message: err.message });
    try {
      res.end();
    } catch {}
  }
}
