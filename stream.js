// SSE streaming client for /api/generate?stream=1.
// Falls back to non-streaming on 500 or network error.

export class StreamSession {
  constructor({ onToken, onDone, onError }) {
    this.controller = null;
    this.onToken = onToken || (() => {});
    this.onDone = onDone || (() => {});
    this.onError = onError || (() => {});
    this.aborted = false;
  }

  abort() {
    this.aborted = true;
    if (this.controller) {
      try {
        this.controller.abort();
      } catch {}
    }
  }

  async run(payload) {
    this.aborted = false;
    this.controller = new AbortController();
    let streamOk = false;
    try {
      const resp = await fetch("/api/generate?stream=1", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(payload),
        signal: this.controller.signal,
      });

      if (!resp.ok || !resp.body) {
        // fall through to non-streaming fallback
        return this.fallback(payload, `stream endpoint ${resp.status}`);
      }

      streamOk = true;
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let full = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE frames separated by \n\n
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const lines = frame.split("\n");
          let eventName = "message";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataStr += line.slice(5).trim();
            }
          }
          if (!dataStr) continue;
          if (dataStr === "[DONE]") {
            this.onDone(full);
            return { ok: true, text: full, streamed: true };
          }
          try {
            const parsed = JSON.parse(dataStr);
            if (eventName === "token" && typeof parsed.delta === "string") {
              full += parsed.delta;
              this.onToken(parsed.delta, full);
            } else if (eventName === "error") {
              this.onError(new Error(parsed.message || "stream error"));
              return { ok: false, error: parsed.message };
            } else if (eventName === "done") {
              this.onDone(full);
              return { ok: true, text: full, streamed: true };
            }
          } catch {
            // ignore malformed frame
          }
        }
      }
      this.onDone(full);
      return { ok: true, text: full, streamed: true };
    } catch (err) {
      if (this.aborted || err.name === "AbortError") {
        return { ok: false, aborted: true };
      }
      if (!streamOk) {
        return this.fallback(payload, err.message);
      }
      this.onError(err);
      return { ok: false, error: err.message };
    }
  }

  async fallback(payload, reason) {
    if (this.aborted) return { ok: false, aborted: true };
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: this.controller?.signal,
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${resp.status}`);
      }
      const j = await resp.json();
      const text =
        typeof j.response === "string"
          ? j.response
          : typeof j.text === "string"
            ? j.text
            : JSON.stringify(j);
      this.onToken(text, text);
      this.onDone(text);
      return { ok: true, text, streamed: false, fallbackReason: reason };
    } catch (err) {
      if (this.aborted || err.name === "AbortError") {
        return { ok: false, aborted: true };
      }
      this.onError(err);
      return { ok: false, error: err.message };
    }
  }
}
