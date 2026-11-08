// Markdown as one line of plain text, for previews (chat list, briefing rows, ...): no heading,
// quote or list marks, no emphasis or code ticks, link and image text without their targets,
// table pipes and HTML tags dropped, all whitespace collapsed.
export const plainText = (markdown: string): string => markdown
  .split('\n')
  .map(line => line
    .replace(/^\s*(?:```|~~~).*$/, '')
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/, '')
    .replace(/^\s*(?:#{1,6}\s+|>\s?)+/, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, ''))
  .join(' ')
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/(\*\*|__|~~|\*|_|`)(.+?)\1/g, '$2')
  .replace(/\s*\|\s*/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
