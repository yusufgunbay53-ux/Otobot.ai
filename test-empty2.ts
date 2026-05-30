import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const sc3: any = {
      name: "hi",
      value: "123",
      domain: " .google.com",
      path: "/",
    };
    try {
        await context.addCookies([sc3]);
        console.log("Success with space domain");
    } catch(e: any) {
        console.log("Failed with space domain", e.message);
    }
    
    const sc4: any = {
      name: "hi2",
      value: "123",
      domain: ".google.com",
      path: " /",
    };
    try {
        await context.addCookies([sc4]);
        console.log("Success with space path");
    } catch(e: any) {
        console.log("Failed with space path", e.message);
    }
    
    await browser.close();
})();
