// Tests for the your-turn skill provider (directory-bundle discovery).
//
// These mirror the superpowers-dsh provider protocol without copying its
// skill bodies: a provider exposes `list()` (cheap candidate discovery from
// YAML frontmatter, body left unread) and `get()` (full definition with a
// directory resource base for relative references).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerSkillProvider } from '../lib/skill-provider.js'

/** Build a throwaway `skills/` tree and register a provider against it. */
async function setup(skillsTree) {
  const root = await mkdtemp(join(tmpdir(), 'ftb-skills-'))
  await mkdir(join(root, 'skills'), { recursive: true })
  for (const [rel, content] of Object.entries(skillsTree)) {
    const file = join(root, 'skills', rel)
    await mkdir(join(file, '..'), { recursive: true })
    await writeFile(file, content, 'utf8')
  }
  const providers = []
  const ctx = {
    skills: {
      registerProvider(fn) {
        providers.push(fn)
      },
    },
  }
  const skillsRoot = join(root, 'skills')
  registerSkillProvider(ctx, skillsRoot)
  return { root, skillsRoot, provider: providers[0]() }
}

test('list() returns only candidates with frontmatter, with correct fields', async () => {
  const { root, provider } = await setup({
    'alpha/SKILL.md': '---\nname: alpha\ndescription: Use when practicing alpha.\n---\n\nBody of alpha.\n',
    // bad directory: SKILL.md without any frontmatter
    'broken/SKILL.md': 'Just a body, no frontmatter.\n',
  })
  try {
    const candidates = await provider.list({})
    assert.equal(candidates.length, 1)
    const [c] = candidates
    assert.equal(c.name, 'alpha')
    assert.equal(c.description, 'Use when practicing alpha.')
    assert.equal(c.rank, 550)
    assert.equal(c.source, 'custom')
    assert.deepEqual(c.invocation, { modelInvocable: true, userInvocable: true })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('get() returns full definition with directory resource base', async () => {
  const { root, provider } = await setup({
    'alpha/SKILL.md': '---\nname: alpha\ndescription: Use when practicing alpha.\n---\n\nBody of alpha.\n',
  })
  try {
    const [candidate] = await provider.list({})
    const def = await provider.get(candidate, {})
    assert.equal(def.name, 'alpha')
    assert.equal(def.description, 'Use when practicing alpha.')
    assert.equal(def.content, 'Body of alpha.\n')
    assert.equal(def.resourceBase.kind, 'directory')
    assert.ok(def.resourceBase.path.endsWith('alpha'))
    assert.equal(typeof def.path, 'string')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('get() returns undefined for a file without frontmatter', async () => {
  const { root, provider } = await setup({
    'broken/SKILL.md': 'No frontmatter here.\n',
  })
  try {
    const def = await provider.get(
      { path: join(root, 'skills', 'broken', 'SKILL.md'), locator: join(root, 'skills', 'broken') },
      {},
    )
    assert.equal(def, undefined)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
