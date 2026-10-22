#!/bin/sh
# Claude.app invokes this script natively on the Mac.
check_node() {
  [ -n "$1" ] && [ -x "$1" ] && "$1" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)' >/dev/null 2>&1
}
run_node() {
  if check_node "$1"; then exec "$1" "${CLAUDE_PLUGIN_ROOT}/mcp/offiai-bridge.cjs"; fi
}
run_node "$(command -v node 2>/dev/null)"
# An optional filesystem prefix lets offline packaging tests model an uninstalled Mac.
node_root=${OFFIAI_NODE_ROOT:-}
run_node "$node_root/opt/homebrew/bin/node"
run_node "$node_root/usr/local/bin/node"
run_node "$HOME/.volta/bin/node"
# Version order, rather than lexicographic order (v9 must not precede v22).
saved_ifs=$IFS
IFS='
'
for candidate in $(printf '%s\n' "$HOME"/.nvm/versions/node/*/bin/node | /usr/bin/sort -rV); do
  run_node "$candidate"
done
IFS=$saved_ifs
claude_runtime=${OFFIAI_CLAUDE_RUNTIME:-/Applications/Claude.app/Contents/MacOS/Claude}
if [ -x "$claude_runtime" ]; then
  probe=$(ELECTRON_RUN_AS_NODE=1 /usr/bin/perl -e 'alarm 3; exec @ARGV' "$claude_runtime" -e 'if(Number(process.versions.node.split(".")[0])>=18)process.stdout.write("ok")' 2>/dev/null)
  if [ "$probe" = ok ]; then
    ELECTRON_RUN_AS_NODE=1 exec "$claude_runtime" "${CLAUDE_PLUGIN_ROOT}/mcp/offiai-bridge.cjs"
  fi
fi
umask 077
status_dir="$HOME/Library/Application Support/OffiAI"
/bin/mkdir -p "$status_dir"
/bin/chmod 700 "$status_dir"
at=$(/bin/date +%s)
printf '{"v":1,"state":"no-node","at":%s}\n' "$((at * 1000))" > "$status_dir/bridge-status.json"
/bin/chmod 600 "$status_dir/bridge-status.json"
printf '%s\n' 'OffiAI: Node.js 18+ not found; install it from nodejs.org and restart the Claude app.' >&2
exit 1
