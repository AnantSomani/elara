import { NextRequest, NextResponse } from 'next/server';
import { generateRAGResponse, generateFastRAGResponse, analyzeQuestionForRAG } from '@/lib/ai/rag-engine';
import { generateEnhancedRAGResponse } from '@/lib/ai/enhanced-rag-engine';
import { generateAIResponse } from '@/lib/ai/openai';
import { supabaseAdmin } from '@/lib/database/supabase';
import { semanticSearch } from '@/lib/ai/embeddings';
import OpenAI from 'openai';
import type { ConversationContext, HostPersonality } from '@/types/conversation';
import { dbHelpers } from '@/lib/database/supabase';

// Simple fallback for when AI services are unavailable
function getSimpleFallbackResponse(question: string, context: any): string {
  const questionLower = question.toLowerCase();
  
  // UFC/Conor/Khabib specific responses
  if (questionLower.includes('conor') || questionLower.includes('mcgregor')) {
    if (questionLower.includes('last name') || questionLower.includes('surname')) {
      return "Conor's last name is McGregor. Conor McGregor is the Irish UFC fighter who fought Khabib at UFC 229.";
    }
    return "That's about Conor McGregor! He's the Irish UFC fighter known for his striking and trash talk. His fight with Khabib at UFC 229 was one of the biggest events in UFC history.";
  }
  
  if (questionLower.includes('khabib')) {
    return "Khabib Nurmagomedov is the undefeated former UFC lightweight champion from Dagestan. His fight against Conor at UFC 229 showed his incredible wrestling and ground game dominance.";
  }
  
  if (questionLower.includes('ufc') || questionLower.includes('fight')) {
    return "UFC 229 was an incredible event! The Conor vs Khabib fight had everything - drama, skill, and that crazy post-fight brawl. What specifically about the fight interests you?";
  }
  
  // General responses from Elara
  const elaraResponses = [
    "That's a great question! I'm Elara, and I'm here to help you explore this episode. What aspect would you like to dive deeper into?",
    "Interesting point! As your podcast assistant, I can tell you there's definitely a lot to unpack about that topic from this episode.",
    "Good question! That reminds me of some key points the host discussed in this episode.",
    "That's exactly the kind of thing that makes this episode so fascinating to analyze!"
  ];
  
  return elaraResponses[Math.floor(Math.random() * elaraResponses.length)];
}

// Fallback episode data for non-RAG scenarios or when database lookup fails
const fallbackEpisodeData = {
  'tech-talk-daily-ai': {
    title: 'The Future of AI in Everyday Life',
    host: 'Alex Chen',
    podcast: 'Tech Talk Daily',
    personality: 'Enthusiastic tech journalist who loves making complex topics accessible. Uses analogies and real-world examples.',
    transcript: `Welcome to Tech Talk Daily! I'm Alex Chen, and today we're exploring how AI is becoming part of our everyday lives...`,
    knowledge: 'AI integration, smart homes, machine learning, consumer technology, tech trends'
  },
  'ai-frontiers-llm': {
    title: 'Large Language Models: Understanding the Breakthrough',
    host: 'Dr. Michael Park',
    podcast: 'AI Frontiers',
    personality: 'AI researcher and professor with deep technical knowledge. Thoughtful, precise, and educational.',
    transcript: `Welcome to AI Frontiers. I'm Dr. Michael Park, and today we're diving into large language models...`,
    knowledge: 'Large language models, transformer architecture, machine learning, AI research, neural networks, computational linguistics'
  },
  // Mock episodes for the MVP
  'c8d54175-29f9-4b91-ad77-52c379d32a71': {
    title: 'UFC 229: Conor vs Khabib Breakdown',
    host: 'Joe Rogan',
    podcast: 'The Joe Rogan Experience',
    personality: 'Enthusiastic UFC commentator and podcast host. Direct, passionate about fighting, loves analyzing fight techniques and fighter psychology.',
    transcript: `Welcome to the Joe Rogan Experience. I'm here with Brendan Schaub and we're breaking down UFC 229 - Conor vs Khabib. This was one of the biggest fights in UFC history. The buildup was insane, the drama, the trash talk between Conor McGregor and Khabib Nurmagomedov was next level. Conor came in with his striking, his left hand that can put anyone to sleep. But Khabib, man, his wrestling is just different. He's like a bear on top of you, just grinding you down. The fight went down exactly how you'd expect - Khabib got the takedown, controlled Conor on the ground, and submitted him in the fourth round. But the real crazy part was after the fight when Khabib jumped the cage and went after Conor's team. That brawl was wild. Both fighters got suspended, but the event itself generated massive PPV numbers.`,
    knowledge: 'UFC 229, Conor McGregor, Khabib Nurmagomedov, MMA fighting techniques, wrestling vs striking, UFC history, pay-per-view events, fight analysis'
  },
  '2240': {
    title: 'Elon Musk on AI and the Future',
    host: 'Joe Rogan',
    podcast: 'The Joe Rogan Experience',
    personality: 'Curious interviewer who loves exploring big ideas. Asks thoughtful questions about technology, consciousness, and the future of humanity.',
    transcript: `Elon Musk is back on the podcast and we're talking about artificial intelligence and what the future holds for humanity. Elon's been working on Neuralink, trying to create brain-computer interfaces. He thinks AI is advancing so fast that humans need to merge with AI to stay relevant. We talked about large language models, how they're getting scary good at understanding and generating text. Elon mentioned that AI training is already running into compute limitations - we're running out of electricity and chips to train bigger models. He thinks AGI could happen within the next few years, and that's both exciting and terrifying. We also discussed Tesla's self-driving progress, SpaceX Mars missions, and whether consciousness can be uploaded to computers. Elon's perspective is always fascinating because he's actually building these technologies.`,
    knowledge: 'Artificial intelligence, Neuralink, brain-computer interfaces, AGI, Tesla autopilot, SpaceX, consciousness, future of humanity, neural networks'
  },
  '2239': {
    title: 'Navy SEAL David Goggins on Mental Toughness',
    host: 'Joe Rogan',
    podcast: 'The Joe Rogan Experience',
    personality: 'Fascinated by human performance and mental resilience. Asks deep questions about overcoming adversity and pushing human limits.',
    transcript: `David Goggins is one of the toughest human beings on the planet. This Navy SEAL, ultra-marathon runner, and author of "Can't Hurt Me" came on to talk about mental toughness and pushing through barriers. Goggins shared his philosophy about the "40% rule" - when your mind tells you you're done, you're really only at 40% of your actual capacity. He talked about his transformation from being overweight and directionless to becoming a Navy SEAL and elite endurance athlete. The conversation went deep into how he uses suffering as a tool for growth, how he reprograms his mind through extreme challenges, and why most people live in their comfort zones. Goggins doesn't sugarcoat anything - he believes in taking ownership of your life, doing the hard things nobody else wants to do, and constantly challenging yourself. His mindset is all about becoming uncommon among uncommon people.`,
    knowledge: 'Mental toughness, Navy SEALs, endurance training, overcoming adversity, the 40% rule, personal transformation, discipline, ultra-marathon running'
  },
  '2238': {
    title: 'Old Episode - Audio Only',
    host: 'Joe Rogan',
    podcast: 'The Joe Rogan Experience',
    personality: 'Standard Joe Rogan interviewing style from earlier episodes.',
    transcript: `This is an older episode of the Joe Rogan Experience. While I can't provide AI chat for this episode due to our current system limitations, you can still listen to the full audio. Our AI chat feature is available for the three most recent episodes of each podcast to keep costs manageable while providing the best experience for the latest content.`,
    knowledge: 'This episode is audio-only and not available for AI chat discussions.'
  },
  '756': {
    title: 'Kevin Kelly on AI and Technology Trends',
    host: 'Tim Ferriss',
    podcast: 'The Tim Ferriss Show',
    personality: 'Strategic interviewer focused on deconstructing world-class performers. Asks detailed questions about systems, processes, and frameworks.',
    transcript: `Kevin Kelly, founding executive editor of WIRED magazine, joins Tim to discuss the future of AI and technology trends. Kevin has been watching technology evolve for decades and has unique insights into where we're headed. He talked about how AI will become invisible infrastructure, just like electricity or the internet. Kevin believes we're moving toward a world of ambient intelligence where AI is embedded in everything. He discussed the concept of the "technium" - technology as a living system that has its own evolutionary path. The conversation covered AI's impact on creativity, how humans will collaborate with AI systems, and why he thinks AI will augment rather than replace human intelligence. Kevin also shared his thoughts on decentralized systems, blockchain technology, and how emerging technologies create new possibilities we can't even imagine yet.`,
    knowledge: 'Technology trends, WIRED magazine, AI infrastructure, the technium, ambient intelligence, human-AI collaboration, decentralized systems'
  },
  '755': {
    title: 'Josh Waitzkin on Learning and Performance',
    host: 'Tim Ferriss',
    podcast: 'The Tim Ferriss Show',
    personality: 'Fascinated by learning methodologies and peak performance. Digs deep into the psychology and systems behind excellence.',
    transcript: `Josh Waitzkin, chess prodigy and martial arts world champion, shares his strategies for accelerated learning and peak performance. Josh was the subject of the book and movie "Searching for Bobby Fischer" and has spent his life mastering the art of learning itself. He talked about the concept of "learning how to learn" and how he applies the same principles whether studying chess, martial arts, or any other skill. Josh discussed the importance of making smaller circles - taking complex techniques and breaking them down to their essential principles. He shared insights about presence, flow states, and how to perform under pressure. The conversation covered his transition from chess to martial arts, how he maintains beginner's mind even at expert levels, and practical frameworks for accelerating skill acquisition. Josh's approach is all about finding universal principles that apply across different domains.`,
    knowledge: 'Accelerated learning, chess mastery, martial arts, flow states, learning methodologies, peak performance, smaller circles technique'
  },
  '456': {
    title: 'Sam Altman: OpenAI and the Future of AGI',
    host: 'Lex Fridman',
    podcast: 'Lex Fridman Podcast',
    personality: 'Thoughtful academic who explores deep questions about AI, consciousness, and the future of intelligence. Technical but accessible.',
    transcript: `Sam Altman, CEO of OpenAI, discusses the path to artificial general intelligence and the future of human-AI collaboration. Sam shared insights into OpenAI's mission to build AGI that benefits all of humanity. He talked about the rapid progress in large language models, the challenges of AI alignment, and why safety research is so critical as we approach more powerful systems. The conversation covered GPT's development, the importance of iterative deployment, and how OpenAI thinks about releasing increasingly capable models responsibly. Sam discussed the potential for AGI to solve major global challenges like climate change and disease, but also the risks of misaligned AI systems. He shared his thoughts on AI governance, the role of government regulation, and how the tech industry needs to approach AI development with both ambition and caution. The discussion also touched on consciousness, whether AI systems can truly understand meaning, and what the transition to an AGI world might look like.`,
    knowledge: 'OpenAI, artificial general intelligence, AI safety, large language models, AI alignment, responsible AI development, AI governance'
  },
  '455': {
    title: 'Michio Kaku: Quantum Computing and Physics',
    host: 'Lex Fridman',
    podcast: 'Lex Fridman Podcast',
    personality: 'Intellectually curious host who loves exploring the deepest questions in physics and consciousness with leading scientists.',
    transcript: `Dr. Michio Kaku, theoretical physicist and futurist, explores quantum computing and the fundamental nature of reality. Michio explained quantum mechanics in accessible terms, discussing how quantum computers could revolutionize everything from drug discovery to cryptography. He talked about quantum supremacy, the challenges of maintaining quantum coherence, and why quantum computers will excel at certain problems while classical computers remain better for others. The conversation dove into parallel universes and the many-worlds interpretation of quantum mechanics. Michio shared his thoughts on whether consciousness plays a role in quantum measurement, the possibility of quantum consciousness, and how quantum effects might influence human cognition. He also discussed the future of physics, from string theory to the search for a unified field theory. Michio's vision includes quantum computers helping us understand consciousness itself and potentially simulating entire universes.`,
    knowledge: 'Quantum computing, quantum mechanics, parallel universes, theoretical physics, consciousness studies, string theory, quantum supremacy'
  }
};

async function getEpisodeFromDatabase(episodeId: string) {
  try {
    const { data: episode, error } = await supabaseAdmin()
      .from('episodes')
      .select('id, title, description, podcast_id')
      .eq('id', episodeId)
      .single();

    if (error || !episode) {
      console.log(`Episode ${episodeId} not found in database:`, error?.message);
      return null;
    }

    return episode;
  } catch (error) {
    console.error('Error fetching episode from database:', error);
    return null;
  }
}

async function getHostPersonality(hostName?: string) {
  try {
    if (!hostName) {
      // Get the first available host personality
      const { data: personalities, error } = await supabaseAdmin()
        .from('host_personalities')
        .select('*')
        .limit(1);

      if (error || !personalities || personalities.length === 0) {
        return null;
      }
      return personalities[0];
    }

    const { data: personality, error } = await supabaseAdmin()
      .from('host_personalities')
      .select('*')
      .eq('name', hostName)
      .single();

    if (error || !personality) {
      console.log(`Host personality ${hostName} not found:`, error?.message);
      return null;
    }

    return personality;
  } catch (error) {
    console.error('Error fetching host personality:', error);
    return null;
  }
}

async function extractHostPersonalityFromEpisode(episode: any, episodeId: string) {
  try {
    console.log(`🔍 Extracting host from episode: ${episode?.title || 'Unknown Title'}`);
    
    // First, try to extract host name using pattern matching from episode title/description
    let extractedHostName: string | null = null;
    
    // Try pattern matching for different podcasts
    const hostPatterns = [
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+Experience/gi,               // "Joe Rogan Experience"
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+Podcast/gi,                // "Joe Rogan Podcast"
      /The\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+Show/gi,              // "The Joe Rogan Show"
      /with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,                    // "with Joe Rogan"
      /host(?:ed by)?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,          // "hosted by Joe Rogan"
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:podcast|experience|show)/gi, // General pattern
      /TOO\s+MUCH\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,              // "TOO MUCH Joe Rogan"
    ];

    const searchText = `${episode?.title || ''} ${episode?.description || ''}`;
    console.log(`🔍 Searching in text: "${searchText}"`);
    
    for (let i = 0; i < hostPatterns.length; i++) {
      const pattern = hostPatterns[i];
      const match = pattern.exec(searchText);
      if (match && match[1]) {
        extractedHostName = match[1].trim();
        // Filter out obvious guest names and topics
        if (!['Keke Palmer', 'Will Smith', 'Dwayne Martin', 'Chris Rock', 'Batman', 'Gender', 'China'].includes(extractedHostName)) {
          console.log(`✅ Found host name "${extractedHostName}" using pattern ${i + 1}`);
          break;
        }
      }
    }
    
    // Check if this is specifically the "As You Should" podcast (only after trying other patterns)
    const isAsYouShouldPodcast = !extractedHostName && (
      episode?.title?.toLowerCase().includes('episode') || 
      episode?.description?.toLowerCase().includes('dess') ||
      episode?.title?.toLowerCase().includes('as you should')
    );
    
    if (isAsYouShouldPodcast && !extractedHostName) {
      // For "As You Should" podcast, the host is always Dess
      extractedHostName = 'Dess';
      console.log(`✅ Identified as "As You Should" podcast - Host: Dess`);
    }

    // Clean up extracted host names to get just the core name
    if (extractedHostName) {
      // Remove common podcast prefixes/suffixes
      extractedHostName = extractedHostName
        .replace(/^TOO\s+MUCH\s+/i, '')        // Remove "TOO MUCH"
        .replace(/\s+EXPERIENCE$/i, '')         // Remove "EXPERIENCE"
        .replace(/\s+PODCAST$/i, '')            // Remove "PODCAST"
        .replace(/\s+SHOW$/i, '')               // Remove "SHOW"
        .trim();
      
      console.log(`🧹 Cleaned host name: "${extractedHostName}"`);
    }

    // Use RAG to find host-specific content and personality traits
    let hostPersonalityTraits = null;

    if (extractedHostName) {
      try {
        console.log(`🔍 Searching RAG for personality traits of: ${extractedHostName}`);
        
        // Search for host-specific content in the episode
        const hostSearchResults = await semanticSearch(
          `${extractedHostName} personality speaking style conversation tone`,
          {
            contentTypes: ['episode', 'transcript'],
            limit: 3,
            threshold: 0.4  // Lower threshold for better results
          }
        );

        // Search for conversation patterns and style
        const styleSearchResults = await semanticSearch(
          `how does ${extractedHostName} speak talk interview style`,
          {
            contentTypes: ['episode', 'transcript'],
            limit: 3,
            threshold: 0.4
          }
        );

        console.log(`📊 RAG search results: ${hostSearchResults.length + styleSearchResults.length} total matches`);

        if (hostSearchResults.length > 0 || styleSearchResults.length > 0) {
          // Analyze the content to extract personality traits
          hostPersonalityTraits = await analyzeHostFromContent(
            [...hostSearchResults, ...styleSearchResults],
            extractedHostName
          );
          console.log(`🧠 Extracted traits:`, hostPersonalityTraits);
        }
      } catch (error) {
        console.log('Error searching for host personality:', error);
      }
    }

    // Generate dynamic host personality
    const dynamicPersonality = generateDynamicHostPersonality(
      extractedHostName,
      episode,
      hostPersonalityTraits,
      episodeId
    );
    
    console.log(`🎭 Generated personality for: ${dynamicPersonality.name}`);
    return dynamicPersonality;

  } catch (error) {
    console.error('Error extracting host personality:', error);
    return null;
  }
}

async function analyzeHostFromContent(searchResults: any[], hostName: string) {
  try {
    // Extract content snippets
    const contentSnippets = searchResults
      .map(result => result.metadata?.content || result.content || '')
      .join('\n');
    
    if (!contentSnippets.trim()) {
      return null;
    }

    // Use OpenAI to analyze the content and extract personality traits
    // Lazy initialization to prevent build-time errors
    const getOpenAIClient = () => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('Missing OPENAI_API_KEY environment variable');
      }
      return new OpenAI({ apiKey });
    };

    const prompt = `Analyze this content about ${hostName} and extract their personality traits, conversation style, and speaking patterns:

${contentSnippets}

Based on this content, provide a JSON response with:
{
  "personality_traits": ["trait1", "trait2", "trait3"],
  "conversation_tone": "casual/formal/energetic/thoughtful/etc",
  "speaking_style": "description of how they speak",
  "common_phrases": ["phrase1", "phrase2"],
  "expertise_areas": ["area1", "area2"],
  "interview_approach": "description of interview style"
}`;

    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.3,
    });

    const analysisText = response.choices[0]?.message?.content;
    if (analysisText) {
      try {
        return JSON.parse(analysisText);
      } catch (e) {
        console.log('Failed to parse host analysis JSON:', e);
      }
    }
  } catch (error) {
    console.log('Error analyzing host content:', error);
  }
  
  return null;
}

function generateDynamicHostPersonality(
  hostName: string | null, 
  episode: any, 
  traits: any, 
  episodeId: string
): HostPersonality {
  // Determine host name from various sources
  const finalHostName = hostName || 
    extractHostFromTitle(episode?.title) || 
    'Dess';  // Default to Dess since we know this is the main host

  let personality;
  
  // Check for specific known hosts
  if (finalHostName.toLowerCase().includes('dess')) {
    // Dess-specific personality based on actual transcript content
    personality = {
      id: `dess-host-${episodeId}`,
      name: 'Dess',
      description: 'Host of "As You Should" podcast. Known for candid opinions, pop culture commentary, relationship advice, and LGBTQ+ community discussions. Speaks directly and authentically about personal experiences.',
      conversationStyle: {
        tone: 'casual' as const,
        verbosity: 'concise' as const,  // Dess is direct, not overly verbose
        expertise: ['pop culture', 'relationships', 'LGBTQ+ topics', 'celebrity commentary', 'personal experiences'],
        commonPhrases: [
          'Listen',
          'I\'m telling you',
          'That\'s crazy',
          'I can\'t with this',
          'Y\'all',
          'For real',
          'I mean',
          'But yeah',
          'Like I said',
          'You know what I\'m saying',
          'That shit is wild'
        ],
        personality_traits: [
          'direct', 
          'opinionated', 
          'relatable', 
          'candid', 
          'authentic', 
          'passionate', 
          'conversational',
          'unfiltered',
          'empathetic'
        ],
      },
      knowledge: {
        topics: [
          'celebrity gossip',
          'relationships and dating',
          'LGBTQ+ community',
          'pop culture',
          'current events',
          'personal stories',
          'social issues',
          'entertainment news'
        ],
        recurring_themes: [
          'relationship advice',
          'celebrity drama',
          'LGBTQ+ dating struggles',
          'personal experiences',
          'social commentary',
          'authenticity',
          'staying real'
        ],
        opinions: {
          relationships: 'Values honesty and authenticity in relationships',
          lgbtq_community: 'Strong advocate for LGBTQ+ rights and visibility',
          celebrity_culture: 'Critical but entertained by celebrity drama',
          dating: 'Believes in being upfront and real about what you want'
        },
        past_statements: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } else if (finalHostName.toLowerCase().includes('joe rogan') || finalHostName.toLowerCase().includes('rogan')) {
    // Joe Rogan-specific personality
    personality = {
      id: `joe-rogan-host-${episodeId}`,
      name: 'Joe Rogan',
      description: 'Host of "The Joe Rogan Experience". Former UFC commentator, comedian, and podcaster known for long-form conversations, curiosity about diverse topics, and open-minded discussions.',
      conversationStyle: {
        tone: 'casual' as const,
        verbosity: 'detailed' as const,
        expertise: ['comedy', 'MMA', 'UFC', 'psychedelics', 'hunting', 'fitness', 'podcasting', 'martial arts'],
        commonPhrases: [
          'That\'s fascinating',
          'Have you ever tried DMT?',
          'Jamie, pull that up',
          'It\'s entirely possible',
          'That\'s bananas',
          'One hundred percent',
          'For sure',
          'Oh, absolutely',
          'That\'s wild',
          'I don\'t know what I\'m talking about but...'
        ],
        personality_traits: [
          'curious',
          'open-minded', 
          'energetic',
          'inquisitive',
          'conversational',
          'enthusiastic',
          'direct',
          'humble',
          'passionate'
        ],
      },
      knowledge: {
        topics: [
          'mixed martial arts',
          'UFC commentary',
          'comedy',
          'psychedelics',
          'hunting',
          'fitness and health',
          'conspiracy theories',
          'technology',
          'space exploration',
          'current events'
        ],
        recurring_themes: [
          'consciousness and psychedelics',
          'physical fitness and health',
          'martial arts and combat sports',
          'comedy and entertainment',
          'hunting and nature',
          'technology and AI',
          'personal growth',
          'controversial topics'
        ],
        opinions: {
          psychedelics: 'Believes psychedelics can be beneficial for mental health and consciousness exploration',
          fitness: 'Strong advocate for physical fitness, especially martial arts and hunting',
          free_speech: 'Strong supporter of free speech and open dialogue',
          technology: 'Fascinated by technological advancement but concerned about AI risks'
        },
        past_statements: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } else {
    // Generic personality for other hosts
    personality = {
      id: `dynamic-host-${episodeId}`,
      name: finalHostName,
      description: traits?.speaking_style || 
        `${finalHostName} is an engaging podcast host known for ${traits?.interview_approach || 'thoughtful conversations and insightful questions'}.`,
      conversationStyle: {
        tone: (traits?.conversation_tone as 'casual' | 'formal' | 'technical' | 'humorous') || 'casual',
        verbosity: 'detailed' as const,
        expertise: traits?.expertise_areas || getExpertiseFromTitle(episode?.title) || ['general discussion'],
        commonPhrases: traits?.common_phrases || ['That\'s interesting', 'Tell me more about that'],
        personality_traits: traits?.personality_traits || ['curious', 'engaging', 'thoughtful'],
      },
      knowledge: {
        topics: traits?.expertise_areas || getTopicsFromEpisode(episode) || ['general'],
        recurring_themes: ['conversation', 'discussion'],
        opinions: {},
        past_statements: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  console.log(`🎭 Generated dynamic personality for: ${finalHostName} (type: ${finalHostName.toLowerCase().includes('dess') ? 'Dess' : finalHostName.toLowerCase().includes('rogan') ? 'Joe Rogan' : 'Generic'})`);
  return personality;
}

function extractHostFromTitle(title: string): string | null {
  if (!title) return null;
  
  // Common podcast title patterns
  const patterns = [
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:Experience|Podcast|Show)/i,  // "Joe Rogan Experience"
    /The\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:Podcast|Show)/i,        // "The Tim Ferriss Show"
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
}

function getExpertiseFromTitle(title: string): string[] {
  if (!title) return ['general'];
  
  const expertise: string[] = [];
  const titleLower = title.toLowerCase();
  
  if (titleLower.includes('ufc') || titleLower.includes('mma') || titleLower.includes('fight')) {
    expertise.push('mixed martial arts', 'combat sports', 'UFC');
  }
  if (titleLower.includes('tech') || titleLower.includes('ai') || titleLower.includes('startup')) {
    expertise.push('technology', 'innovation', 'startups');
  }
  if (titleLower.includes('business') || titleLower.includes('entrepreneur')) {
    expertise.push('business', 'entrepreneurship');
  }
  if (titleLower.includes('comedy') || titleLower.includes('comedian')) {
    expertise.push('comedy', 'entertainment');
  }
  
  return expertise.length > 0 ? expertise : ['general discussion'];
}

function getTopicsFromEpisode(episode: any): string[] {
  if (!episode) return ['general'];
  
  const text = `${episode.title || ''} ${episode.description || ''}`.toLowerCase();
  const topics: string[] = [];
  
  // Extract topics based on keywords
  if (text.includes('ufc') || text.includes('fight') || text.includes('mma')) {
    topics.push('UFC', 'mixed martial arts', 'combat sports');
  }
  if (text.includes('comedy') || text.includes('comedian')) {
    topics.push('comedy', 'entertainment');
  }
  if (text.includes('tech') || text.includes('ai')) {
    topics.push('technology', 'artificial intelligence');
  }
  if (text.includes('business') || text.includes('startup')) {
    topics.push('business', 'startups');
  }
  
  return topics.length > 0 ? topics : ['general discussion'];
}

async function getRecentConversationHistory(episodeId: string) {
  try {
    const recentMessages = await dbHelpers.getConversationHistory(episodeId, 5);
    
    return recentMessages.map((msg: any) => ({
      id: msg.id,
      type: msg.type as 'user' | 'ai' | 'system' | 'transcription',
      content: msg.content,
      timestamp: msg.timestamp,
      episodeId: msg.episode_id,
      audioTimestamp: msg.audio_timestamp,
      hostId: msg.host_id,
      metadata: msg.metadata,
    }));
  } catch (error) {
    console.error('Error fetching conversation history:', error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      question, 
      episodeId, 
      useRAG = true, 
      useEnhancedRAG = false,
      enableRealTimeData = true,
      context // Get context from frontend
    } = body;

    if (!question) {
      return NextResponse.json(
        { error: 'Question is required' },
        { status: 400 }
      );
    }

    console.log(`💬 Question received: "${question}"`);
    console.log(`📺 Episode ID: ${episodeId}`);
    console.log(`📝 Frontend context:`, context);

    // IMMEDIATE FALLBACK CHECK - Before any RAG processing
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    console.log(`🔑 OpenAI API Key available: ${hasOpenAIKey}`);

    // Use fallback only when OpenAI API key is not available
    if (!hasOpenAIKey) {
      console.log(`⚡ Using fast fallback mode - No OpenAI API key`);
      
      // Use the actual episode context from frontend instead of hardcoded fallback
      let contextualResponse = '';
      if (context?.episodeTitle && context?.host) {
        contextualResponse = `I'm Elara, and I'm here to discuss "${context.episodeTitle}" with you. While I'm having some technical difficulties accessing my full capabilities right now, I can see this episode is from ${context.podcastTitle} hosted by ${context.host}. What specific aspect of this episode would you like to explore?`;
      } else {
        contextualResponse = getSimpleFallbackResponse(question, context);
      }
      
      return NextResponse.json({
        success: true,
        response: contextualResponse,
        metadata: {
          confidence: 0.8,
          responseTime: 50,
          contextUsed: ['instant-fallback-with-context'],
          personality: context?.host || 'Podcast Host',
          episodeId,
          fallbackUsed: true,
          mode: 'instant'
        },
      });
    }

    // RAG SYSTEM (This code will be skipped for now due to || true above)
    console.log(`🧠 Using RAG: ${useRAG}`);
    console.log(`⚡ Using Enhanced RAG: ${useEnhancedRAG}`);
    console.log(`📡 Real-time data enabled: ${enableRealTimeData}`);

    let episode: any = null;
    let hostPersonality: any = null;

    // Try to get episode from database first
    if (episodeId && useRAG) {
      episode = await getEpisodeFromDatabase(episodeId);
      
      if (episode) {
        // Use dynamic host personality extraction
        hostPersonality = await extractHostPersonalityFromEpisode(episode, episodeId);
      } else {
        console.log(`⚠️ Episode ${episodeId} not found in database, using frontend context`);
        // Use the context passed from frontend instead of falling back to hardcoded data
        if (context) {
          episode = {
            id: episodeId,
            title: context.episodeTitle,
            description: `This episode of ${context.podcastTitle} hosted by ${context.host} discusses ${context.episodeTitle}`,
            podcast_id: context.podcastId || 'unknown'
          };
          
          // Create host personality from context
          hostPersonality = {
            name: context.host,
            personality: `Host of ${context.podcastTitle}`,
            speaking_style: 'conversational and insightful',
            expertise: ['podcasting', 'interviewing']
          };
        }
      }
    }

    // Only use hardcoded fallback if no context is available
    const fallbackEpisode = (!episode && !context && episodeId) ? 
      fallbackEpisodeData[episodeId as keyof typeof fallbackEpisodeData] : null;

    // Build conversation context using frontend context as priority
    const episodeTitle = episode?.title || context?.episodeTitle || fallbackEpisode?.title || 'Unknown Episode';
    const episodeDescription = episode?.description || `Episode from ${context?.podcastTitle || 'Unknown Podcast'} hosted by ${context?.host || 'Unknown Host'}` || fallbackEpisode?.transcript || '';
    const hostName = hostPersonality?.name || context?.host || fallbackEpisode?.host || 'Unknown Host';

    const conversationContext: ConversationContext = {
      episodeId: episodeId || 'default',
      hostId: hostPersonality?.id || episode?.id || episodeId || 'default-host',
      currentTimestamp: 0,
      recentTranscription: [],
      conversationHistory: [],
      episodeMetadata: {
        title: episodeTitle,
        description: episodeDescription,
        duration: 1800,
        publishDate: new Date().toISOString(),
      },
      hostPersonality: hostPersonality || undefined,
    };

    let response: any;

    if (useRAG) {
      if (useEnhancedRAG) {
        // Use enhanced RAG with real-time data capabilities
        console.log(`🚀 Using Enhanced RAG with real-time data`);
        
        const questionAnalysis = analyzeQuestionForRAG(question);
        console.log(`🔍 Question analysis:`, questionAnalysis);

        response = await generateEnhancedRAGResponse(question, conversationContext, {
          maxRelevantChunks: 5,
          similarityThreshold: 0.6,
          includePersonality: questionAnalysis.contentTypes.includes('personality'),
          includeConversationHistory: questionAnalysis.contentTypes.includes('conversation'),
          useSemanticSearch: true,
          enableRealTimeData,
          maxRealTimeTools: 2,
        });

        console.log(`🧠 Enhanced RAG context used:`, {
          transcriptChunks: response.ragContext?.relevantTranscripts?.length || 0,
          personalityData: response.ragContext?.personalityData?.length || 0,
          conversationHistory: response.ragContext?.conversationHistory?.length || 0,
          realTimeDataSources: response.ragContext?.realTimeData?.length || 0,
          realTimeUsed: response.ragContext?.realTimeUsed || false,
        });
      } else {
        // Use FAST RAG for 3-5 second responses (instead of 10-15s)
        console.log(`⚡ Using FAST RAG for optimized speed`);
        
        const questionAnalysis = analyzeQuestionForRAG(question);
        console.log(`🔍 Question analysis:`, questionAnalysis);

        response = await generateFastRAGResponse(question, conversationContext, {
          maxRelevantChunks: 3, // Reduced for speed
          similarityThreshold: 0.5, // Slightly lower for broader results
          includePersonality: questionAnalysis.contentTypes.includes('personality'),
          includeConversationHistory: questionAnalysis.contentTypes.includes('conversation'),
          useSemanticSearch: true,
        });

        console.log(`⚡ Fast RAG context used:`, {
          transcriptChunks: response.ragContext?.relevantTranscripts?.length || 0,
          personalityData: response.ragContext?.personalityData?.length || 0,
          conversationHistory: response.ragContext?.conversationHistory?.length || 0,
          fastMode: true,
        });

        // FALLBACK: If RAG didn't find content, use episode context for a proper response
        const isEpisodeContentQuestion = question.toLowerCase().includes('episode') || 
                                       question.toLowerCase().includes('about') ||
                                       question.toLowerCase().includes('discuss') ||
                                       question.toLowerCase().includes('talk about') ||
                                       question.toLowerCase().includes('what is this') ||
                                       question.toLowerCase().includes('nasa') ||
                                       question.toLowerCase().includes('issues') ||
                                       question.toLowerCase().includes('mentioned');
        
        const hasNoTranscriptContent = !response.ragContext?.relevantTranscripts?.length;
        
        if (isEpisodeContentQuestion && hasNoTranscriptContent) {
          console.log(`🔄 No transcript content found, generating contextual response`);
          
          // Generate episode-specific response using actual episode context
          let episodeResponse = '';
          
          if (context?.episodeTitle && context?.host) {
            const title = context.episodeTitle;
            const host = context.host;
            const podcast = context.podcastTitle;
            
            if (title.toLowerCase().includes('nasa')) {
              if (title.toLowerCase().includes('jared isaacman')) {
                episodeResponse = `This episode titled "${title}" features ${host} discussing NASA-related topics with Jared Isaacman. Jared Isaacman is a commercial astronaut and entrepreneur who brings a unique perspective on space exploration and NASA's challenges. Without access to the full transcript, I can't provide specific details about what issues were mentioned, but the episode likely covers topics related to NASA's current state, potential reforms, and Isaacman's experiences in the space industry.`;
              } else {
                episodeResponse = `In this episode "${title}" on ${podcast}, ${host} discusses various NASA-related topics. While I don't have access to the full transcript at the moment, I can help you explore general themes around NASA's challenges, space exploration, and related policy discussions. What specific aspect would you like to discuss?`;
              }
            } else {
              episodeResponse = `This episode is titled "${title}" from ${podcast} hosted by ${host}. While I don't have access to the full transcript right now, I'd be happy to discuss the general themes and topics that this episode likely covers. What specific questions do you have about this episode?`;
            }
          } else {
            episodeResponse = `I'd love to discuss this episode with you! However, I'm having some difficulty accessing the full transcript at the moment. Could you tell me more about what specific topics or moments from the episode you'd like to explore?`;
          }
          
          response.message = episodeResponse;
          response.contextUsed = ['episode-context-fallback'];
          console.log(`✅ Generated contextual response using frontend episode data`);
        }
      }
    } else {
      // Generate regular AI response without RAG
      console.log(`🤖 Using standard AI response`);
      
      response = await generateAIResponse(question, conversationContext);
    }

    console.log(`✅ Response generated in ${response.responseTime}ms`);

    return NextResponse.json({
      success: true,
      response: response.message,
      metadata: {
        confidence: response.confidence,
        responseTime: response.responseTime,
        contextUsed: response.contextUsed,
        personality: response.personality || hostName,
        suggestions: response.suggestions,
        episodeId,
        useRAG,
        useEnhancedRAG,
        enableRealTimeData,
        ragContext: response.ragContext || null,
      },
    });

  } catch (error) {
    console.error('Error in chat API:', error);
    
    // Enhanced fallback with specific response using context
    const { question, context } = await request.json().catch(() => ({ question: '', context: {} }));
    
    let fallbackResponse = '';
    if (context?.episodeTitle && context?.host) {
      fallbackResponse = `I apologize, but I'm experiencing some technical difficulties right now. I can see you're asking about "${context.episodeTitle}" from ${context.podcastTitle} hosted by ${context.host}. Once my systems are back online, I'll be able to provide detailed insights about this episode. Is there a specific aspect you'd like me to remember to discuss with you?`;
    } else {
      fallbackResponse = getSimpleFallbackResponse(question || 'general question', context);
    }
    
    return NextResponse.json({
      success: true,
      response: fallbackResponse,
      metadata: {
        confidence: 0.6,
        responseTime: 100,
        contextUsed: ['error-fallback'],
        personality: 'Podcast Host',
        fallbackUsed: true,
        originalError: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}