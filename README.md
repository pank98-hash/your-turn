# Your Turn（该你了）

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) learning plugin built around one idea: **the AI writes the question and grades it — you write the code.**

You don't become an "accept engineer" here. The agent hollows out the core of a solved exercise and hands it back to you; your job is to fill in the part that actually teaches you something. The agent's only remaining role is the red pen: it reports pass or fail and never rewrites your implementation or the tests.

## What it does

- Ships a `your-turn` skill that teaches the agent the whole workflow: pick the core knowledge point, write the acceptance tests (green baseline), freeze them, hollow out the implementation into a `raise NotImplementedError("… —— 等你来实现")` placeholder, move the reference solution into `.solutions/`, and write a `HOMEWORK.md` study guide.
- Registers two **read-only** Host tools:
  - `learning_check` — runs `python -m unittest` and reports each learning point as `pending` / `done` / `in-progress`.
  - `learning_status` — scans placeholders and `.solutions/` and reports `point / module / solution / status`.
- Adds a `Your Turn learner` agent preset that only judges pass/fail and is forbidden from filling in the blanks.

"Green" is decided by the tests alone — never by the agent's opinion of your code.

## Install

```sh
dsh plugin --profile web add @pank98-hash/your-turn
```

Then restart `dsh web` (or reload the profile). The skill becomes available as `your-turn`; the tools are `learning_check` and `learning_status`.

## Usage

Give the agent a solved exercise (source + tests) and ask it to turn it into a "Your Turn" assignment. The agent will:

1. Pick the core knowledge point(s) to hollow out.
2. Write/freeze the acceptance tests and commit them.
3. Hollow out the implementation and write the `.solutions/` reference + metadata.
4. Write `HOMEWORK.md` (architecture, TODO list, task cards, grading rules, hints).
5. Judge your work afterward with `learning_check` only — green or red, nothing else.

## Requirements

- `dsh` web profile (any host that can install a `dsh.bundle` plugin).
- A Python interpreter for running the learner's tests (configurable via the plugin's `python` config; defaults to `python3`).

## License

MIT
