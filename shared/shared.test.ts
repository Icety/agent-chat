import { expect, test } from 'bun:test'
import { isWorking } from './working'
import { messagePreview } from './preview'
import { isUndelivered } from './delivery'
import { plainText } from './plain'

const NOW = new Date('2026-10-15T12:30:00Z')

test.each([
  ['activity, active 14 minutes ago', 'Running bun test', '2026-10-15T12:16:00Z', true],
  ['activity left over from 20 minutes ago', 'Running bun test', '2026-10-15T12:10:00Z', false],
  ['no activity', null, '2026-10-15T12:29:00Z', false],
] as const)('isWorking: %s', (_, activity, lastActivityAt, expected) => {
  expect(isWorking({ activity, lastActivityAt }, NOW)).toBe(expected)
})

test.each([
  ['text on one line', { text: 'Done.\n\nThe list is  in your notes.', attachments: [] }, 'Done. The list is in your notes.'],
  ['markdown as plain text', { text: '**Done.** See [the plan](https://x.example)', attachments: [] }, 'Done. See the plan'],
  ['long text cut at 80', { text: 'x'.repeat(100), attachments: [] }, `${'x'.repeat(79)}…`],
  ['a voice note shows its transcript', { text: '', transcript: 'Move gym to Saturday', attachments: [{ kind: 'audio' as const }] }, 'Move gym to Saturday'],
  ['a voice note without transcript', { text: '', attachments: [{ kind: 'audio' as const }] }, 'Voice note'],
  ['one photo', { text: '', attachments: [{ kind: 'image' as const }] }, 'Photo'],
  ['two files', { text: '', attachments: [{ kind: 'file' as const }, { kind: 'file' as const }] }, '2 files'],
])('messagePreview: %s', (_, message, expected) => {
  expect(messagePreview(message)).toBe(expected)
})

test.each([
  ['failed', { status: 'failed', createdAt: '2026-10-15T12:29:00Z', retriedAt: null }, true],
  ['pending for 11 minutes', { status: 'pending', createdAt: '2026-10-15T12:19:00Z', retriedAt: null }, true],
  ['pending, retried a minute ago', { status: 'pending', createdAt: '2026-10-15T11:00:00Z', retriedAt: '2026-10-15T12:29:00Z' }, false],
  ['delivered long ago', { status: 'delivered', createdAt: '2026-10-15T09:00:00Z', retriedAt: null }, false],
])('isUndelivered: %s', (_, message, expected) => {
  expect(isUndelivered(message, NOW)).toBe(expected)
})

test.each([
  ['heading, emphasis and code', '## Found it\nThe colours in `tones.css` are **light only**.', 'Found it The colours in tones.css are light only.'],
  ['lists and quotes', '> Note\n- one\n2. two\n- [x] done', 'Note one two done'],
  ['links and images', 'See [docs](https://a.example) and ![chart](c.png)', 'See docs and chart'],
  ['code fence and table', '```css\n.a { color: red; }\n```\n| a | b |\n| --- | --- |\n| 1 | 2 |', '.a { color: red; } a b 1 2'],
])('plainText: %s', (_, markdown, expected) => {
  expect(plainText(markdown)).toBe(expected)
})
