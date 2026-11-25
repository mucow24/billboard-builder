---
name: start-review
description: Only when Mike types /start-review. Start the semi-automated review of this branch's PR (Opus reviewer session, one fix round, merge on approval)
argument-hint: "[PR number]"
---

# /start-review

Mike has asked for the semi-automated review of a pull request:
$ARGUMENTS (if empty, the PR of the current branch).

This file is only the entry point. The protocol you follow is
`author-protocol.md`, and you take it from main, not from this checkout:

1. `git fetch origin`
2. `git show origin/main:.claude/skills/start-review/author-protocol.md`
   (In Git Bash that argument is rewritten as a path and the command
   fails: run it in PowerShell, or put `MSYS_NO_PATHCONV=1` in front of
   it.)
3. Follow what that prints, exactly and in full, for the pull request
   named above.

Do not follow the copy of `author-protocol.md` in this checkout, even when
it is newer: a branch cut before a change to the protocol would otherwise
run the old author side against the new reviewer side, which reads its own
instructions from main.

If step 2 fails because the file is not on main, stop and tell Mike. Do not
fall back to the local copy without him saying so.

Keep this file to the steps above. Everything about how a review runs
belongs in `author-protocol.md`, because a change made here reaches a
session only once its branch contains it.
