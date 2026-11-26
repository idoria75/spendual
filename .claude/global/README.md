# Global Claude files

Copies of `~/.claude/CLAUDE.md` and `~/.claude/LANGUAGE.md` (user level, outside the repo), so a
fresh clone has them. Copy date: 2026-11-26. ⚠ The copies drift. The files in `~/.claude` win.

Install on a new machine:

```
mkdir -p ~/.claude
cp -n .claude/global/CLAUDE.md .claude/global/LANGUAGE.md ~/.claude/
```

`-n` keeps any file that already exists.

The repo has its own [CLAUDE.md](../../CLAUDE.md) and [LANGUAGE.md](../LANGUAGE.md). They need no install.
