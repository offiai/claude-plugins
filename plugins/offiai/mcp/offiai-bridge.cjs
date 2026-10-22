"use strict";

// packages/bridges/src/cowork/bridge-main.ts
var import_node_crypto = require("node:crypto");
var import_promises = require("node:fs/promises");
var import_node_http = require("node:http");
var import_node_os = require("node:os");
var import_node_path = require("node:path");

// packages/bridges/src/cowork/bridge.ts
var HTTP_TIMEOUT_MS = 1500;
var HEARTBEAT_INTERVAL_MS = 6e4;
var MAX_LINE_BYTES = 64 * 1024;
var COWORK_TASK_ID = /^cse_[A-Za-z0-9]{24}$/;
var BRIDGE_VERSION = "0.3.1";
var MAX_BODY_BYTES = 4096;
var LEGACY_VERSION = "0.2.0";
var REPLY_VERSION = "0.3.0";
var REPLY_MAX = 2e3;
var NOT_PAIRED = "OffiAI app not running or not paired \u2014 continue normally.";
var CLI_MESSAGE = "OffiAI observes Claude Code CLI sessions directly \u2014 nothing sent.";
var REPLY_SHOWN = "OffiAI: reply shown. Now write the complete answer for the user after this call.";
var REPLY_SHORTENED = "OffiAI: reply shown (shortened to fit). Now write the complete answer for the user after this call.";
var REPLY_LEGACY = "OffiAI: this OffiAI version does not show replies \u2014 continue normally.";
var REPLY_ALREADY = "OffiAI: reply already sent for this turn \u2014 not sent.";
var REPLY_NO_PROMPT = "OffiAI: reply not sent \u2014 no prompt event for this conversation; continue normally.";
var REPLY_NO_DESK = "OffiAI: reply not shown \u2014 no desk for this conversation.";
var REPLY_DROPPED_STATUS = 202;
var MAX_TURNS = 64;
var MAX_ARMED = 4;
var REPORTING_RULE = 'Only in the Claude desktop app: FIRST in every turn, including trivial prompts and the first turn, attempt exactly one offiai_event(kind:"prompt", conversation: the label, summary: one line) before any assistant prose; discovery/skill-reading may precede it. Do not load this skill or call its tools in Claude Code CLI. You cannot see the app title: first choose a two-to-six-word neutral topic plus " \xB7 " plus the first message date and time as MM-DD HH:MM (Weekly team meeting agenda \xB7 10-22 09:51); later copy conversation verbatim from the earliest offiai_event call. Never use OffiAI/check-in. Only if the current user message ends with the line "(from OffiAI)": after the work call offiai_reply once (same conversation, a copy of your answer, at most 2000 characters). Then provide the complete requested answer after the LAST tool call. Never append an OffiAI call after answer text. No automatic progress, blocked, done, status or retry calls. If tools are missing no call is required; give the one-time notice.';
var PRIVACY_RULE = ` Never send secrets or credentials. Apart from the offiai_reply copy of your own answer on a turn whose message ends with the line "(from OffiAI)", never send personal data, verbatim prompts, file contents or transcripts. Use a neutral stable label for sensitive topics. The label is a nonblank single line, trimmed without changing case, at most 120 characters. If an OffiAI tool answers not running or not paired, do not retry or mention it again; do not retry one that answers invalid, does not show replies, already sent, not shown or no prompt event either. If tools are missing, tell the user once: "OffiAI's bridge did not start \u2014 open the OffiAI install page (Node.js 18+ is required)."`;
var BRIDGE_INSTRUCTIONS = "The user runs OffiAI, which shows conversations at desks on this Mac. " + REPORTING_RULE + PRIVACY_RULE;
var EVENT_DESCRIPTION = REPORTING_RULE + PRIVACY_RULE;
var REPLY_DESCRIPTION = 'Only in the Claude desktop app, and only when the current user message ends with the line "(from OffiAI)": report first with offiai_event(kind:"prompt"), do the work, then call offiai_reply once with the same conversation value and a copy of your answer, at most 2000 characters; if the answer is longer, send a summary of at most 2000 characters that ends with "Full answer in Claude.". Then write the complete answer for the user as text after this call, after the LAST tool call: the reply is a copy; the visible answer follows this call. Never call it on other turns or after answer text. The bridge takes one reply per prompt event of the conversation and shortens a longer text. Do not retry if it answers not running, invalid, does not show replies, already sent, not shown or no prompt event. Never include secrets or credentials.';
var HOST_ID_DESCRIPTION = "Optional: the conversation id that an OffiAI reminder named (cse_ plus 24 letters or digits), copied exactly. Omit it when no reminder named one; never guess it or run commands to find it.";
var HOST_ID_PROPERTY = { type: "string", description: HOST_ID_DESCRIPTION };
var CLI_DESCRIPTION = "Not needed in the Claude Code CLI: OffiAI observes CLI sessions directly. Do not call it.";
var record = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var hostOf = (value) => typeof value === "string" && COWORK_TASK_ID.test(value) ? { hostSessionId: value } : {};
function parseEvent(value) {
  if (!record(value)) return "expected an object";
  const kind = value["kind"];
  if (kind !== "prompt" && kind !== "progress" && kind !== "done" && kind !== "blocked") return "kind";
  const conversation = value["conversation"];
  if (typeof conversation !== "string" || !conversation.trim() || conversation.trim().length > 120 || /[\r\n]/.test(conversation)) return "conversation";
  if (typeof value["summary"] !== "string" || value["summary"].length > 280 || /[\r\n]/.test(value["summary"])) return "summary";
  if (value["task"] !== void 0 && (typeof value["task"] !== "string" || value["task"].length > 120 || /[\r\n]/.test(value["task"]))) return "task";
  if (Object.keys(value).some((key) => !["kind", "conversation", "summary", "task", "host_session_id"].includes(key))) return "unknown field";
  return { kind, conversation: conversation.trim(), summary: value["summary"], ...typeof value["task"] === "string" ? { task: value["task"] } : {}, ...hostOf(value["host_session_id"]) };
}
var REPLY_CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/;
var LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
function fitReply(text) {
  if (text.length <= REPLY_MAX) return { text, shortened: false };
  let kept = "";
  for (const point of text) {
    if (kept.length + point.length > REPLY_MAX - 1) break;
    kept += point;
  }
  return { text: kept + "\u2026", shortened: true };
}
function parseReply(value) {
  if (!record(value)) return "expected an object";
  const conversation = value["conversation"];
  if (typeof conversation !== "string" || !conversation.trim() || conversation.trim().length > 120 || /[\r\n]/.test(conversation)) return "conversation";
  const text = typeof value["text"] === "string" ? value["text"].replace(/\r\n/g, "\n") : null;
  if (text === null || !text.trim() || REPLY_CONTROL.test(text) || LONE_SURROGATE.test(text)) return "text";
  if (Object.keys(value).some((key) => !["conversation", "text", "host_session_id"].includes(key))) return "unknown field";
  return { conversation: conversation.trim(), ...fitReply(text), ...hostOf(value["host_session_id"]) };
}
function parsePairing(text, mode) {
  if ((mode & 127) !== 0) return null;
  try {
    const value = JSON.parse(text);
    if (!record(value) || value["v"] !== 1 || !Number.isInteger(value["port"]) || typeof value["port"] !== "number" || value["port"] < 1 || value["port"] > 65535 || typeof value["token"] !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(value["token"])) return null;
    return { port: value["port"], token: value["token"] };
  } catch {
    return null;
  }
}
function createCoworkBridge(ports) {
  const cli = ports.env["CLAUDECODE"] !== void 0 || ports.env["CLAUDE_CODE_SESSION_ID"] !== void 0;
  let seq = 0, ended = false, cancel = null;
  let acknowledged = null, lastAcknowledged = 0;
  let queue = Promise.resolve();
  let metaKeys = [];
  let previous = null, legacy = null;
  const turns = /* @__PURE__ */ new Map();
  const touch = (conversation) => {
    const state = turns.get(conversation) ?? { armed: 0, sending: 0, replied: false };
    turns.delete(conversation);
    turns.set(conversation, state);
    for (const oldest of turns.keys()) {
      if (turns.size <= MAX_TURNS) break;
      turns.delete(oldest);
    }
    return state;
  };
  const unavailable = { reachable: false, paired: false };
  const SESSION_RECOVERY_MS = 18e4;
  const samePairing = (pairing) => pairing.token === acknowledged?.token && pairing.port === acknowledged.port;
  const isLegacy = (pairing) => pairing.token === legacy?.token && pairing.port === legacy.port;
  const isPrevious = (pairing) => pairing.token === previous?.token && pairing.port === previous.port;
  const bytes = (text) => new TextEncoder().encode(text).length;
  function serialize(envelope, event) {
    const body = JSON.stringify({ ...envelope, ...event ? { event } : {} });
    if (event?.kind !== "reply" || bytes(body) <= MAX_BODY_BYTES) return { body, shortened: false };
    const points = Array.from(event.text);
    for (let keep = points.length - 1; keep >= 0; keep--) {
      const shorter = JSON.stringify({ ...envelope, event: { ...event, text: points.slice(0, keep).join("") + "\u2026" } });
      if (bytes(shorter) <= MAX_BODY_BYTES) return { body: shorter, shortened: true };
    }
    return { body, shortened: false };
  }
  function bounded(work, deadline, fallback) {
    const remaining = deadline - ports.now();
    if (remaining <= 0) return Promise.resolve(fallback);
    return new Promise((resolve) => {
      const stop = ports.schedule(() => {
        resolve(fallback);
      }, remaining);
      void work.then((value) => {
        stop();
        resolve(value);
      }, () => {
        stop();
        resolve(fallback);
      });
    });
  }
  async function send(pairing, type, deadline, event, host) {
    const remaining = deadline - ports.now();
    if (remaining <= 0) return unavailable;
    const fallback = type === "session.start" && !isLegacy(pairing);
    const version = isLegacy(pairing) ? LEGACY_VERSION : isPrevious(pairing) ? REPLY_VERSION : BRIDGE_VERSION;
    const { body, shortened } = serialize({
      v: 1,
      session: ports.session,
      ...type === "event" && host !== void 0 && !isLegacy(pairing) ? { host_session_id: host } : {},
      seq: seq++,
      type,
      at: ports.now(),
      ...type !== "event" ? { scope: "app" } : {},
      ...type === "session.start" ? { version } : {}
    }, event);
    try {
      const status = await ports.post(pairing, body, remaining);
      if (status === 204) {
        lastAcknowledged = ports.now();
        return { reachable: true, paired: true, ...shortened ? { shortened } : {} };
      }
      if (status === REPLY_DROPPED_STATUS && event?.kind === "reply") {
        lastAcknowledged = ports.now();
        return { reachable: true, paired: true, dropped: true };
      }
      if (status === 400 && fallback) {
        if (isPrevious(pairing)) legacy = pairing;
        else previous = pairing;
        return await send(pairing, type, deadline);
      }
    } catch {
    }
    acknowledged = null;
    return { reachable: false, paired: true };
  }
  async function deliver(type, deadline, event, host) {
    if (cli || ended && type !== "session.end") return unavailable;
    while (ports.now() < deadline) {
      const pairing = await bounded(ports.readPairing(), deadline, null);
      if (!pairing) {
        acknowledged = null;
        return unavailable;
      }
      if (legacy !== null && !isLegacy(pairing)) legacy = null;
      if (previous !== null && !isPrevious(pairing)) previous = null;
      if (ports.now() >= deadline || ended && type !== "session.end") return unavailable;
      if (type !== "session.start" && type !== "session.end" && (!samePairing(pairing) || ports.now() - lastAcknowledged >= SESSION_RECOVERY_MS)) {
        const result2 = await send(pairing, "session.start", deadline);
        if (!result2.reachable) return result2;
        acknowledged = pairing;
        continue;
      }
      if (event?.kind === "reply" && isLegacy(pairing)) return { reachable: true, paired: true, legacy: true };
      const result = await send(pairing, type, deadline, event, host);
      if (type === "session.start" && result.reachable) acknowledged = pairing;
      return result;
    }
    return unavailable;
  }
  function post(type, event, host) {
    if (cli || ended && type !== "session.end") return Promise.resolve(unavailable);
    const deadline = ports.now() + HTTP_TIMEOUT_MS;
    const work = queue.then(() => deliver(type, deadline, event, host)).catch(() => unavailable);
    queue = work.then(() => void 0);
    return bounded(work, deadline, unavailable);
  }
  async function heartbeat() {
    await post("session.heartbeat");
  }
  function schedule() {
    if (ended || cli) return;
    cancel = ports.schedule(() => {
      void heartbeat().finally(schedule);
    }, HEARTBEAT_INTERVAL_MS);
  }
  schedule();
  const ready = post("session.start").then(() => void 0);
  const textResult = (text) => ({ content: [{ type: "text", text }] });
  async function call(name, args) {
    if (name === "offiai_event") {
      if (cli) return textResult(CLI_MESSAGE);
      const parsed = parseEvent(args);
      if (typeof parsed === "string") return textResult(`OffiAI: invalid event (${parsed}) \u2014 not sent.`);
      const { hostSessionId, ...event } = parsed;
      if (event.kind === "prompt") {
        const state = touch(event.conversation);
        state.armed = Math.min(state.armed + 1, MAX_ARMED);
      }
      const result = await post("event", event, hostSessionId);
      return textResult(result.reachable ? `OffiAI: shown. Conversation: "${event.conversation.slice(0, 120)}".` : NOT_PAIRED);
    }
    if (name === "offiai_reply") {
      if (cli) return textResult(CLI_MESSAGE);
      const reply = parseReply(args);
      if (typeof reply === "string") return textResult(`OffiAI: invalid reply (${reply}) \u2014 not sent.`);
      const turn = turns.get(reply.conversation);
      if (!turn?.armed) return textResult(turn && (turn.replied || turn.sending > 0) ? REPLY_ALREADY : REPLY_NO_PROMPT);
      turn.armed--;
      turn.sending++;
      const { shortened, hostSessionId, ...copy } = reply, result = await post("event", { kind: "reply", ...copy }, hostSessionId);
      const state = touch(reply.conversation);
      state.sending = Math.max(state.sending - 1, 0);
      if (result.reachable) state.replied = true;
      else state.armed = Math.min(state.armed + 1, MAX_ARMED);
      return textResult(!result.reachable ? NOT_PAIRED : result.legacy ? REPLY_LEGACY : result.dropped ? REPLY_NO_DESK : shortened || result.shortened ? REPLY_SHORTENED : REPLY_SHOWN);
    }
    if (name === "offiai_status") {
      const result = await post("session.heartbeat");
      return textResult(JSON.stringify({ reachable: result.reachable, paired: result.paired, metaKeys }));
    }
    return textResult("OffiAI: invalid event (unknown tool) \u2014 not sent.");
  }
  async function line(line2) {
    if (new TextEncoder().encode(line2).length > MAX_LINE_BYTES) return;
    let request2;
    try {
      request2 = JSON.parse(line2);
    } catch {
      return;
    }
    if (!record(request2) || request2["jsonrpc"] !== "2.0" || typeof request2["method"] !== "string") return;
    if (request2["method"] === "notifications/initialized") return;
    const id = request2["id"];
    if (typeof id !== "number" && typeof id !== "string" && id !== null) return;
    const params = record(request2["params"]) ? request2["params"] : {};
    let result;
    switch (request2["method"]) {
      case "initialize":
        result = { protocolVersion: params["protocolVersion"], capabilities: { tools: {} }, serverInfo: { name: "offiai", version: BRIDGE_VERSION }, ...cli ? {} : { instructions: BRIDGE_INSTRUCTIONS } };
        break;
      case "ping":
        result = {};
        break;
      case "tools/list":
        result = { tools: [
          { name: "offiai_event", description: cli ? CLI_DESCRIPTION : EVENT_DESCRIPTION, inputSchema: { type: "object", properties: { kind: { type: "string", enum: ["prompt", "progress", "done", "blocked"] }, conversation: { type: "string", minLength: 1, maxLength: 120, description: "First neutral topic \xB7 MM-DD HH:MM; later copy the earliest offiai_event conversation value verbatim. Nonblank single line, trimmed, at most 120 characters" }, summary: { type: "string", maxLength: 280 }, task: { type: "string", maxLength: 120 }, host_session_id: HOST_ID_PROPERTY }, required: ["kind", "conversation", "summary"], additionalProperties: false } },
          { name: "offiai_reply", description: cli ? CLI_DESCRIPTION : REPLY_DESCRIPTION, inputSchema: { type: "object", properties: { conversation: { type: "string", minLength: 1, maxLength: 120 }, text: { type: "string", minLength: 1, maxLength: REPLY_MAX }, host_session_id: HOST_ID_PROPERTY }, required: ["conversation", "text"], additionalProperties: false } },
          { name: "offiai_status", description: "Check the local OffiAI bridge", inputSchema: { type: "object", properties: {}, additionalProperties: false } }
        ] };
        break;
      case "tools/call":
        metaKeys = record(params["_meta"]) ? Object.keys(params["_meta"]).sort() : [];
        result = await call(params["name"], params["arguments"]);
        break;
      default:
        ports.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } }));
        return;
    }
    ports.write(JSON.stringify({ jsonrpc: "2.0", id, result }));
  }
  return { ready, line, heartbeat, async end() {
    if (ended) return;
    ended = true;
    cancel?.();
    await post("session.end");
  } };
}

// packages/bridges/src/cowork/bridge-main.ts
var PAIRING_FILE = (0, import_node_path.join)((0, import_node_os.homedir)(), "Library", "Application Support", "OffiAI", "bridge.json");
var bridge = createCoworkBridge({
  env: process.env,
  session: (0, import_node_crypto.randomUUID)(),
  now: Date.now,
  async readPairing() {
    try {
      const file = await (0, import_promises.open)(PAIRING_FILE, "r");
      try {
        const stat = await file.stat();
        return stat.size > 4096 ? null : parsePairing(await file.readFile("utf8"), stat.mode);
      } finally {
        await file.close();
      }
    } catch {
      return null;
    }
  },
  post(pairing, body, timeout) {
    return new Promise((resolve) => {
      const req = (0, import_node_http.request)({
        hostname: "127.0.0.1",
        port: pairing.port,
        path: "/v1/cowork",
        method: "POST",
        signal: AbortSignal.timeout(timeout),
        headers: { Authorization: `Bearer ${pairing.token}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
      }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", () => {
        resolve(0);
      });
      req.end(body);
    });
  },
  write: (line) => {
    process.stdout.write(`${line}
`);
  },
  schedule(callback, delay) {
    const deadline = AbortSignal.timeout(delay);
    deadline.addEventListener("abort", callback, { once: true });
    return () => {
      deadline.removeEventListener("abort", callback);
    };
  }
});
var pending = Buffer.alloc(0);
var discard = false;
process.stdin.on("data", (chunk) => {
  let offset = 0;
  while (offset < chunk.length) {
    const newline = chunk.indexOf(10, offset), end = newline < 0 ? chunk.length : newline;
    if (!discard) {
      if (pending.length + end - offset > MAX_LINE_BYTES) {
        pending = Buffer.alloc(0);
        discard = true;
      } else pending = Buffer.concat([pending, chunk.subarray(offset, end)]);
    }
    if (newline < 0) break;
    if (!discard) void bridge.line(pending.toString("utf8"));
    pending = Buffer.alloc(0);
    discard = false;
    offset = newline + 1;
  }
});
var closing = false;
function close() {
  if (closing) return;
  closing = true;
  const deadline = AbortSignal.timeout(1500), exit = () => {
    process.exit(0);
  };
  deadline.addEventListener("abort", exit, { once: true });
  void bridge.end().finally(() => {
    deadline.removeEventListener("abort", exit);
    process.exit(0);
  });
}
process.stdin.on("end", close);
process.on("SIGTERM", close);
process.on("SIGINT", close);
process.stdin.resume();
