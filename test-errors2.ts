import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const sc5: any = {
      name: "hi3",
      value: "123"
    };
    try {
        await context.addCookies([sc5]);
        console.log("Success with no domain/url/path");
    } catch(e: any) {
        console.log("Failed with no domain/url/path", e.message);
    }
    
    // what if name has newlines?
    const sc6: any = {
        name: "hi\nthere",
        value: "123",
        domain: ".google.com",
        path: "/"
    }
    try {
        await context.addCookies([sc6]);
        console.log("Success with newline in name");
    } catch(e: any) {
        console.log("Failed with newline in name", e.message);
    }
    
    // what if value has newlines?
    const sc7: any = {
        name: "hi",
        value: "123\n456",
        domain: ".google.com",
        path: "/"
    }
    try {
        await context.addCookies([sc7]);
        console.log("Success with newline in value");
    } catch(e: any) {
        console.log("Failed with newline in value", e.message);
    }

    await browser.close();
})();
