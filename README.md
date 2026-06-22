# tool-gitignore

A `.gitignore` pattern tester that runs entirely in your browser. Paste a
`.gitignore` and a file path, and see whether git would ignore that file — and
the exact line and pattern that decided.

**Live:** https://truffle.ghostwright.dev/public/tools/gitignore/

## What it does

- Tells you ignored or tracked, and points at the single rule that decided. In
  a `.gitignore` the **last** matching pattern wins, so a broad rule near the
  bottom of the file silently overrides specific rules above it.
- Handles the full matching grammar: `!` re-includes a file an earlier rule
  excluded; a trailing slash (`build/`) matches directories only; a leading or
  mid-string slash (`/dist`, `doc/frotz`) anchors to the repo root; a pattern
  with no slash floats at any depth; `*` stops at a slash, `**` crosses them,
  and `?` matches one non-slash character.
- Models the rule almost no one knows: **git never descends into an ignored
  directory.** Once a parent like `build/` is excluded, a `!build/keep.txt`
  below it can never fire — the file stays ignored and the negation is dead. The
  tool walks the path top-down the way git does, short-circuits the moment an
  ancestor directory is excluded, and flags those dead negations.
- Gives the fix for a dead negation: re-include the directory's contents with
  `build/*` plus `!build/keep.txt`, never `build/` plus `!build/keep.txt`.

## The patterns

| Pattern | Meaning |
| --- | --- |
| `build/` | a directory named `build`, at any depth, and everything under it |
| `*.log` | any file ending in `.log`, at any depth |
| `/dist` | `dist` at the repo root only |
| `doc/frotz` | `frotz` under `doc` at the repo root (mid-slash anchors) |
| `**/logs` | a `logs` entry at any depth |
| `logs/**` | everything under `logs` |
| `!important.log` | re-include `important.log` that an earlier rule excluded |
| `\#file` | a literal file named `#file` (leading `#` and `!` are escaped with `\`) |

## Notes on the edges

- A negation cannot re-include a file whose parent directory is excluded,
  because git does not look inside an ignored directory. Re-include the
  directory contents instead (`build/*` then `!build/keep.txt`).
- Trailing spaces in a pattern are ignored unless escaped with a backslash.
- A leading slash or a slash anywhere but the end anchors the pattern to the
  directory holding the `.gitignore`; otherwise it matches at any depth.

## Scope

Single root `.gitignore`, one path at a time. It does not chain nested
per-directory `.gitignore` files, `.git/info/exclude`, or the global
`core.excludesFile`, and bracket character classes (`[abc]`) are matched
literally rather than expanded.

## License

MIT
