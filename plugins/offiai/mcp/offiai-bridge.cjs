"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// packages/bridges/src/cowork/bridge-main.ts
var import_node_crypto = require("node:crypto");
var import_node_http = require("node:http");

// packages/bridges/src/cowork/bridge-transport.ts
var HTTP_TIMEOUT_MS = 1500;
var HEARTBEAT_INTERVAL_MS = 6e4;
var MAX_LINE_BYTES = 64 * 1024;
var MAX_RESPONSE_BYTES = 256 * 1024;
var MAX_BODY_BYTES = 72 * 1024;
var UPDATE_REPLY = "Update OffiAI (beta 23 or newer) for this plugin version";
var RECORD = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function createCoworkTransport(ports) {
  let seq = 0, ended = false, cancel = null, acknowledged = null, incompatible = null;
  let queue = Promise.resolve();
  const markers = {
    claudecode: ports.env["CLAUDECODE"] !== void 0,
    codeSession: ports.env["CLAUDE_CODE_SESSION_ID"] !== void 0,
    remoteSession: ports.env["CLAUDE_CODE_REMOTE_SESSION_ID"] !== void 0
  };
  const same = (pairing) => pairing.port === acknowledged?.port && pairing.token === acknowledged.token;
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
  const unavailable = { kind: "unavailable" };
  async function send(pairing, type, deadline, request2, metaKeys) {
    const remaining = deadline - ports.now();
    if (remaining <= 0) return unavailable;
    const body = JSON.stringify({
      v: 2,
      session: ports.session,
      seq: seq++,
      at: ports.now(),
      version: "0.4.0",
      type,
      markers,
      ...request2 ? { request: request2 } : {},
      ...metaKeys ? { metaKeys } : {}
    });
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) return unavailable;
    try {
      const response = await ports.post(pairing, body, remaining);
      if (type === "session.start" && (response.status === 404 || response.status === 400)) {
        incompatible = pairing;
        return { kind: "update" };
      }
      if (response.status !== 200 || Buffer.byteLength(response.body) > MAX_RESPONSE_BYTES) return unavailable;
      const parsed = JSON.parse(response.body);
      if (!RECORD(parsed) || !Object.hasOwn(parsed, "result")) return unavailable;
      if (!RECORD(parsed["result"])) return unavailable;
      if (type !== "mcp" && parsed["result"]["accepted"] !== true) return unavailable;
      if (type === "mcp" && !(["result", "error"].includes(String(parsed["result"]["kind"])) && Object.hasOwn(parsed["result"], "value"))) return unavailable;
      return { kind: "ok", value: parsed["result"] };
    } catch {
      return unavailable;
    }
  }
  async function deliver(type, deadline, request2, metaKeys) {
    if (ended && type !== "session.end") return unavailable;
    let pairing = await bounded(ports.readPairing(), deadline, null);
    if (!pairing) {
      acknowledged = null;
      return unavailable;
    }
    if (incompatible && pairing.port === incompatible.port && pairing.token === incompatible.token) return { kind: "update" };
    incompatible = null;
    if (ports.now() >= deadline || ended && type !== "session.end") return unavailable;
    if (type !== "session.start" && type !== "session.end" && !same(pairing)) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const start = await send(pairing, "session.start", deadline);
        if (start.kind !== "ok") {
          acknowledged = null;
          return start;
        }
        acknowledged = pairing;
        const latest = await bounded(ports.readPairing(), deadline, null);
        if (!latest) {
          acknowledged = null;
          return unavailable;
        }
        if (latest.port === pairing.port && latest.token === pairing.token) break;
        pairing = latest;
        if (attempt === 3) {
          acknowledged = null;
          return unavailable;
        }
      }
    }
    const result = await send(pairing, type, deadline, request2, metaKeys);
    if (type === "session.start" && result.kind === "ok") acknowledged = pairing;
    if (result.kind !== "ok") acknowledged = null;
    return result;
  }
  function post(type, request2, metaKeys) {
    if (ended && type !== "session.end") return Promise.resolve(unavailable);
    const deadline = ports.now() + HTTP_TIMEOUT_MS;
    const work = queue.then(() => deliver(type, deadline, request2, metaKeys)).catch(() => unavailable);
    queue = work.then(() => void 0);
    return bounded(work, deadline, unavailable);
  }
  async function heartbeat() {
    await post("session.heartbeat");
  }
  function schedule() {
    if (ended) return;
    cancel = ports.schedule(() => {
      void heartbeat().finally(schedule);
    }, HEARTBEAT_INTERVAL_MS);
  }
  schedule();
  const ready = post("session.start").then(() => void 0);
  async function line(line2) {
    if (Buffer.byteLength(line2) > MAX_LINE_BYTES) return;
    let request2;
    try {
      request2 = JSON.parse(line2);
    } catch {
      return;
    }
    if (!RECORD(request2) || request2["jsonrpc"] !== "2.0" || typeof request2["method"] !== "string") return;
    if (request2["method"] === "notifications/initialized") return;
    const id = request2["id"];
    if (typeof id !== "number" && typeof id !== "string" && id !== null) return;
    const params = RECORD(request2["params"]) ? request2["params"] : {};
    const metaKeys = RECORD(params["_meta"]) ? Object.keys(params["_meta"]).sort() : [];
    const safeParams = { ...params };
    delete safeParams["_meta"];
    const result = await post("mcp", { method: request2["method"], params: safeParams }, metaKeys);
    const delivered = result.kind === "ok" ? result.value : null;
    const answer = result.kind === "update" ? { jsonrpc: "2.0", id, error: { code: -32e3, message: UPDATE_REPLY } } : delivered === null ? { jsonrpc: "2.0", id, error: { code: -32e3, message: "OffiAI transport unavailable" } } : RECORD(delivered) && delivered["kind"] === "error" ? { jsonrpc: "2.0", id, error: delivered["value"] } : { jsonrpc: "2.0", id, result: RECORD(delivered) ? delivered["value"] : null };
    ports.write(JSON.stringify(answer));
  }
  return { ready, line, heartbeat, async end() {
    if (ended) return;
    ended = true;
    cancel?.();
    await post("session.end");
  } };
}

// packages/bridges/src/local-bridge/post.ts
var nativeFs = __toESM(require("node:fs/promises"), 1);

// packages/bridges/src/local-bridge/support-dir.ts
var import_node_os = require("node:os");
var import_node_path = require("node:path");
var SUPPORT_DIR_NAME = "OffiAI";
var PAIRING_FILE_NAME = "bridge.json";
var posixAbsolute = (path) => path !== "" && !path.includes("\0") && import_node_path.posix.isAbsolute(path);
var win32Absolute = (path) => !path.includes("\0") && (/^[A-Za-z]:[\\/]/.test(path) || /^\\\\[^\\/]+[\\/][^\\/]+/.test(path));
function platformPath(platform) {
  return platform === "win32" ? import_node_path.win32 : import_node_path.posix;
}
function supportDir(platform, env) {
  if (platform === "win32") {
    if (!win32Absolute(env.home)) return null;
    return import_node_path.win32.join(env.appData !== void 0 && win32Absolute(env.appData) ? env.appData : import_node_path.win32.join(env.home, "AppData", "Roaming"), SUPPORT_DIR_NAME);
  }
  if (!posixAbsolute(env.home)) return null;
  if (platform === "darwin") return import_node_path.posix.join(env.home, "Library", "Application Support", "OffiAI");
  return import_node_path.posix.join(env.xdgConfigHome !== void 0 && posixAbsolute(env.xdgConfigHome) ? env.xdgConfigHome : import_node_path.posix.join(env.home, ".config"), SUPPORT_DIR_NAME);
}
function pairingDir(platform, env) {
  const isolated = env.isolatedUserData;
  if (isolated !== void 0 && (platform === "win32" ? win32Absolute(isolated) : posixAbsolute(isolated))) return platformPath(platform).join(isolated, SUPPORT_DIR_NAME);
  return supportDir(platform, env);
}
function supportEnv() {
  return {
    home: (0, import_node_os.homedir)(),
    appData: process.env["APPDATA"],
    xdgConfigHome: process.env["XDG_CONFIG_HOME"],
    isolatedUserData: process.env["OFICINA_E2E"] === "1" ? process.env["OFICINA_ISOLATED_USER_DATA"] : void 0
  };
}
var POSIX_PRIVACY = {
  kind: "posix",
  pairingMode: (mode) => (mode & 127) === 0,
  pairingLink: () => true,
  stateDir: (info, uid) => info.isDirectory() && !info.isSymbolicLink() && info.uid === uid && (info.mode & 511) === 448,
  stateFile: (info, uid) => info.isFile() && !info.isSymbolicLink() && info.uid === uid && (info.mode & 511) === 384
};
var WIN32_PRIVACY = {
  kind: "win32",
  pairingMode: () => true,
  pairingLink: (link) => link.isFile() && !link.isSymbolicLink(),
  stateDir: (info) => info.isDirectory() && !info.isSymbolicLink(),
  stateFile: (info) => info.isFile() && !info.isSymbolicLink()
};
function privacyPolicy(platform) {
  return platform === "win32" ? WIN32_PRIVACY : POSIX_PRIVACY;
}

// packages/bridges/src/cowork/pairing.ts
var RECORD2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function parsePairing(text, mode, privacy = POSIX_PRIVACY) {
  if (!privacy.pairingMode(mode)) return null;
  try {
    const value = JSON.parse(text);
    if (!RECORD2(value) || value["v"] !== 1 || !Number.isInteger(value["port"]) || typeof value["port"] !== "number" || value["port"] < 1 || value["port"] > 65535 || typeof value["token"] !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(value["token"])) return null;
    return { port: value["port"], token: value["token"] };
  } catch {
    return null;
  }
}

// packages/bridges/src/local-bridge/post.ts
async function readPairing(ports = {}) {
  try {
    const platform = ports.platform ?? process.platform, fs = ports.fs ?? nativeFs, privacy = privacyPolicy(platform);
    const dir = pairingDir(platform, ports.env ?? supportEnv());
    if (dir === null) return null;
    const file = platformPath(platform).join(dir, PAIRING_FILE_NAME);
    if (privacy.kind === "win32" && !privacy.pairingLink(await fs.lstat(file))) return null;
    const handle = await fs.open(file, "r");
    try {
      const info = await handle.stat();
      return info.size <= 4096 ? parsePairing(await handle.readFile("utf8"), info.mode, privacy) : null;
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

// packages/bridges/src/cowork/bridge-main.ts
var bridge = createCoworkTransport({
  env: process.env,
  session: (0, import_node_crypto.randomUUID)(),
  now: Date.now,
  readPairing: () => readPairing(),
  post(pairing, body, timeout) {
    return new Promise((resolve) => {
      const req = (0, import_node_http.request)({
        hostname: "127.0.0.1",
        port: pairing.port,
        path: "/v1/cowork/plugin",
        method: "POST",
        signal: AbortSignal.timeout(timeout),
        headers: { Authorization: `Bearer ${pairing.token}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
      }, (res) => {
        const chunks = [];
        let bytes = 0;
        res.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > MAX_RESPONSE_BYTES) {
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
        });
        res.on("error", () => {
          resolve({ status: 0, body: "" });
        });
      });
      req.on("error", () => {
        resolve({ status: 0, body: "" });
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
