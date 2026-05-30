import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const cookie = {
            name: "__Host-GAPS",
            value: "1:abcde",
            url: "https://myaccount.google.com/",
            secure: true
    };
    try {
        await context.addCookies([cookie]);
        console.log("Success with URL __Host");
        const cookies = await context.cookies();
        console.log(cookies.find(c => c.name === '__Host-GAPS'));
    } catch(e: any) {
        console.log("Failed with URL", e.message);
    }
    
    await browser.close();
})();
