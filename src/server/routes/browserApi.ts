import { Router } from 'express';
import { browserService } from '../browser/BrowserService';
import { DOMProcessor } from '../browser/DOMProcessor';
import { ActionEngine } from '../browser/ActionEngine';

const router = Router();

// POST /api/browser/init
router.post('/init', async (req, res) => {
  try {
    const { loadStateId, width, height } = req.body || {};
    const sessionWidth = width || 1280;
    const sessionHeight = height || 800;
    
    // Get client IP address
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (Array.isArray(clientIp)) {
      clientIp = clientIp[0];
    } else if (typeof clientIp === 'string') {
      clientIp = clientIp.split(',')[0].trim();
    }
    if (clientIp === '::1' || clientIp === '127.0.0.1') {
      clientIp = undefined; // Avoid sending local loopback as spoofed IP
    }
    
    const sessionId = await browserService.launch(loadStateId, sessionWidth, sessionHeight, clientIp as string | undefined);
    res.json({ success: true, sessionId });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/browser/state
router.post('/state', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

    const page = browserService.getSessionPage(sessionId);
    const state = await DOMProcessor.process(page);
    
    res.json({ success: true, state });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/browser/action
router.post('/action', async (req, res) => {
  try {
    const { sessionId, action, params } = req.body;
    if (!sessionId || !action) return res.status(400).json({ error: 'sessionId and action are required' });

    const page = browserService.getSessionPage(sessionId);

    switch (action) {
      case 'NAVIGATE':
        if (!params?.url) throw new Error('NAVIGATE requires url parameter');
        await ActionEngine.navigateTo(page, params.url);
        break;
      case 'CLICK':
        if (!params?.agentId) throw new Error('CLICK requires agentId parameter');
        await ActionEngine.clickElement(page, params.agentId);
        break;
      case 'TYPE':
        if (!params?.agentId || params?.text === undefined) throw new Error('TYPE requires agentId and text parameters');
        await ActionEngine.typeText(page, params.agentId, params.text);
        break;
      case 'SCROLL':
        const direction = params?.direction || 'down';
        const amount = params?.amount || 500;
        await ActionEngine.scroll(page, direction, amount);
        break;
      case 'WAIT':
        const ms = params?.ms || 2000;
        await ActionEngine.wait(ms);
        break;
      case 'SET_COOKIES':
        if (!params?.cookies || !Array.isArray(params.cookies)) throw new Error('SET_COOKIES requires cookies array parameter');
        
        // Sanitize cookies for Playwright (EditThisCookie format compatibility)
        const sanitizedCookies = params.cookies
          .map((c: any) => {
          let name = String(c.name || '').trim();
          let value = String(c.value || '').trim();
          const sc: any = {
            name: name,
            value: value,
          };
          
          const isHost = name.startsWith('__Host-');
          const isSecure = name.startsWith('__Secure-');

          if (isHost) {
            let u = c.url;
            if (!u && c.domain) {
              const d = String(c.domain).trim().replace(/^\./, '');
              u = `https://${d}`;
            }
            sc.url = u ? String(u).trim() : 'https://google.com';
            sc.secure = true;
          } else {
            if (c.domain) {
                sc.domain = String(c.domain).trim();
                sc.path = c.path ? String(c.path).trim() : '/';
            }
            else if (c.url) {
                sc.url = String(c.url).trim();
            }
            else {
                sc.domain = '.google.com';
                sc.path = c.path ? String(c.path).trim() : '/';
            }
          }

          if (c.httpOnly !== undefined && c.httpOnly !== null) sc.httpOnly = Boolean(c.httpOnly);
          
          if (isHost || isSecure || (c.secure !== undefined && c.secure !== null && Boolean(c.secure))) {
            sc.secure = true;
          }

          if (c.sameSite !== undefined && c.sameSite !== null) {
             const site = String(c.sameSite).toLowerCase().trim();
             if (site === 'no_restriction' || site === 'none') {
                 sc.sameSite = 'None';
                 sc.secure = true;
             } else if (site === 'lax') {
                 sc.sameSite = 'Lax';
             } else if (site === 'strict') {
                 sc.sameSite = 'Strict';
             }
          }
          
          let exp = c.expires !== undefined ? c.expires : c.expirationDate;
          if (exp !== undefined && exp !== null) {
              const expNum = Number(exp);
              if (!isNaN(expNum) && expNum > 0 && expNum < 253402300799) {
                  sc.expires = expNum;
              }
          }

          return sc;
        })
        .filter((c: any) => c.name !== '');

        const context = page.context();
        await context.addCookies(sanitizedCookies);
        // Refresh page to apply cookies
        await page.reload();
        break;
      case 'GOOGLE_LOGIN':
        // If they provided it in params, use it, otherwise use env vars
        const email = params?.email || process.env.GMAIL_EMAIL;
        const password = params?.password || process.env.GMAIL_PASSWORD;
        await ActionEngine.autoGoogleLogin(page, email, password);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    // Always return new state after action
    const state = await DOMProcessor.process(page);
    res.json({ success: true, state });

  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
