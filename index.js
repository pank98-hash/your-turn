// your-turn: a learning skill bundle for the DeepSeek Harness.
//
// A Cordis plugin that registers a skill provider into the HOST layer of the
// `ctx.skills` registry, so every agent preset's scope chain merges the
// your-turn skill. The skill body lives in `../skills/your-turn/
// SKILL.md` inside this package.
//
// This plugin also registers two READ-ONLY Host tools (`learning_check` /
// `learning_status`) that report learning progress. Both tools only spawn a
// subprocess (`python -m unittest`) and read the repo tree; they never write
// `src/`, `tutorials/`, `tests/`, or `.solutions/`, and never grade/rate.
//
// IMPORTANT: this file imports NO DSH internals — only node built-ins. The
// tools are registered as plain-object ToolDefinitions via `ctx.tools.register`,
// which accepts the raw shape and does not require `defineTool`. `defineTool`
// is merely a shorthand compiler that turns a terse parameter spec into JSON
// Schema; here the full JSON Schema is hand-written and `execute` validates its
// own arguments (the plain-object path does not auto-validate against
// `parameters` the way `defineTool`'s wrapper does).
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { registerSkillProvider } from './lib/skill-provider.js'
import { buildCheckReport, buildStatusReport } from './lib/report.js'

const name = 'your-turn'
const inject = ['skills', 'tools']

// JSON Schema for the `learning_check` parameters. `required: ['cwd']`.
const CHECK_PARAMETERS = {
  type: 'object',
  properties: {
    cwd: { type: 'string', description: '目标仓库根目录（含 tests/ 与 .solutions/）' },
    mode: { type: 'string', enum: ['run', 'summary'], description: 'run=跑测试出完整绿红报告；summary=只出每点状态。默认 run' },
    point: { type: 'string', description: '只报告这一个关键点；省略则报告全部' },
  },
  required: ['cwd'],
}

// JSON Schema for the `learning_status` parameters. `required: ['cwd']`.
const STATUS_PARAMETERS = {
  type: 'object',
  properties: {
    cwd: { type: 'string', description: '目标仓库根目录' },
    point: { type: 'string', description: '只报告这一个关键点；省略则报告全部' },
  },
  required: ['cwd'],
}

/** Reject a non-object args bag or a missing/empty `cwd`. */
function validateCwd(args) {
  if (typeof args !== 'object' || args === null) {
    throw new TypeError('arguments must be an object')
  }
  if (typeof args.cwd !== 'string' || args.cwd === '') {
    throw new TypeError("argument 'cwd' must be a non-empty string")
  }
  return args.cwd
}

function apply(ctx, config) {
  // index.js lives at the PACKAGE ROOT (not under lib/), so `skills/` is a
  // direct sibling — unlike superpowers-dsh, whose index.js is under lib/ and
  // therefore needs the `..` hop. The `..` here would resolve to the workspace
  // root and silently make the skill undiscoverable.
  const skillsRoot = join(dirname(fileURLToPath(import.meta.url)), 'skills')
  registerSkillProvider(ctx, skillsRoot)

  const python = config?.python || 'python3'

  ctx.tools.register({
    name: 'learning_check',
    description: 'Check learning progress in a your-turn repo: run its unittest suite and report each learning point as pending / done / in-progress. Read-only — never writes files.',
    parameters: CHECK_PARAMETERS,
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args) {
      const cwd = validateCwd(args)
      const mode = args.mode ?? 'run'
      if (mode !== 'run' && mode !== 'summary') {
        throw new TypeError("argument 'mode' must be 'run' or 'summary'")
      }
      const point = args.point
      if (point !== undefined && typeof point !== 'string') {
        throw new TypeError("argument 'point' must be a string")
      }
      return buildCheckReport(cwd, python, { mode, point })
    },
  })

  ctx.tools.register({
    name: 'learning_status',
    description: 'Report the status of every learning point in a your-turn repo (point / module / solution / status). Read-only — never writes files.',
    parameters: STATUS_PARAMETERS,
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args) {
      const cwd = validateCwd(args)
      const point = args.point
      if (point !== undefined && typeof point !== 'string') {
        throw new TypeError("argument 'point' must be a string")
      }
      return buildStatusReport(cwd, python, { point })
    },
  })
}

export { apply, name, inject }
export default { apply, name, inject }
