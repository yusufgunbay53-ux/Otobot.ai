import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  
  try {
     await context.addCookies([{
        name: "test",
        value: "val",
        domain: ".google.com",
        path: "/",
        expires: 1748259792.834006
     }]);
     console.log("Float expires is OK");
  } catch(e) {
     console.log("Float expires FAILED", e);
  }
  
  try {
     await context.addCookies([{
        name: "test2",
        value: "val",
        url: "http://localhost:3000/start-page",
        path: "/"
     }]);
     console.log("localhost url is OK");
  } catch(e) {
     console.log("localhost url FAILED", e);
  }
  
  try {
     await context.addCookies([{
        name: "test3",
        value: "val",
        url: "http://localhost:3000/",
        domain: ".localhost",
        path: "/"
     }]);
     console.log("url AND domain is OK");
  } catch(e) {
     console.log("url AND domain FAILED", e);
  }

  await browser.close();
})();
