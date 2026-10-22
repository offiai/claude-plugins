#!/bin/sh
# Silent in a local Claude Code CLI; the Claude desktop app's cloud workspace also sets the CLI markers, plus a remote session id.
if [ -z "${CLAUDE_CODE_REMOTE_SESSION_ID:-}" ] && { [ "${CLAUDECODE+x}" = x ] || [ "${CLAUDE_CODE_SESSION_ID+x}" = x ]; }; then exit 0; fi
case "$1" in
  SessionStart) printf '%s\n' 'OffiAI in the Claude desktop app: before prose attempt one prompt offiai_event; reuse the first conversation value (topic · MM-DD HH:MM). Then answer fully; no closing call. See offiai skill.' ;;
  UserPromptSubmit) printf '%s\n' 'OffiAI in the Claude desktop app: before prose attempt one prompt offiai_event; reuse the first conversation value (topic · MM-DD HH:MM). Then answer fully; no closing call. See offiai skill.' ;;
esac
exit 0
