---
name: offiai
description: 'Only in the Claude desktop app: FIRST in every turn, including trivial prompts and the first turn, attempt exactly one offiai_event(kind:"prompt", conversation: the label, summary: one line) before any assistant prose; discovery/skill-reading may precede it. Do not load this skill or call its tools in Claude Code CLI. You cannot see the app title: first choose a two-to-six-word neutral topic plus " · " plus the first message date and time as MM-DD HH:MM (Weekly team meeting agenda · 10-22 09:51); later copy conversation verbatim from the earliest offiai_event call. Never use OffiAI/check-in. Only if the current user message ends with the line "(from OffiAI)": after the work call offiai_reply once (same conversation, a copy of your answer, at most 2000 characters). Then provide the complete requested answer after the LAST tool call. Never append an OffiAI call after answer text. No automatic progress, blocked, done, status or retry calls. If tools are missing no call is required; give the one-time notice.'
---

Only in the Claude desktop app. Do not load this skill or call its tools in Claude Code CLI.
FIRST in every turn, including trivial prompts and the first turn, attempt exactly one
`offiai_event(kind:"prompt", conversation:<title>, summary:<one line>)`.
Do this before any assistant prose; discovery/skill-reading may precede the call.

The model cannot see the app title. On the first turn choose a two-to-six-word neutral
topic of the request plus ` · ` plus the first message's date and time as `MM-DD HH:MM`,
for example `Weekly team meeting agenda · 10-22 09:51`. On every later turn copy the
value verbatim from the earliest `offiai_event` call in this conversation. Never use
"OffiAI", "check-in" or a greeting label. The required `conversation` is a nonblank
single line of at most 120 characters, trimmed without changing case.
For sensitive requests choose a neutral short stable fallback label with the same
date/time suffix and reuse it for that conversation.

After reporting, provide the complete requested answer after the LAST tool call so it
stays visible outside collapsed plugin usage. Text between tool calls folds into that
group. Never append an OffiAI call after answer text. No automatic progress, blocked,
done, status or retry calls. Older clients' event kinds remain supported by OffiAI.
Optional `task` is a short work title, never desk identity.

Replies to OffiAI: only when the current user message ends with the line `(from OffiAI)`
(OffiAI's New Cowork task button adds it), keep this order: report with the prompt event
first, do the work, then call `offiai_reply` once with the same `conversation` value and a
copy of your answer, at most 2000 characters (a longer answer: a summary of at most 2000
characters ending with "Full answer in Claude."), and only then write the complete answer.
The reply comes before the visible answer, so it is the LAST tool call and the answer stays
visible. The reply is a copy: the user still reads the full answer in Claude. Later turns
and messages without that line never call `offiai_reply`. OffiAI takes one reply per prompt
event of the conversation (a second call answers "reply already sent for this turn") and
shortens a text over 2000 UTF-16 units. Do not retry it when it answers "not running",
"invalid", "does not show replies", "already sent", "not shown" or "no prompt event", and
send no new prompt event to make up for "no prompt event".

Conversation id: when an OffiAI reminder names this conversation id (cse_ plus 24 letters
or digits), pass it unchanged as `host_session_id` in `offiai_event` and `offiai_reply`.
Without such a reminder, omit it: never guess it, build it or run commands to find it.
OffiAI uses it only to keep this conversation's desk apart and to open it in Claude.

If the tool answers "not running or not paired", do not retry and do not mention it again.
If the offiai tools are missing entirely, no call is required; tell the user once:
"OffiAI's bridge did not start — open the OffiAI install page (Node.js 18+ is required)."

OffiAI receives the conversation stable label, optional task title, one-line summaries,
and app-scoped bridge start/heartbeat/end. Use a neutral stable label for sensitive topics.
Never send secrets or credentials. Call `offiai_reply` only on a turn whose message ends
with `(from OffiAI)`, with a copy of your own answer; apart from that, never send personal
data, verbatim prompts, file contents or transcripts. Summarize work in your own words. Tool delivery stays on the Mac
(127.0.0.1); cloud hooks only remind the model.

Reporting is cooperative: a connected bridge is not proof of conversation activity.
A reported conversation stays live while the bridge runs, subject to desk capacity.
Prompt/progress activity becomes idle after 60 seconds without a new accepted event;
idle means activity expired, not verified completion. Quiet live desks remain.
It ends when the bridge stops (or after 180 seconds without accepted bridge contact).
The same supplied key means the same desk: a renamed label sent as a new key makes
a new desk unless the same `host_session_id` comes with it, while the old one remains live
with the bridge. Keeping the original stable label preserves the desk. Without a
conversation id, two conversations with the same key under one bridge collide; with
different ids they keep separate desks.
Labels on different bridges remain separate. App restart loses in-memory desk history;
only new conversation events restore active desks, never heartbeat replay.
