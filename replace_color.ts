import fs from "fs";
const file = "src/server/browser/BrowserService.ts";
let content = fs.readFileSync(file, "utf8");
content = content.replace(/colorScheme:\s*'dark'/g, "colorScheme: 'light'");
fs.writeFileSync(file, content);
console.log("Done");
