import { Page } from 'playwright';

export class ActionEngine {
  
  static async navigateTo(page: Page, url: string): Promise<void> {
    let finalUrl = url.trim();
    if (!finalUrl.includes('.') && !finalUrl.includes('localhost') && !finalUrl.startsWith('http')) {
      finalUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(finalUrl);
    } else if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    
    await page.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.wait(1000); // Small wait for dynamic content
  }

  static async clickAt(page: Page, x: number, y: number): Promise<void> {
    await page.mouse.click(x, y);
    try {
      // Evaluate within the page to find an element at these exact coordinates and focus it
      await page.evaluate(({ cx, cy }) => {
        const el = document.elementFromPoint(cx, cy);
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.hasAttribute('contenteditable'))) {
          if (typeof (el as any).focus === 'function') {
            (el as any).focus();
          }
        }
      }, { cx: x, cy: y });
    } catch (err) {
      console.warn("Failed to auto-focus after clickAt", err);
    }
  }

  static async clickElement(page: Page, agentId: string): Promise<void> {
    const normalizedId = String(agentId).startsWith('el_') ? String(agentId) : `el_${agentId}`;
    const selector = `[data-agent-id="${normalizedId}"]`;
    const locator = page.locator(selector).first();
    
    // Check if it exists
    if (await locator.count() === 0) {
       console.log("Element not found: " + selector);
       return;
    }

    try {
      await locator.scrollIntoViewIfNeeded({ timeout: 2000 });
    } catch(e) {}
    
    // Move the virtual cursor so it doesn't stay at 0,0
    try {
      const box = await locator.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      }
    } catch(e) {}
    
    // Execute click and try to capture any triggered navigation
    try {
        await Promise.all([
          page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {}), // catch timeouts
          locator.evaluate((el: any) => el.click())
        ]);
    } catch (e) {
      console.error("Evaluation click failed, falling back to standard click:", e);
      try {
         await Promise.all([
           page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {}),
           locator.click({ force: true, timeout: 3000 })
         ]);
      } catch(e2) {
         console.error("Standard click failed too:", e2);
      }
    }
    
    // Wait for any additional fetch requests or DOM changes
    await this.wait(1500);
    // Wait for network idle if possible
    await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
  }

  static async typeText(page: Page, agentId: string, text: string): Promise<void> {
    const normalizedId = String(agentId).startsWith('el_') ? String(agentId) : `el_${agentId}`;
    const selector = `[data-agent-id="${normalizedId}"]`;
    const locator = page.locator(selector).first();
    
    if (await locator.count() === 0) {
        console.log("Element not found: " + selector);
        return;
    }
    
    try {
       await locator.scrollIntoViewIfNeeded({ timeout: 2000 });
    } catch(e) {}
    
    try {
      const box = await locator.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      }
    } catch(e) {}
    
    try {
       await locator.fill('', { timeout: 2000 }); 
       await locator.type(text, { delay: ActionEngine.getRandomDelay(10, 50), timeout: 5000 });
       await Promise.all([
          page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {}),
          page.keyboard.press('Enter') // Search submit action
       ]);
    } catch(e) {
       console.error("Typing failed, trying via JS:", e);
       await locator.evaluate((el: any, val: string) => { el.value = val; }, text);
       try { 
         await Promise.all([
            page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {}),
            page.keyboard.press('Enter')
         ]);
       } catch(e){}
    }
    await this.wait(1500);
    await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
  }

  static async scroll(page: Page, direction: 'up' | 'down', amount: number = 500): Promise<void> {
    const scrollAmount = direction === 'down' ? amount : -amount;
    await page.evaluate((y) => {
      window.scrollBy({ top: y, left: 0, behavior: 'smooth' });
    }, scrollAmount);
    await this.wait(1000);
  }

  static async autoGoogleLogin(page: Page, email?: string, password?: string): Promise<void> {
    // Navigating via a 3rd party OAuth to bypass Google's "This browser or app may not be secure"
    await this.navigateTo(page, 'https://stackoverflow.com/users/login');
    await this.wait(this.getRandomDelay(2000, 3000));
    
    try {
      // Try clicking "Log in with Google" on StackOverflow
      const googleBtn = page.locator('button[data-provider="google"]');
      if (await googleBtn.isVisible({ timeout: 5000 })) {
          await googleBtn.click();
          await this.wait(4000);
       } else {
          // Fallback if not found
          await this.navigateTo(page, 'https://accounts.google.com/');
          await this.wait(3000);
       }
    } catch(e) {
       await this.navigateTo(page, 'https://accounts.google.com/');
       await this.wait(3000);
    }
    
    if (!email) return;
    
    try {
      // Find email input using better selectors
      const emailInput = page.locator('input[type="email"], #identifierId').first();
      if (await emailInput.isVisible({ timeout: 4000 })) {
        await emailInput.click();
        await this.wait(this.getRandomDelay(300, 800));
        
        // Human-like typing
        await emailInput.type(email, { delay: this.getRandomDelay(80, 180) });
        await this.wait(this.getRandomDelay(500, 1000));
        
        // Click Next instead of pressing Enter
        const nextButton = page.locator('#identifierNext button, button:has-text("Next"), button:has-text("İleri")').first();
        if (await nextButton.isVisible({ timeout: 2000 })) {
            await nextButton.click();
        } else {
            await page.keyboard.press('Enter');
        }

        await this.wait(this.getRandomDelay(4000, 6000)); // Wait for transition
        
        if (password) {
           const passInput = page.locator('input[type="password"], input[name="Passwd"]').first();
           if (await passInput.isVisible({ timeout: 8000 })) {
              await passInput.click();
              await this.wait(this.getRandomDelay(500, 1000));
              await passInput.type(password, { delay: this.getRandomDelay(80, 180) });
              await this.wait(this.getRandomDelay(500, 1000));
              
              const passNextButton = page.locator('#passwordNext button, button:has-text("Next"), button:has-text("İleri")').first();
              if (await passNextButton.isVisible({ timeout: 2000 })) {
                  await passNextButton.click();
              } else {
                  await page.keyboard.press('Enter');
              }
              
              await this.wait(5000); // Wait for login
              
              // Only navigate away after we verify we're not asking for 2FA or similar
           }
        }
      }
    } catch(e) {
      console.error("Auto Google Login failed:", e);
    }
  }

  static async wait(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  private static getRandomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
