import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const cookie = {
            name: "test",
            value: "value",
            url: "https://google.com/",
            secure: true
    };
    try {
        await context.addCookies([cookie]);
        console.log("Success with URL");
    } catch(e: any) {
        console.log("Failed with URL", e.message);
    }
    
    await browser.close();
})();
