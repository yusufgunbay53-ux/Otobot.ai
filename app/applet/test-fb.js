const { firefox } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
firefox.use(stealth);
firefox.launch().then(b => { console.log('success'); b.close(); }).catch(e => console.error(e));
