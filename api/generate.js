export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { goal, current, forward, reverse } = req.body;
  if (!goal) return res.status(400).json({ error: "Goal is required" });

  const apiKey = process.env.ANTHROPIC_API_KEY?.replace(/\\n/g, "").trim();
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

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
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res
        .status(response.status)
        .json({ error: `Anthropic API error: ${err}` });
    }

    const data = await response.json();
    const text = data.content[0].text;

    // Parse JSON from response, handling potential markdown fences
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
