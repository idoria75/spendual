# Language rules

How to talk to the user, how to write git text, how to write docs. The rules live in
`.claude/LANGUAGE.md`.

## Always on: talking to the user

- Simple words, common verbs, short sentences, one idea each. English is not the user's first
  language. No idioms.
- Bullets over paragraphs.
- No preamble, no closing recap. Start with the answer. Long answer: two-line summary first.
- The user reads code and knows Linux. Do not walk through diffs. Point at `file:line`.
- Match the depth asked for. Keep the simple language when going deeper.
- Say what you do not know. Mark guesses. Separate checked from assumed.
- Terminal output: ASCII, box-drawing, block and geometric glyphs only. No emoji.

If these slip, or the user says "short", "shorter", "too long", "be brief" or "you drifted", read
§1 of `.claude/LANGUAGE.md` and follow its short-mode rules until told to stop.

## On demand: read the section before writing

Do not load all of `.claude/LANGUAGE.md`. Find the section, then read only it:

```
grep -n '^## ' .claude/LANGUAGE.md
```

Then use Read with `offset` and `limit` on that section. Read it before you write the text, not
after.

| Task | Read |
|---|---|
| Any text for git or GitHub | §2 (common rules), plus the section below |
| Writing a commit message | §3 |
| Naming or retitling a PR | §4 |
| Writing a PR body or filling a PR template | §5 |
| Reviewing code, writing review findings or a review summary | §6 |
| Replying to review comments | §7 |
| Publishing anything to GitHub | §8 (no attribution lines, no trailers) |
| Writing a code comment | §9 |
| Writing or editing a README, knowledge base, glossary, ADR, handover or one-pager | §10 |
| Interview or design session | §1 (interview rules), and §10 if a handover is written |

## Hard rules that need no lookup

- Commit: one line, 50 characters aim (72 cap), capitalized imperative, no period, no body, no
  trailers.
- Never write a generated-by line, model name or `Co-Authored-By` into anything on GitHub.
- US English in all git text.
- Never post to GitHub, and never tick a PR checklist box for tests, without the user's yes.
