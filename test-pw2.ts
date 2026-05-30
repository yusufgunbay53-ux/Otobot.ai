import { chromium } from 'playwright';
(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    try {
        await context.addCookies([{ name: "t1", value: "v", url: "https://google.com" }]);
        console.log("Just url: OK");
    } catch(e: any) { console.log("Just url FAILED:", e.message); }

    try {
        await context.addCookies([{ name: "t2", value: "v", domain: ".google.com", path: "/" }]);
        console.log("Domain + path: OK");
    } catch(e: any) { console.log("Domain + path FAILED:", e.message); }

    try {
        await context.addCookies([{ name: "t3", value: "v", url: "https://google.com", path: "/" }]);
        console.log("Url + path: OK");
    } catch(e: any) { console.log("Url + path FAILED:", e.message); }

    try {
        await context.addCookies([{ name: "t4", value: "v", url: "https://google.com", domain: ".google.com", path: "/" }]);
        console.log("Url + domain + path: OK");
    } catch(e: any) { console.log("Url + domain + path FAILED:", e.message); }

    await browser.close();
})();
