# OffiAI plugins

Plugins that show your AI sessions in [OffiAI](https://offiai.app)'s 3D office on your Mac.

| Plugin | For | Install guide |
|---|---|---|
| [`offiai`](plugins/offiai) | Claude desktop app (Cowork) | https://offiai.app/install/claude-cowork/ |

The Claude Code CLI needs no plugin (OffiAI sees its sessions on its own), and the Codex CLI uses an
installer from the [releases page](https://github.com/offiai/releases/releases): https://offiai.app/install/codex/

## Add this marketplace

Claude desktop app: *Customize → Plugins → Add marketplace* → `offiai/claude-plugins`, then install **offiai**.

Or upload the single-file package `offiai.plugin` from the [releases page](https://github.com/offiai/releases/releases)
(*Plugins → My Uploads*).

Everything stays on your Mac: the plugin's bridge talks to OffiAI over 127.0.0.1 only.
