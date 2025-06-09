/**
 * Real-time data tools for RAG system enhancement
 * Provides current information that goes beyond static podcast content
 */

import { web_search } from '@/lib/tools/web-search';
import OpenAI from 'openai';

// Lazy OpenAI client initialization
let _openai: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing OPENAI_API_KEY environment variable');
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

export interface ToolResult {
  tool: string;
  query: string;
  data: any;
  timestamp: string;
  success: boolean;
  error?: string;
}

export interface SportsStat {
  player: string;
  team: string;
  season: string;
  stats: Record<string, number>;
  lastUpdated: string;
}

export interface NewsItem {
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
  url: string;
}

/**
 * Detect if a query needs real-time data
 */
export function needsRealTimeData(query: string): {
  needsRealTime: boolean;
  category: 'sports' | 'news' | 'stocks' | 'weather' | 'general' | null;
  entities: string[];
} {
  const lowerQuery = query.toLowerCase();
  
  // Enhanced sports indicators - including fight outcomes, results, winners
  const sportsKeywords = /\b(stats?|statistics|scores?|standings?|record|performance|season|playoffs?|championship|win|won|winning|winner|result|outcome|fight|match|game|defeat|beat|victory|lost|lose)\b/;
  const sportsContext = /\b(ufc|mma|nba|nfl|mlb|nhl|boxing|fighting|warriors|lakers|curry|lebron|james|conor|mcgregor|khabib|fight|fighters?|versus|vs|against)\b/;
  const currentContext = /\b(2024|2025|current|this season|latest|today|yesterday|recent|actually|ended up|final|who won)\b/;
  
  // Fight/MMA specific detection - this should catch "Who actually ended up winning this fight?"
  if (lowerQuery.match(/\b(who\s+(actually\s+)?(ended up\s+)?win|who\s+win|fight\s+result|fight\s+outcome|who\s+beat|who\s+defeated)\b/) ||
      (lowerQuery.match(sportsKeywords) && lowerQuery.match(sportsContext))) {
    const entities = extractSportsEntities(query);
    return { needsRealTime: true, category: 'sports', entities };
  }
  
  // Traditional sports stats (kept for backward compatibility)
  if (lowerQuery.match(sportsKeywords) && lowerQuery.match(currentContext)) {
    const entities = extractSportsEntities(query);
    return { needsRealTime: true, category: 'sports', entities };
  }
  
  // News indicators
  if (lowerQuery.match(/\b(news|breaking|recent|latest|today|yesterday|this week|current events|happening)\b/)) {
    const entities = extractNewsEntities(query);
    return { needsRealTime: true, category: 'news', entities };
  }
  
  // Stock indicators
  if (lowerQuery.match(/\b(stock|price|market|trading|nasdaq|dow|s&p|ipo|earnings)\b/)) {
    const entities = extractStockEntities(query);
    return { needsRealTime: true, category: 'stocks', entities };
  }
  
  // Weather indicators
  if (lowerQuery.match(/\b(weather|temperature|forecast|rain|snow|sunny|cloudy)\b/)) {
    const entities = extractWeatherEntities(query);
    return { needsRealTime: true, category: 'weather', entities };
  }
  
  // Current year/season indicators suggest real-time need
  if (lowerQuery.match(/\b(2024|2025|current|now|today|this year|this season|actually|ended up)\b/)) {
    return { needsRealTime: true, category: 'general', entities: [] };
  }
  
  return { needsRealTime: false, category: null, entities: [] };
}

/**
 * Get real-time sports statistics
 */
export async function getSportsStats(player: string, team?: string, stat?: string): Promise<ToolResult> {
  try {
    // Use web search for sports stats since most sports APIs require paid subscriptions
    const searchQuery = `${player} stats 2025 season ${team || ''} ${stat || ''}`.trim();
    
    const searchResult = await web_search(searchQuery + ' site:espn.com OR site:nba.com OR site:basketball-reference.com');
    
    return {
      tool: 'sports_stats',
      query: searchQuery,
      data: {
        searchResults: searchResult,
        player,
        team,
        stat,
        note: 'Real-time sports data retrieved via web search'
      },
      timestamp: new Date().toISOString(),
      success: true
    };
  } catch (error) {
    return {
      tool: 'sports_stats',
      query: `${player} stats`,
      data: null,
      timestamp: new Date().toISOString(),
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get current news
 */
export async function getCurrentNews(topic: string, limit: number = 5): Promise<ToolResult> {
  try {
    const searchQuery = `${topic} news today latest`;
    const searchResult = await web_search(searchQuery);
    
    return {
      tool: 'current_news',
      query: searchQuery,
      data: {
        searchResults: searchResult,
        topic,
        note: 'Current news retrieved via web search'
      },
      timestamp: new Date().toISOString(),
      success: true
    };
  } catch (error) {
    return {
      tool: 'current_news',
      query: topic,
      data: null,
      timestamp: new Date().toISOString(),
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get stock information
 */
export async function getStockInfo(symbol: string): Promise<ToolResult> {
  try {
    const searchQuery = `${symbol} stock price today current market`;
    const searchResult = await web_search(searchQuery + ' site:yahoo.com OR site:marketwatch.com OR site:bloomberg.com');
    
    return {
      tool: 'stock_info',
      query: searchQuery,
      data: {
        searchResults: searchResult,
        symbol,
        note: 'Stock information retrieved via web search'
      },
      timestamp: new Date().toISOString(),
      success: true
    };
  } catch (error) {
    return {
      tool: 'stock_info',
      query: symbol,
      data: null,
      timestamp: new Date().toISOString(),
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get weather information
 */
export async function getWeatherInfo(location: string): Promise<ToolResult> {
  try {
    const searchQuery = `weather ${location} today current forecast`;
    const searchResult = await web_search(searchQuery + ' site:weather.com OR site:accuweather.com');
    
    return {
      tool: 'weather_info',
      query: searchQuery,
      data: {
        searchResults: searchResult,
        location,
        note: 'Weather information retrieved via web search'
      },
      timestamp: new Date().toISOString(),
      success: true
    };
  } catch (error) {
    return {
      tool: 'weather_info',
      query: location,
      data: null,
      timestamp: new Date().toISOString(),
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * General web search for any real-time information
 */
export async function getGeneralRealTimeInfo(query: string): Promise<ToolResult> {
  try {
    const searchResult = await web_search(query + ' latest current 2025');
    
    return {
      tool: 'general_search',
      query,
      data: {
        searchResults: searchResult,
        note: 'General real-time information retrieved via web search'
      },
      timestamp: new Date().toISOString(),
      success: true
    };
  } catch (error) {
    return {
      tool: 'general_search',
      query,
      data: null,
      timestamp: new Date().toISOString(),
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Helper functions for entity extraction
function extractSportsEntities(query: string): string[] {
  const entities: string[] = [];
  const lowerQuery = query.toLowerCase();
  
  // Common NBA players
  const players = ['curry', 'lebron', 'durant', 'giannis', 'luka', 'tatum', 'jokic', 'embiid'];
  const teams = ['warriors', 'lakers', 'celtics', 'nuggets', 'heat', 'bucks', 'nets', 'suns'];
  
  // UFC/MMA fighters - including the ones from your conversation
  const fighters = ['conor', 'mcgregor', 'khabib', 'nurmagomedov', 'jon jones', 'adesanya', 'usman', 'diaz', 'poirier', 'gaethje', 'holloway', 'volkanovski'];
  const fightEvents = ['ufc 229', 'ufc 223', 'ufc 264', 'ufc', 'bellator', 'one championship'];
  
  // Check for players/fighters
  players.forEach(player => {
    if (lowerQuery.includes(player)) entities.push(player);
  });
  
  fighters.forEach(fighter => {
    if (lowerQuery.includes(fighter)) entities.push(fighter);
  });
  
  // Check for teams
  teams.forEach(team => {
    if (lowerQuery.includes(team)) entities.push(team);
  });
  
  // Check for fight events
  fightEvents.forEach(event => {
    if (lowerQuery.includes(event)) entities.push(event);
  });
  
  // Extract fight context words
  const fightContextWords = ['fight', 'bout', 'match', 'versus', 'vs', 'against'];
  fightContextWords.forEach(word => {
    if (lowerQuery.includes(word)) entities.push(word);
  });
  
  return entities;
}

function extractNewsEntities(query: string): string[] {
  const entities: string[] = [];
  const words = query.toLowerCase().split(/\s+/);
  
  // Look for proper nouns and important keywords
  const importantKeywords = ['ai', 'bitcoin', 'ukraine', 'china', 'election', 'covid', 'climate'];
  
  importantKeywords.forEach(keyword => {
    if (words.includes(keyword)) entities.push(keyword);
  });
  
  return entities;
}

function extractStockEntities(query: string): string[] {
  const entities: string[] = [];
  const stockSymbols = ['AAPL', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META'];
  
  stockSymbols.forEach(symbol => {
    if (query.toUpperCase().includes(symbol)) entities.push(symbol);
  });
  
  return entities;
}

function extractWeatherEntities(query: string): string[] {
  const entities: string[] = [];
  const cities = ['san francisco', 'new york', 'los angeles', 'chicago', 'miami', 'seattle'];
  
  cities.forEach(city => {
    if (query.toLowerCase().includes(city)) entities.push(city);
  });
  
  return entities;
}

/**
 * AI-powered detection for real-time data needs - scalable across all industries
 */
export async function intelligentRealTimeDetection(query: string, episodeContext?: any): Promise<{
  needsRealTime: boolean;
  category: 'business' | 'sports' | 'tech' | 'finance' | 'news' | 'general' | null;
  entities: string[];
  searchStrategy: 'recent_events' | 'current_data' | 'live_updates' | 'company_info' | 'market_data';
  confidence: number;
}> {
  try {
    const analysisPrompt = `Analyze this question to determine if it needs real-time/current information:

QUESTION: "${query}"
EPISODE CONTEXT: ${episodeContext?.title || 'Unknown podcast episode'}

Determine:
1. Does this question require current/recent information that might not be in a static podcast transcript?
2. What industry/category does this relate to?
3. What entities (companies, people, events) are mentioned?
4. What search strategy would be best?

Examples that NEED real-time data:
- "What's the latest funding round for [company]?"
- "Who won the game last night?"
- "What's Tesla's stock price today?"
- "Did [company] complete their IPO?"
- "What's happening with the [recent event]?"

Examples that DON'T need real-time data:
- "What did the host think about this topic?"
- "Can you explain what was discussed?"
- "What was the guest's background?"

Respond with JSON:
{
  "needsRealTime": boolean,
  "category": "business|sports|tech|finance|news|general|null",
  "entities": ["entity1", "entity2"],
  "searchStrategy": "recent_events|current_data|live_updates|company_info|market_data",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: analysisPrompt }],
      max_tokens: 300,
      temperature: 0.1, // Low temperature for consistent analysis
    });

    const analysisText = response.choices[0]?.message?.content;
    if (analysisText) {
      try {
        const analysis = JSON.parse(analysisText);
        console.log(`🤖 AI Real-time Analysis:`, analysis);
        return {
          needsRealTime: analysis.needsRealTime || false,
          category: analysis.category || null,
          entities: analysis.entities || [],
          searchStrategy: analysis.searchStrategy || 'general',
          confidence: analysis.confidence || 0.5,
        };
      } catch (parseError) {
        console.log('Failed to parse AI analysis, falling back to pattern matching');
      }
    }
  } catch (error) {
    console.log('AI analysis failed, falling back to pattern matching:', error);
  }

  // Fallback to pattern matching
  const fallbackResult = needsRealTimeData(query);
  return {
    needsRealTime: fallbackResult.needsRealTime,
    category: fallbackResult.category as 'business' | 'sports' | 'tech' | 'finance' | 'news' | 'general' | null,
    entities: fallbackResult.entities,
    searchStrategy: 'recent_events' as const,
    confidence: 0.7,
  };
}

/**
 * Industry-specific real-time search with multiple data sources
 */
export async function getIntelligentRealTimeData(
  query: string, 
  category: string,
  entities: string[],
  searchStrategy: string
): Promise<ToolResult> {
  try {
    let searchResult;
    let tool = 'intelligent_search';
    
    switch (category) {
      case 'business':
        searchResult = await getBusinessIntelligence(query, entities, searchStrategy);
        tool = 'business_intelligence';
        break;
        
      case 'finance':
        searchResult = await getFinanceData(query, entities);
        tool = 'finance_data';
        break;
        
      case 'tech':
        searchResult = await getTechIntelligence(query, entities);
        tool = 'tech_intelligence';
        break;
        
      case 'sports':
        // Use existing sports function but with entities
        if (entities.length > 0) {
          searchResult = await getSportsStats(entities[0]);
        } else {
          searchResult = await getGeneralRealTimeInfo(query);
        }
        return searchResult;
        
      default:
        searchResult = await getGeneralRealTimeInfo(query);
        return searchResult;
    }
    
    return {
      tool,
      query,
      data: searchResult,
      timestamp: new Date().toISOString(),
      success: true
    };
    
  } catch (error) {
    return {
      tool: 'intelligent_search',
      query,
      data: null,
      timestamp: new Date().toISOString(),
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Business/VC Intelligence - for fundraising, acquisitions, company news
 */
async function getBusinessIntelligence(query: string, entities: string[], strategy: string): Promise<any> {
  try {
    // For VC/business queries, we want recent company data
    const businessSearchTerms = entities.length > 0 
      ? `${entities.join(' ')} ${query} funding round investment acquisition latest news 2024 2025`
      : `${query} startup funding venture capital latest news`;
    
    // Use multiple search strategies
    const searches = await Promise.all([
      // Web search for general business news
      web_search(businessSearchTerms + ' site:techcrunch.com OR site:bloomberg.com OR site:reuters.com'),
      
      // Search for specific funding databases
      web_search(businessSearchTerms + ' site:crunchbase.com OR site:pitchbook.com'),
      
      // Search for company press releases
      web_search(businessSearchTerms + ' "press release" "announces" "raises" "funding"')
    ]);

    return {
      general_business_news: searches[0],
      funding_databases: searches[1], 
      press_releases: searches[2],
      entities,
      strategy,
      note: 'Business intelligence from multiple sources'
    };
    
  } catch (error) {
    // Fallback to simple search
    return await web_search(query + ' business news latest');
  }
}

/**
 * Finance Data - for stock prices, market data, earnings
 */
async function getFinanceData(query: string, entities: string[]): Promise<any> {
  try {
    const financeSearchTerms = entities.length > 0
      ? `${entities.join(' ')} ${query} stock price market latest earnings`
      : `${query} stock market financial data`;
    
    const searches = await Promise.all([
      web_search(financeSearchTerms + ' site:yahoo.com OR site:marketwatch.com'),
      web_search(financeSearchTerms + ' site:bloomberg.com OR site:cnbc.com'),
      web_search(financeSearchTerms + ' "quarterly results" "earnings report" latest')
    ]);

    return {
      market_data: searches[0],
      financial_news: searches[1],
      earnings_data: searches[2],
      entities,
      note: 'Financial data from multiple sources'
    };
    
  } catch (error) {
    return await web_search(query + ' financial market data');
  }
}

/**
 * Tech Intelligence - for product launches, acquisitions, tech news
 */
async function getTechIntelligence(query: string, entities: string[]): Promise<any> {
  try {
    const techSearchTerms = entities.length > 0
      ? `${entities.join(' ')} ${query} technology product launch acquisition latest`
      : `${query} technology news latest developments`;
    
    const searches = await Promise.all([
      web_search(techSearchTerms + ' site:techcrunch.com OR site:theverge.com'),
      web_search(techSearchTerms + ' site:wired.com OR site:arstechnica.com'),
      web_search(techSearchTerms + ' "product launch" "announcement" "beta" "release"')
    ]);

    return {
      tech_news: searches[0],
      industry_analysis: searches[1], 
      product_updates: searches[2],
      entities,
      note: 'Technology intelligence from multiple sources'
    };
    
  } catch (error) {
    return await web_search(query + ' technology news latest');
  }
}

/**
 * Grok integration for real-time Twitter/X data and current events
 * Perfect for breaking news, market reactions, and viral topics
 */
export async function getGrokIntelligence(query: string, entities: string[]): Promise<ToolResult> {
  try {
    // Note: This would require actual Grok API integration
    // For now, we'll simulate with enhanced web search focused on X/Twitter and current events
    
    const grokSearchTerms = entities.length > 0
      ? `${entities.join(' ')} ${query} latest trending twitter x social media reaction`
      : `${query} latest trending current events twitter reaction`;
    
    const searches = await Promise.all([
      // Search for Twitter/X discussions
      web_search(grokSearchTerms + ' site:twitter.com OR site:x.com'),
      
      // Search for social media reactions and trending topics
      web_search(grokSearchTerms + ' trending viral social media reaction discussion'),
      
      // Search for real-time news with social context
      web_search(grokSearchTerms + ' breaking news latest twitter discussion reaction')
    ]);

    return {
      tool: 'grok_intelligence',
      query,
      data: {
        twitter_discussions: searches[0],
        social_media_trends: searches[1],
        real_time_news: searches[2],
        entities,
        note: 'Real-time social intelligence (Grok-style analysis)',
        timestamp: new Date().toISOString(),
        source: 'Enhanced web search with social media focus'
      },
      timestamp: new Date().toISOString(),
      success: true
    };
    
  } catch (error) {
    return {
      tool: 'grok_intelligence',
      query,
      data: null,
      timestamp: new Date().toISOString(),
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Enhanced real-time data fetching with multiple strategies
 */
export async function getEnhancedRealTimeData(
  analysis: Awaited<ReturnType<typeof intelligentRealTimeDetection>>
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  
  try {
    // Strategy 1: Industry-specific intelligence
    const industryResult = await getIntelligentRealTimeData(
      analysis.entities.join(' '),
      analysis.category || 'general',
      analysis.entities,
      analysis.searchStrategy
    );
    results.push(industryResult);
    
    // Strategy 2: Grok-style social intelligence (if high confidence)
    if (analysis.confidence > 0.7) {
      const grokResult = await getGrokIntelligence(
        analysis.entities.join(' '),
        analysis.entities
      );
      results.push(grokResult);
    }
    
    // Strategy 3: General search as backup
    if (results.length === 0 || !results.some(r => r.success)) {
      const generalResult = await getGeneralRealTimeInfo(analysis.entities.join(' '));
      results.push(generalResult);
    }
    
    return results.filter(r => r.success);
    
  } catch (error) {
    console.error('Enhanced real-time data fetch failed:', error);
    return [];
  }
}

export const realTimeTools = {
  needsRealTimeData,
  intelligentRealTimeDetection,
  getSportsStats,
  getCurrentNews,
  getStockInfo,
  getWeatherInfo,
  getGeneralRealTimeInfo,
  getIntelligentRealTimeData,
  getGrokIntelligence,
  getEnhancedRealTimeData
}; 