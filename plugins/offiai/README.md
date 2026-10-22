# OffiAI Cowork plugin

Upload the built `offiai.plugin` in Claude desktop → Plugins → My Uploads → Upload/Install.
Keep OffiAI open and choose **Always allow** for offiai tools.
Requires macOS, Claude desktop, OffiAI and Node.js 18+. The native launcher searches
installed Node and probes Claude.app's runtime as a fallback. If it cannot start,
install Node.js from nodejs.org and restart Claude.app. Organization policy may block MCP.

The native stdio MCP bridge reaches OffiAI over Mac loopback. Cloud hooks only remind
Claude in the Claude desktop app to report FIRST in every turn including trivial prompts.
Before any assistant prose attempt exactly one
`offiai_event(kind:"prompt", conversation:<title>, summary:<one line>)`;
discovery/skill-reading may precede it. The model cannot see the app title. First choose
a two-to-six-word neutral topic of the request plus ` · ` plus the first message's date
and time as `MM-DD HH:MM` (for example `Weekly team meeting agenda · 10-22 09:51`).
Later copy the value verbatim from the earliest offiai_event call in this conversation;
never use "OffiAI" or "check-in". Provide the complete requested answer after the LAST
tool call, outside collapsed plugin usage; never append an OffiAI call after answer text.
No automatic progress, blocked, done, status or retry calls. Legacy wire kinds remain supported.
If told "not running or not paired", do not retry or mention it again. If tools are missing,
no call is required: tell the user once "OffiAI's bridge did not start — open the OffiAI
install page (Node.js 18+ is required)." Do not load the skill or call its tools in Claude Code CLI;
the hooks stay silent in a local Claude Code CLI.
A connected bridge shows `Cowork (waiting for a conversation)` until a conversation
reports. It is not evidence of active work. Each reporting conversation gets a desk,
subject to capacity. Reported conversations remain while their bridge lives, including
silent turns and done → idle. Prompt/progress activity becomes idle after 60 seconds
without another accepted event for that conversation, preserving its last event time,
handle, title and drawer events. This is activity expiry, not verified completion.
Heartbeats do not fabricate activity or refresh conversation events. Live Cowork idle
desks bypass the normal ten-minute idle grace, but still yield to active work at capacity.
Without accepted bridge contact for 180 seconds, all its conversations end. Replayed
messages do not extend contact. Ended desks are retained ten minutes.
There is no authoritative conversation-open/close signal: stale titles may remain until
bridge loss. Graceful MCP shutdown ends desks even if Claude's conversation UI stays open.
Exact conversation-close tracking needs a separate lifecycle signal, not an unbounded
lease extension.
Claude Code CLI sessions are observed directly; this bridge sends nothing in that host.

Codex accepted-start projection is covered by injected tests, including passive-session
merge preserving the desk. These tests do not establish when the host emits SessionStart
and do not guarantee a desk at TUI launch. Host startup timing remains unverified and
requires a separate lead-owned investigation.

Every event kind requires a nonblank single-line `conversation` title or stable label
of at most 120 characters (outer whitespace trimmed, case preserved). Optional `task`
is work metadata, never identity. OffiAI receives the conversation title/stable label,
optional task title, one-line summaries and app-scoped bridge start/heartbeat/end.
Use a neutral stable label for sensitive titles. Never send secrets, credentials, personal
data, verbatim prompts, file contents or transcripts. Tool delivery stays on the Mac;
the cloud model chooses what to report.

The same supplied key means the same desk. Renaming the title and sending the new key
creates a new desk; the old title remains while the bridge lives, subject to capacity.
Reusing the original stable label preserves it.
Two conversations with the same title in one bridge collide; titles on different bridges
remain separate. There is no automatic rename detection or native conversation discovery.

One process UUID and monotonic sequence are shared across calls. Delivery is serialized,
pairing is reread before posting, and app-scoped heartbeats run every 60 seconds.
Calls and shutdown have a 1.5 second total deadline. If OffiAI is absent, Claude continues
normally. Late app startup or re-pairing registers the surviving bridge again.
App restart loses in-memory desk history: waiting lasts until new conversation events,
without replaying stale summaries or heartbeat-based conversation recovery.
Update the app and uploaded plugin together: older unscoped or conversation-free
messages are rejected. Verify that the installed archive is current.

Build offline: `node tools/build-cowork-plugin.mjs --out <dir>`. The bundled CommonJS
bridge is an uncommitted build output. The archive has an explicit production file list;
test sources are excluded. A self-contained runtime is future work.

