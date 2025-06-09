import { supabaseAdmin } from '@/lib/database/supabase'

// Helper function to check if a string is a valid UUID
export function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

// Helper function to convert slug to potential podcast title patterns
export function slugToPodcastPatterns(slug: string): string[] {
  const patterns = []
  
  // Convert slug to title-like patterns
  const titleCase = slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
  
  // Add various common patterns
  patterns.push(titleCase) // "Joe Rogan Experience"
  patterns.push(`The ${titleCase}`) // "The Joe Rogan Experience"
  patterns.push(slug.replace(/-/g, ' ').toUpperCase()) // "JOE ROGAN EXPERIENCE"
  patterns.push(slug.replace(/-/g, ' ').toLowerCase()) // "joe rogan experience"
  
  // Add variations with common podcast suffixes
  patterns.push(`${titleCase} Podcast`) // "Joe Rogan Experience Podcast"
  patterns.push(`${titleCase} Show`) // "Joe Rogan Experience Show"
  patterns.push(`The ${titleCase} Podcast`) // "The Joe Rogan Experience Podcast" 
  patterns.push(`The ${titleCase} Show`) // "The Joe Rogan Experience Show"
  
  // Add original slug patterns
  patterns.push(slug) // "joe-rogan-experience"
  patterns.push(slug.replace(/-/g, '')) // "joerogaexperience"
  
  return [...new Set(patterns)] // Remove duplicates
}

// Helper function to find podcast by slug or UUID
export async function findPodcastBySlugOrId(podcastId: string) {
  // First, try direct UUID lookup
  if (isValidUUID(podcastId)) {
    const { data: podcast, error } = await supabaseAdmin()
      .from('podcasts')
      .select('id, title')
      .eq('id', podcastId)
      .single()
    
    if (!error && podcast) {
      return podcast
    }
  }

  // Try finding by listen_notes_id if it looks like one
  if (/^[a-zA-Z0-9]+$/.test(podcastId) && podcastId.length > 10) {
    const { data: podcast, error } = await supabaseAdmin()
      .from('podcasts')
      .select('id, title')
      .eq('listen_notes_id', podcastId)
      .single()
    
    if (!error && podcast) {
      console.log(`✅ Found podcast by Listen Notes ID: ${podcast.title}`)
      return podcast
    }
  }
  
  // If not a UUID or UUID lookup failed, try slug-based lookup
  const patterns = slugToPodcastPatterns(podcastId)
  
  for (const pattern of patterns) {
    // Try exact title match (case-insensitive)
    const { data: podcast, error } = await supabaseAdmin()
      .from('podcasts')
      .select('id, title')
      .ilike('title', pattern)
      .limit(1)
      .single()
    
    if (!error && podcast) {
      console.log(`✅ Found podcast "${podcast.title}" using pattern "${pattern}"`)
      return podcast
    }
  }
  
  // Try partial matches
  for (const pattern of patterns) {
    const { data: podcast, error } = await supabaseAdmin()
      .from('podcasts')
      .select('id, title')
      .ilike('title', `%${pattern}%`)
      .limit(1)
      .single()
    
    if (!error && podcast) {
      console.log(`✅ Found podcast "${podcast.title}" using partial pattern "${pattern}"`)
      return podcast
    }
  }
  
  // Last resort: search for any podcast containing keywords from the slug
  const keywords = podcastId.split('-').filter(word => word.length > 2)
  if (keywords.length > 0) {
    const searchQuery = keywords.join(' | ') // Use OR search
    const { data: podcasts, error } = await supabaseAdmin()
      .from('podcasts')
      .select('id, title')
      .textSearch('title', searchQuery)
      .limit(1)
    
    if (!error && podcasts && podcasts.length > 0) {
      console.log(`✅ Found podcast "${podcasts[0].title}" using text search for "${searchQuery}"`)
      return podcasts[0]
    }
  }
  
  return null
}

// Helper function to find podcast with full episode data
export async function findPodcastWithEpisodes(podcastId: string) {
  // First, try direct UUID lookup
  if (isValidUUID(podcastId)) {
    const { data: podcast, error } = await supabaseAdmin()
      .from('podcasts')
      .select(`
        id,
        title,
        description,
        author,
        listen_notes_id,
        episodes(
          id,
          title,
          description,
          duration,
          audio_url,
          pub_date,
          listen_notes_id
        )
      `)
      .eq('id', podcastId)
      .single()
    
    if (!error && podcast) {
      return podcast
    }
  }

  // Try finding by listen_notes_id if it looks like one
  if (/^[a-zA-Z0-9]+$/.test(podcastId) && podcastId.length > 10) {
    const { data: podcast, error } = await supabaseAdmin()
      .from('podcasts')
      .select(`
        id,
        title,
        description,
        author,
        listen_notes_id,
        episodes(
          id,
          title,
          description,
          duration,
          audio_url,
          pub_date,
          listen_notes_id
        )
      `)
      .eq('listen_notes_id', podcastId)
      .single()
    
    if (!error && podcast) {
      console.log(`✅ Found podcast by Listen Notes ID: ${podcast.title}`)
      return podcast
    }
  }
  
  // If not a UUID or UUID lookup failed, try slug-based lookup
  const patterns = slugToPodcastPatterns(podcastId)
  
  for (const pattern of patterns) {
    // Try exact title match (case-insensitive)
    const { data: podcast, error } = await supabaseAdmin()
      .from('podcasts')
      .select(`
        id,
        title,
        description,
        author,
        listen_notes_id,
        episodes(
          id,
          title,
          description,
          duration,
          audio_url,
          pub_date,
          listen_notes_id
        )
      `)
      .ilike('title', pattern)
      .limit(1)
      .single()
    
    if (!error && podcast) {
      console.log(`✅ Found podcast "${podcast.title}" using pattern "${pattern}"`)
      return podcast
    }
  }
  
  // Try partial matches
  for (const pattern of patterns) {
    const { data: podcast, error } = await supabaseAdmin()
      .from('podcasts')
      .select(`
        id,
        title,
        description,
        author,
        listen_notes_id,
        episodes(
          id,
          title,
          description,
          duration,
          audio_url,
          pub_date,
          listen_notes_id
        )
      `)
      .ilike('title', `%${pattern}%`)
      .limit(1)
      .single()
    
    if (!error && podcast) {
      console.log(`✅ Found podcast "${podcast.title}" using partial pattern "${pattern}"`)
      return podcast
    }
  }
  
  return null
} 