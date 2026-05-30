import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const c = {
        "domain": ".google.com",
        "expirationDate": 1748259792.834006,
        "hostOnly": false,
        "httpOnly": false,
        "name": "SID",
        "path": "/",
        "sameSite": "unspecified",
        "secure": false,
        "session": false,
        "storeId": "0",
        "value": "fake_sid_value"
    };

    const sc: any = {
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      httpOnly: c.httpOnly,
      secure: c.secure,
    };
    
    // Test if some unspecified property causes issues?
    
    try {
        await context.addCookies([sc]);
        console.log("Success with simple");
    } catch(e: any) {
        console.log("Failed with simple", e.message);
    }
    
    await browser.close();
})();
