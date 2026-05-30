import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const sc: any = {
      name: "",
      value: "123",
      domain: ".google.com",
      path: "/",
    };
    
    try {
        await context.addCookies([sc]);
        console.log("Success with empty name");
    } catch(e: any) {
        console.log("Failed with empty name", e.message);
    }

    const sc2: any = {
      name: "   ",
      value: "123",
      domain: ".google.com",
      path: "/",
    };
    try {
        await context.addCookies([sc2]);
        console.log("Success with space name");
    } catch(e: any) {
        console.log("Failed with space name", e.message);
    }
    
    await browser.close();
})();
