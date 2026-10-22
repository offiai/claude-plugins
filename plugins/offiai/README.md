# OffiAI for the Claude desktop app

OffiAI is a macOS app that shows your AI agents' sessions as desks in a small 3D office. This plugin brings your
Claude desktop app (Cowork) conversations into that office: each reported conversation gets its own desk, named after
what you asked, with the one-line notes Claude sends about its work.

## Requirements

- macOS with the OffiAI app open on the same Mac (preview builds: https://offiai.app/#get and
  https://github.com/offiai/releases/releases).
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
- **Tools** — `offiai_event` reports a step of the conversation; `offiai_status` checks the connection to OffiAI.
- **What OffiAI receives** — the conversation label Claude chooses (a short topic plus the start time), one-line
  summaries in Claude's own words, an optional task title, and app-scoped bridge start, heartbeat (every 60 seconds)
  and end messages. Never secrets, credentials, personal data, verbatim prompts, file contents or transcripts; for a
  sensitive topic Claude uses a neutral label.
- **Skill `offiai`** — the reporting rules below.
- **Hooks** (`SessionStart`, `UserPromptSubmit`) — `hooks/remind.sh` prints a one-line reminder for Claude. It reads
  no files and uses no network. It stays silent in a local Claude Code CLI.
- If OffiAI is not open, the tools answer "not running or not paired" and nothing is sent.

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

A desk stays while the bridge runs and goes idle a minute after the last report; it ends when the Claude app stops the
bridge. Two conversations with the same label share a desk.

## Privacy, support, licence

Everything stays on your Mac. Website privacy policy: https://offiai.app/en/privacy.html. Questions:
preview@offiai.app. Licence: MIT.
