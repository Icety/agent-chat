import { plainText } from './plain'

// One line about a message for chat lists: its text as plain text, or what it carries ("Photo", "Voice note").
export const PREVIEW_MAX = 80

export const messagePreview = (message: { text: string, transcript?: string | null, attachments: { kind: 'image' | 'audio' | 'file' }[] }): string => {
  const text = plainText(message.text) || message.transcript?.replace(/\s+/g, ' ').trim() || ''
  if (text) return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX - 1).trimEnd()}…` : text
  const kinds = message.attachments.map(a => a.kind)
  if (kinds.includes('audio')) return 'Voice note'
  if (kinds.includes('image')) return kinds.length > 1 ? `${kinds.length} photos` : 'Photo'
  if (kinds.length) return kinds.length > 1 ? `${kinds.length} files` : 'File'
  return ''
}
