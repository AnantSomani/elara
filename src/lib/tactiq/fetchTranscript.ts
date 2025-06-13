import { chromium, Browser, Page } from 'playwright';

export interface TactiqTranscriptResult {
  success: boolean;
  transcript?: string;
  error?: string;
  processingTime: number;
}

export class TactiqTranscriptFetcher {
  private browser: Browser | null = null;
  
  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: false, // DEBUG: Show browser to see what's happening
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-gpu',
        '--no-first-run',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ]
    });
  }

  async fetchTranscript(youtubeUrl: string): Promise<TactiqTranscriptResult> {
    const startTime = Date.now();
    
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();
    
    try {
      // Set user agent to avoid detection
      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      });
      
      // Navigate to Tactiq tool
      console.log('🔄 Navigating to Tactiq...');
      await page.goto('https://tactiq.io/tools/youtube-transcript', {
        waitUntil: 'domcontentloaded', // Less strict than networkidle
        timeout: 60000 // Longer timeout
      });

      // Wait for page to fully load
      await page.waitForTimeout(2000);

      // Find the YouTube URL input field - try multiple selectors
      console.log('🔍 Looking for URL input field...');
      const urlInputSelectors = [
        '#yt-2', // Primary: Exact ID from Tactiq site
        'input[name="yt"]', // Secondary: Name attribute
        'input[data-name="yt"]', // Tertiary: Data attribute
        '.input.full-width.w-input', // Class combination
        'input[placeholder*="Enter YouTube URL"]', // Placeholder text
        'input[type="text"][name="yt"]', // Type + name combo
        'input[maxlength="256"][name="yt"]', // Additional specificity
        // Fallback selectors in case they change
        'input[placeholder*="YouTube"]',
        'input[placeholder*="youtube"]',
        'input[type="url"]'
      ];

      let urlInput = null;
      for (const selector of urlInputSelectors) {
        try {
          console.log(`🔍 Trying selector: ${selector}`);
          urlInput = await page.waitForSelector(selector, { timeout: 5000 });
          if (urlInput) {
            console.log(`✅ Found URL input with selector: ${selector}`);
            break;
          }
        } catch (e) {
          console.log(`❌ Failed selector: ${selector} - ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
      }

      // DEBUG: If no selectors worked, let's see what inputs ARE available
      if (!urlInput) {
        console.log('🔍 DEBUG: Looking for any input fields on the page...');
        const allInputs = await page.$$('input');
        console.log(`Found ${allInputs.length} input fields total`);
        
        for (let i = 0; i < allInputs.length; i++) {
          const input = allInputs[i];
          const tagName = await input.evaluate(el => el.tagName);
          const type = await input.evaluate(el => el.type);
          const id = await input.evaluate(el => el.id);
          const className = await input.evaluate(el => el.className);
          const name = await input.evaluate(el => el.name);
          const placeholder = await input.evaluate(el => el.placeholder);
          
          console.log(`Input ${i}: <${tagName.toLowerCase()} type="${type}" id="${id}" class="${className}" name="${name}" placeholder="${placeholder}">`);
        }
      }

      if (!urlInput) {
        throw new Error('Could not find YouTube URL input field');
      }
      
      // Clear any existing content and fill with YouTube URL
      await urlInput.click();
      await page.keyboard.press('Meta+a'); // Select all on Mac, Ctrl+a on other platforms
      await urlInput.fill(youtubeUrl);
      console.log(`📝 Filled URL: ${youtubeUrl}`);
      
      // Find and click the "Get Transcript" button - try multiple selectors
      console.log('🔍 Looking for submit button...');
      const buttonSelectors = [
        'button:has-text("Get Transcript")',
        'button:has-text("Generate")',
        'button:has-text("Transcribe")',
        'button:has-text("Extract")',
        'input[type="submit"]',
        'button[type="submit"]',
        '.submit-btn',
        '.generate-btn',
        '#submit-button',
        '[data-testid="submit"]'
      ];
      
      let submitButton = null;
      for (const selector of buttonSelectors) {
        try {
          submitButton = await page.waitForSelector(selector, { timeout: 5000 });
          if (submitButton) {
            console.log(`✅ Found submit button with selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      if (!submitButton) {
        throw new Error('Could not find submit button');
      }
      
      await submitButton.click();
      console.log('🚀 Clicked submit button');
      
      // Wait for transcript generation to complete - look for Copy/Download buttons
      console.log('⏳ Waiting for transcript generation to complete...');
      const copyButtonSelectors = [
        'button:has-text("Copy")',
        'button:has-text("copy")',
        '[aria-label*="Copy"]',
        'button[class*="copy"]',
        '.copy-button',
        '#copy-button'
      ];
      
      let copyButton = null;
      for (const selector of copyButtonSelectors) {
        try {
          console.log(`🔍 Looking for copy button: ${selector}`);
          copyButton = await page.waitForSelector(selector, { timeout: 45000 });
          if (copyButton) {
            console.log(`✅ Found copy button with selector: ${selector}`);
            break;
          }
        } catch (e) {
          console.log(`❌ Copy button not found: ${selector}`);
        }
      }

      if (!copyButton) {
        throw new Error('Could not find Copy button after transcript generation');
      }

      // Click the copy button to get transcript
      console.log('📋 Clicking copy button to get transcript...');
      await copyButton.click();
      
      // Wait a moment for copy to complete
      await page.waitForTimeout(2000);
      
      // Try to get transcript from clipboard or look for it in the page
      console.log('📄 Extracting transcript content...');
      
      // First try to find the actual transcript content on the page
      const transcriptSelectors = [
        '.transcript-content',
        '[class*="transcript"]',
        '.result-text',
        'pre',
        '.generated-content'
      ];
      
      let transcriptContainer = null;
      for (const selector of transcriptSelectors) {
        try {
          transcriptContainer = await page.waitForSelector(selector, { timeout: 45000 });
          if (transcriptContainer) {
            console.log(`✅ Found transcript container with selector: ${selector}`);
            
            // Check if the content is actually loaded (not empty or loading)
            const content = await transcriptContainer.textContent();
            if (content && content.trim().length > 50 && !content.includes('Loading') && !content.includes('Generating')) {
              break;
            } else {
              transcriptContainer = null;
              // Wait a bit more and try again
              await page.waitForTimeout(3000);
            }
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      if (!transcriptContainer) {
        // Try to get any text content that might be the transcript
        const pageContent = await page.textContent('body');
        if (pageContent && pageContent.length > 200) {
          console.log('⚠️ Using page content as fallback');
          return {
            success: true,
            transcript: pageContent.trim(),
            processingTime: Date.now() - startTime
          };
        }
        throw new Error('Could not find transcript content or transcript is too short');
      }
      
      // Extract transcript text
      const transcript = await transcriptContainer.textContent();
      
      if (!transcript || transcript.trim().length < 50) {
        throw new Error('Transcript too short or empty');
      }

      // Clean up the transcript text
      const cleanedTranscript = transcript
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^\s*transcript\s*/i, '')
        .replace(/^\s*generated\s*/i, '');

      console.log(`✅ Successfully extracted transcript (${cleanedTranscript.length} characters)`);

      return {
        success: true,
        transcript: cleanedTranscript,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('❌ Tactiq fetch error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      };
    } finally {
      await page.close();
    }
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// Utility function to extract video ID from YouTube URL
export function extractVideoId(url: string): string | null {
  const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// Utility function to validate YouTube URL
export function isValidYouTubeUrl(url: string): boolean {
  return extractVideoId(url) !== null;
} 