# OffiAI for the Claude desktop app

OffiAI is a macOS app that shows your AI agents' sessions as desks in a small 3D office. This plugin brings your
Claude desktop app (Cowork) conversations into that office: each reported conversation gets its own desk, named after
what you asked, with the one-line notes Claude sends about its work.

## Requirements

- macOS with the OffiAI app open on the same Mac (preview builds: https://offiai.app/#get and
  https://github.com/offiai/releases/releases). Plugin 0.4.0 requires OffiAI beta 23 or newer. Install the app update
  before updating this plugin; an older app receives an update-required reply from the bridge.
- Node.js 18 or newer. The plugin's small bridge runs with the Node.js already on your Mac; if it finds none, it tries
  the Claude app's own runtime. If it still cannot start, install Node.js from https://nodejs.org and restart the
  Claude app. An organization policy can block plugin MCP servers.

## Install

In the Claude desktop app open Customize → Plugins → Add → Add marketplace, enter `offiai/claude-plugins` and install
**offiai**. Or upload `offiai.plugin` from the releases page (Plugins → Upload plugin). The app warns that the plugin
includes a local MCP server — that is the bridge described below. The first time Claude asks to use an offiai tool,
choose Always allow. Step-by-step guide: https://offiai.app/install/claude-cowork/

In this preview, ask Claude to report the conversation, for example "Report this conversation to OffiAI".

## What the plugin contains, runs and sends

- **Local MCP server** — `mcp/launch.sh` finds Node.js and starts `mcp/offiai-bridge.cjs` on your Mac while the Claude
  app is open. The bridge reads the pairing file that OffiAI writes at
  `~/Library/Application Support/OffiAI/bridge.json` (a local port and a token) and sends its messages only to OffiAI
  on 127.0.0.1. The bridge contacts no other address and writes no files. Only when no Node.js 18+ is found,
  `launch.sh` writes `~/Library/Application Support/OffiAI/bridge-status.json` (the state `no-node` and a time) so
  OffiAI can tell you why the bridge did not start.
- **Policy and responses** — the local bridge forwards MCP requests to OffiAI and returns the app's result. OffiAI
  supplies tool instructions, validation, reply limits, delivery outcomes and status interpretation. The bridge keeps
  private pairing lookup, ordered bounded HTTP transport and the app-version handshake.
- **Tools** — `offiai_event` reports a step of the conversation; `offiai_reply` sends a copy of Claude's answer, which
  Claude is instructed to call only for a task you started from OffiAI; `offiai_status` checks the connection to OffiAI.
- **What OffiAI receives** — the conversation label Claude chooses (a short topic plus the start time), one-line
  summaries (Claude is instructed to write them in its own words), an optional task title, and app-scoped bridge start, heartbeat (every 60 seconds)
  and end messages. Claude is instructed to send a copy of its answer only for a task you start from OffiAI's
  **New Cowork task** button (its text ends with the line `(from OffiAI)`), and on no other turn or conversation. The
  app accepts at most one reply per reported turn (one per `offiai_event(kind:"prompt")` of that conversation) and
  shortens it to at most 2000 UTF-16 units. OffiAI shows a reply only on a live desk of that
  conversation, masks credentials, e-mail addresses and local paths, and keeps it only in memory while it runs. Claude is
  instructed never to send secrets or credentials and, apart from those replies, never personal data, verbatim prompts,
  file contents or transcripts, and to use a neutral label for a sensitive topic. When Claude passes it, the
  conversation's id from Claude's workspace (`cse_…`), so OffiAI's **Open in Claude** button can open that
  conversation; OffiAI uses it for nothing else and keeps it only in memory.
- **Skill `offiai`** — the reporting rules below.
- **Hooks** (`SessionStart`, `UserPromptSubmit`) — `hooks/remind.sh` prints a one-line reminder for Claude; in a Cowork
  workspace it includes this conversation's id (read from the workspace environment) so Claude can pass it on. It reads
  no files and uses no network. It stays silent in a local Claude Code CLI.
- If OffiAI is not open, the bridge returns a transport-unavailable error and nothing is sent. If the app is older than
  beta 23, the bridge asks you to update OffiAI for this plugin version.

## Rules Claude follows

Only in the Claude desktop app — the Claude Code CLI needs no plugin, because OffiAI observes CLI sessions directly:

- Report FIRST in every turn, including trivial prompts: before any assistant prose, exactly one
  `offiai_event(kind:"prompt", conversation: the label, summary: one line)`.
- The label: on the first turn a two-to-six-word neutral topic plus ` · ` plus the first message's date and time as
  `MM-DD HH:MM` (for example `Weekly team meeting agenda · 10-22 09:51`); on later turns the value copied verbatim from
  the earliest offiai_event call in the conversation.
- Then the complete requested answer, written after the LAST tool call so it stays visible. No automatic progress,
  blocked, done, status or retry calls.
- If told "not running or not paired": do not retry and do not mention it again. If the offiai tools are missing, no
  call is made; Claude says once that OffiAI's bridge did not start.

Only when your message ends with the line `(from OffiAI)`: Claude reports first, does the work, then calls
`offiai_reply` once with a copy of its answer (at most 2000 characters; a longer answer is summarized and ends with
"Full answer in Claude."), and writes the complete answer after that call. The reply comes before the visible answer:
Claude is instructed never to call it after the answer, so the full answer stays visible in Claude. Claude is instructed to send no reply on later turns and in
other conversations; OffiAI refuses a second reply for the same turn and shortens a reply that is still too long.

A desk stays while the bridge runs and goes idle a minute after the last report; when the Claude app stops the bridge
its desks end and leave the office a few seconds later. Two conversations with the same label share a desk unless
Claude passes each conversation's id.

## Asking from OffiAI

Click a Cowork desk in OffiAI, write a question in its drawer and press **New Cowork task**. The Claude app opens a new
Cowork task with your text filled in, followed by the line `(from OffiAI)`. Claude shows a caution banner for text that
comes from a link; that is expected. Nothing is sent until you press send in Claude. Claude is instructed to send a copy
of its answer, which appears on the new task's desk (plugin 0.3.0 or later; with an older plugin the answer shows in
Claude only, and the drawer says so). OffiAI never types into Claude and needs no extra macOS permission. When a Cowork
desk knows its conversation's id, its drawer also shows **Open in Claude**, which brings that conversation to the front
in the Claude app; nothing is typed or sent.

## Privacy, support, licence

Everything stays on your Mac. Website privacy policy: https://offiai.app/en/privacy.html. Questions:
preview@offiai.app. Licence: proprietary, all rights reserved.
