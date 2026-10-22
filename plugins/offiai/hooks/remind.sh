#!/bin/sh
# Silent in a local Claude Code CLI; the Claude desktop app's cloud workspace also sets the CLI markers, plus a remote session id.
if [ -z "${CLAUDE_CODE_REMOTE_SESSION_ID:-}" ] && { [ "${CLAUDECODE+x}" = x ] || [ "${CLAUDE_CODE_SESSION_ID+x}" = x ]; }; then exit 0; fi
# T-190: a remote id of the form cse_ plus 24 ASCII letters or digits is named for Claude; any other value keeps the plain line.
# The 62 characters are listed one by one, so the result does not depend on the locale.
id=${CLAUDE_CODE_REMOTE_SESSION_ID:-}; tail=${id#cse_}
case $tail in *[!ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789]*) id= ;; esac
[ "$tail" != "$id" ] && [ ${#tail} -eq 24 ] || id=
line='OffiAI in the Claude desktop app: before prose attempt one prompt offiai_event; reuse the first conversation value (topic · MM-DD HH:MM). Then answer fully; no closing call. See offiai skill.'
[ -z "$id" ] || line="OffiAI: before prose one prompt offiai_event; reuse the first conversation value; this conversation id: $id; pass it as host_session_id. Then answer fully; no closing call."
case "$1" in
  SessionStart) printf '%s\n' "$line" ;;
  UserPromptSubmit) printf '%s\n' "$line" ;;
esac
exit 0
