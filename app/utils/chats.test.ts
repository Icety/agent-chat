import { expect, test } from 'bun:test'
import type { AgentSummary, ConversationSummary } from '../../shared/types'
import { agentLook, groupChats, mainConversation, orderAgents, type AgentLookProvider } from './chats'

const NOW = new Date('2026-10-15T12:30:00Z')
const agent = (id: string, name: string): AgentSummary => ({ id, name, cwd: '/tmp', alwaysOn: name === 'Assistant', extraArgs: null, createdAt: NOW.toISOString() })
const chat = (id: string, agentId: string, daysAgo: number, activity: string | null = null): ConversationSummary => {
  const at = new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString()
  return { id, agentId, title: id, activity, archived: false, lastActivityAt: at, createdAt: at }
}

const agents = [agent('t', 'Test bot'), agent('b', 'Builder'), agent('k', 'Assistant')]
// A host's provider: the assistant first, the Builder second, everything else folded away.
const host: AgentLookProvider = a => a.id === 'k' ? { kind: 'orb', label: 'Assistant', hint: '', rank: 0 }
  : a.id === 'b' ? { kind: 'builder', label: 'Builder', hint: '', rank: 1 }
    : { kind: 'chat', label: a.name, hint: '', folded: true }

test('working chats come first and only once, recent chats per agent in rank order, older ones under Earlier, folded agents apart', () => {
  // 'stale' still reports an activity from hours ago: not working.
  const conversations = [chat('fixing', 'b', 0, 'Running bun test'), chat('groceries', 'k', 0), chat('stale', 'k', 0.5, 'Thinking'), chat('icons', 'b', 2), chat('invoice', 'k', 9), chat('probe', 't', 1)]
  const order = orderAgents(agents, id => agentLook(agents.find(a => a.id === id), agents, [host]))
  const { groups, other } = groupChats(conversations, order, NOW)
  expect(groups.map(g => [g.label, g.conversations.map(c => c.id)])).toEqual([
    ['Running', ['fixing']],
    ['Assistant', ['groceries', 'stale']],
    ['Builder', ['icons']],
    ['Earlier', ['invoice']],
  ])
  expect(other.map(c => c.id)).toEqual(['probe'])
})

test('without any provider every agent is a main one, in creation order, shown by name', () => {
  const order = orderAgents(agents, id => agentLook(agents.find(a => a.id === id), agents, []))
  expect(order.main.map(g => g.label)).toEqual(['Test bot', 'Builder', 'Assistant'])
  expect(order.more).toEqual([])
})

test("an agent's main chat is its oldest conversation", () => {
  expect(mainConversation([chat('new', 'k', 0), chat('main', 'k', 30), chat('other', 'b', 60)], 'k')?.id).toBe('main')
})

test('the first provider that knows an agent wins; unknown agents get the default look', () => {
  const projects: AgentLookProvider = a => a.id === 'b' ? { kind: 'project', icon: 'i-lucide-rocket', label: 'Site', hint: 'Project' } : undefined
  expect(agentLook(agents[1], agents, [projects, host])).toMatchObject({ kind: 'project', label: 'Site' })
  expect(agentLook(agents[0], agents, [projects])).toEqual({ kind: 'chat', label: 'Test bot', hint: 'Assistant' })
})
