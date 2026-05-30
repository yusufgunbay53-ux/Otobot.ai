import { Browser, BrowserContext, Page, CDPSession } from 'playwright';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocket } from 'ws';
import { ActionEngine } from './ActionEngine';

chromium.use(stealth());

interface BrowserSession {
  context: BrowserContext;
  page: Page;
  cdpSession?: CDPSession;
  ws?: WebSocket;
  lastUsed: number;
  saveInterval?: NodeJS.Timeout;
}

export class BrowserService {
  private browser: Browser | null = null;
  private sessions: Map<string, BrowserSession> = new Map();
  private isInitializing: boolean = false;
  private stateDir: string;

  constructor() {
    this.stateDir = path.join(process.cwd(), '.browser_sessions');
    if (!fs.existsSync(this.stateDir)) fs.mkdirSync(this.stateDir, { recursive: true });
    // Start idle cleanup interval to prevent memory leaks
    setInterval(() => this.cleanupIdleSessions(), 60000); // Check every minute
  }

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;
    if (this.isInitializing) {
      // wait until initialized
      while (this.isInitializing) {
        await new Promise(r => setTimeout(r, 100));
      }
      if (this.browser) return this.browser;
    }

    this.isInitializing = true;
    try {
      console.log("[BrowserService] Launching Chromium...");
      const start = Date.now();
      
      const launchOptions: any = {
        headless: true, // Server environment needs headless
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-setuid-sandbox',
          '--no-sandbox',
          '--disable-site-isolation-trials',
          '--disable-blink-features=AutomationControlled', // Extra stealth
          '--disable-features=IsolateOrigins,site-per-process',
          '--flag-switches-begin',
          '--flag-switches-end',
          '--window-position=0,0'
        ]
      };

      // Add proxy if configured in environment
      if (process.env.PROXY_SERVER) {
        launchOptions.proxy = {
          server: process.env.PROXY_SERVER,
          username: process.env.PROXY_USERNAME || undefined,
          password: process.env.PROXY_PASSWORD || undefined,
        };
        console.log("[BrowserService] Using proxy server:", process.env.PROXY_SERVER);
      }

      try {
        this.browser = await chromium.launch(launchOptions);
      } catch (err: any) {
        if (err.message && err.message.includes("Executable doesn't exist")) {
           console.log("Playwright executable missing, installing...");
           const child_process = await import('child_process');
           child_process.execSync('npx playwright install chromium', { stdio: 'inherit' });
           this.browser = await chromium.launch(launchOptions);
        } else {
          throw err;
        }
      }
      console.log(`[BrowserService] Chromium launched successfully in ${Date.now() - start}ms.`);
    } catch (err) {
      console.error("[BrowserService] Failed to launch Chromium:", err);
      throw err;
    } finally {
      this.isInitializing = false;
    }
    return this.browser!;
  }

  async init(): Promise<void> {
    console.log("[BrowserService] init called.");
    const startTime = Date.now();
    await this.ensureBrowser();
    console.log(`[BrowserService] init completed in ${Date.now() - startTime}ms.`);
  }

  async launch(loadStateId?: string, width: number = 1280, height: number = 800, clientIp?: string): Promise<string> {
    console.log(`[BrowserService] launch called. (loadStateId: ${loadStateId}, w: ${width}, h: ${height}, IP: ${clientIp || 'Server'})`);
    const launchStart = Date.now();
    const browser = await this.ensureBrowser();
    console.log(`[BrowserService] browser ensured. Took ${Date.now() - launchStart}ms`);
    
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
    ];
    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

    const extraHeaders: Record<string, string> = {
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    };
    if (clientIp) {
      extraHeaders['X-Forwarded-For'] = clientIp;
      extraHeaders['X-Real-IP'] = clientIp;
    }

    // Create isolated context for this session
    const contextOptions: any = {
      viewport: { width, height },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      userAgent: randomUserAgent,
      locale: 'tr-TR', // Localized to seem natural
      timezoneId: 'Europe/Istanbul',
      permissions: ['geolocation'],
      colorScheme: 'dark',
      extraHTTPHeaders: extraHeaders
    };
    
    // Load session state if provided or fallback to default single user profile
    const profileId = loadStateId || 'default-profile';
    const stateFile = path.join(this.stateDir, `${profileId}.json`);

    let context;
    const contextStart = Date.now();

    // -- NEW: Support for real, persistent Chrome profiles (like Windows user's Chrome)
    const userDataDir = process.env.CHROME_USER_DATA_DIR;
    const executablePath = process.env.CHROME_EXECUTABLE_PATH;

    if (userDataDir) {
      console.log(`[BrowserService] Launching Persistent Context at: ${userDataDir}`);
      const persistentOptions: any = {
        viewport: { width, height },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        userAgent: randomUserAgent,
        locale: 'tr-TR',
        timezoneId: 'Europe/Istanbul',
        permissions: ['geolocation'],
        colorScheme: 'dark',
        extraHTTPHeaders: extraHeaders,
        headless: process.env.CHROME_HEADLESS === 'false' ? false : true,
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-setuid-sandbox',
          '--no-sandbox',
          '--disable-site-isolation-trials',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--flag-switches-begin',
          '--flag-switches-end',
          '--window-position=0,0'
        ]
      };

      if (process.env.PROXY_SERVER) {
        persistentOptions.proxy = {
          server: process.env.PROXY_SERVER,
          username: process.env.PROXY_USERNAME || undefined,
          password: process.env.PROXY_PASSWORD || undefined,
        };
        console.log("[BrowserService] Using proxy server for persistent context:", process.env.PROXY_SERVER);
      }
      
      if (executablePath) {
        persistentOptions.executablePath = executablePath;
      }
      
      context = await chromium.launchPersistentContext(userDataDir, persistentOptions);
      
    } else {
      // -- Default: In-memory/ephemeral browser context
      if (fs.existsSync(stateFile)) {
        try {
          contextOptions.storageState = stateFile;
          console.log(`[BrowserService] Loading state from ${stateFile}`);
        } catch (err) {
          console.warn(`[BrowserService] Failed to load prior state from ${stateFile}`, err);
        }
      }
      context = await browser.newContext(contextOptions);
    }

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      // Mock for Chrome
      (window as any).chrome = {
        runtime: {},
        app: {},
        csi: function() {},
        loadTimes: function() {}
      };
      
      // Mock navigator properties
      Object.defineProperty(navigator, 'languages', {
        get: () => ['tr-TR', 'tr', 'en-US', 'en']
      });
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const arr: any = [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
            { name: 'Native Client', filename: 'internal-nacl-plugin' }
          ];
          arr.item = (i: number) => arr[i];
          arr.namedItem = (n: string) => arr.find((p: any) => p.name === n);
          return arr;
        }
      });

      // Prevent permissions API from revealing headless
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission } as PermissionStatus) :
          originalQuery(parameters)
      );
    });

    // Periodically save state to maintain login sessions
    const saveInterval = setInterval(async () => {
      try {
        await context.storageState({ path: stateFile });
      } catch(e) {
        // Ignore errors if context is closed
      }
    }, 5000);

    // Provide a binding to report input text boxes
    await context.exposeFunction('otobotReportInputs', (rects: any[]) => {
      // Find the session that owns this context
      for (const [sid, sess] of this.sessions.entries()) {
        if (sess.context === context && sess.ws && sess.ws.readyState === WebSocket.OPEN) {
          sess.ws.send(JSON.stringify({ type: 'inputRects', rects }));
          break;
        }
      }
    });

    // Add input reporter and Virtual Cursor
    await context.addInitScript(`
      // Virtual Cursor Style
      const cursor = document.createElement('div');
      cursor.id = 'playwright-cursor';
      cursor.style = 'display: none; position: fixed; top: 0; left: 0; width: 20px; height: 20px; z-index: 2147483647; pointer-events: none; background: url("data:image/svg+xml,%3Csvg width=\\'24\\' height=\\'24\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cpath d=\\'M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.45 0 .67-.54.35-.85L6.35 2.86a.5.5 0 0 0-.85.35Z\\' fill=\\'black\\' stroke=\\'white\\' stroke-width=\\'1.5\\'/%3E%3C/svg%3E") no-repeat; transition: top 0.05s linear, left 0.05s linear;';
      
      // OTOBOT Input Tracking
      function sendRects() {
          const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]');
          const rects = [];
          for (let i = 0; i < inputs.length; i++) {
              const el = inputs[i];
              const r = el.getBoundingClientRect();
              if (r.width > 0 && r.height > 0) {
                  let val = '';
                  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                      val = el.value || '';
                  } else {
                      val = el.innerText || '';
                  }
                  rects.push({ x: r.x, y: r.y, w: r.width, h: r.height, val });
              }
          }
          if (window.otobotReportInputs) {
              window.otobotReportInputs(rects).catch(()=>{});
          }
      }
      
      window.addEventListener('resize', sendRects);
      window.addEventListener('scroll', sendRects, true);
      window.addEventListener('input', sendRects, true);
      window.addEventListener('click', () => setTimeout(sendRects, 150), true);
      document.addEventListener('DOMContentLoaded', () => {
         document.body.appendChild(cursor);
         sendRects();
      });
      window.addEventListener('mousemove', (e) => {
        if (cursor) {
          cursor.style.display = 'block';
          cursor.style.left = e.clientX + 'px';
          cursor.style.top = e.clientY + 'px';
        }
      }, true);
      setInterval(sendRects, 1000);
    `);

    const page = await context.newPage();
    console.log(`[BrowserService] context and page created. Took ${Date.now() - contextStart}ms`);
    
    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      context,
      page,
      lastUsed: Date.now(),
      saveInterval
    });

    return sessionId;
  }
  
  async saveSessionState(sessionId: string, customId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const statePath = path.join(this.stateDir, `${customId}.json`);
    await session.context.storageState({ path: statePath });
  }

  getSessionPage(sessionId: string): Page {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found or expired.`);
    }
    session.lastUsed = Date.now();
    return session.page;
  }

  async attachWebSocket(sessionId: string, ws: WebSocket) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      ws.close();
      return;
    }
    session.ws = ws;

    try {
      if (!session.cdpSession) {
        session.cdpSession = await session.context.newCDPSession(session.page);
        
        session.cdpSession.on('Page.screencastFrame', async (e: any) => {
          session.cdpSession?.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
          if (session.ws && session.ws.readyState === WebSocket.OPEN) {
            session.ws.send(JSON.stringify({
              type: 'screencastFrame',
              data: e.data,
              metadata: e.metadata
            }));
          }
        });
      }

      await session.cdpSession.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 60,
        everyNthFrame: 2
      });

      session.page.on('framenavigated', (frame) => {
        if (frame === session.page.mainFrame() && session.ws && session.ws.readyState === WebSocket.OPEN) {
           session.ws.send(JSON.stringify({
             type: 'urlChanged',
             url: frame.url()
           }));
        }
      });

      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'clickAt') {
            await ActionEngine.clickAt(session.page, msg.x, msg.y);
          } else if (msg.type === 'click') {
            await session.page.mouse.click(msg.x, msg.y);
          } else if (msg.type === 'focusAt') {
            try {
              await session.page.evaluate(({ cx, cy }) => {
                const el = document.elementFromPoint(cx, cy);
                if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.hasAttribute('contenteditable'))) {
                  if (typeof (el as any).focus === 'function') {
                    (el as any).focus();
                  }
                }
              }, { cx: msg.x, cy: msg.y });
            } catch (err) {}
          } else if (msg.type === 'mousedown') {
            await session.page.mouse.move(msg.x, msg.y);
            await session.page.mouse.down({ button: msg.button || 'left' });
          } else if (msg.type === 'mouseup') {
            await session.page.mouse.move(msg.x, msg.y);
            await session.page.mouse.up({ button: msg.button || 'left' });
          } else if (msg.type === 'mousemove') {
            await session.page.mouse.move(msg.x, msg.y);
          } else if (msg.type === 'wheel') {
            await session.page.mouse.wheel(msg.deltaX, msg.deltaY);
          } else if (msg.type === 'keydown') {
            // Map web keys to playwright keys
            const keyMap: any = {
                'Backspace': 'Backspace',
                'Enter': 'Enter',
                'Tab': 'Tab',
                'Escape': 'Escape',
                'Delete': 'Delete',
                'ArrowUp': 'ArrowUp',
                'ArrowDown': 'ArrowDown',
                'ArrowLeft': 'ArrowLeft',
                'ArrowRight': 'ArrowRight',
                'Control': 'Control',
                'Shift': 'Shift',
                'Alt': 'Alt',
                'Meta': 'Meta'
            };
            if (keyMap[msg.key]) {
                await session.page.keyboard.press(keyMap[msg.key]);
            } else if (msg.key.length === 1) {
                await session.page.keyboard.press(msg.key);
            }
          } else if (msg.type === 'insertText') {
            await session.page.keyboard.insertText(msg.text);
            if (msg.pressEnter) {
                await session.page.keyboard.press('Enter');
            }
          }
        } catch (err) {
          console.error("WS message error:", err);
        }
      });

      ws.on('close', async () => {
        session.ws = undefined;
      });

    } catch (err) {
      console.error('Error attaching CDP session:', err);
      ws.close();
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        if (session.saveInterval) clearInterval(session.saveInterval);
        if (session.ws) session.ws.close();
        await session.page.close();
        await session.context.close();
      } catch(e) {
        console.error(`Error closing session ${sessionId}`, e);
      }
      this.sessions.delete(sessionId);
    }
  }

  async cleanupIdleSessions(): Promise<void> {
    const now = Date.now();
    const IDLE_TIMEOUT = 10 * 60 * 1000; // 10 minutes

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastUsed > IDLE_TIMEOUT) {
        console.log(`Cleaning up idle session: ${sessionId}`);
        await this.closeSession(sessionId);
      }
    }
  }
}

export const browserService = new BrowserService();
