/**
 * Strip HTML tags and clean up description text
 */
export function stripHtmlTags(html: string, maxLength?: number): string {
  if (!html) return ''
  
  // Limit description length to prevent performance issues
  const defaultMaxLength = maxLength || 1000
  let limitedHtml = html.length > defaultMaxLength ? html.substring(0, defaultMaxLength) + '...' : html
  
  // Remove HTML tags
  let text = limitedHtml.replace(/<[^>]*>/g, '')
  
  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, ' ')
  text = text.replace(/&amp;/g, '&')
  text = text.replace(/&lt;/g, '<')
  text = text.replace(/&gt;/g, '>')
  text = text.replace(/&quot;/g, '"')
  text = text.replace(/&#39;/g, "'")
  text = text.replace(/&hellip;/g, '...')
  text = text.replace(/&mdash;/g, '—')
  text = text.replace(/&ndash;/g, '–')
  
  // Clean up extra whitespace and newlines
  text = text.replace(/\s+/g, ' ').trim()
  
  return text
}

/**
 * Truncate text to a specific length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text
  return text.substring(0, maxLength).trim() + '...'
}

/**
 * Format text for preview display (strip HTML and truncate)
 */
export function formatPreviewText(html: string, maxLength: number = 200): string {
  const cleanText = stripHtmlTags(html)
  return truncateText(cleanText, maxLength)
} 