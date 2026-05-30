import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf-8');

if (!content.includes('import { playClickSound, playTypeSound }')) {
    content = content.replace("import { decideNextAction } from './lib/gemini';", "import { decideNextAction } from './lib/gemini';\nimport { playClickSound, playTypeSound } from './lib/sounds';");
}

const replacement = `
        if (agentResponse.action === 'CLICK') {
          playClickSound();
        } else if (agentResponse.action === 'TYPE') {
          let charCount = agentResponse.params.text ? agentResponse.params.text.length : 5;
          for(let i=0; i<charCount; i++) {
             setTimeout(playTypeSound, i * 50);
          }
        }
        
        currentHtml = await handleAction(sessionId, agentResponse.action, agentResponse.params);
`;

const search = `currentHtml = await handleAction(sessionId, agentResponse.action, agentResponse.params);`;
if(content.includes(search)) {
   content = content.replace(search, replacement);
   fs.writeFileSync('src/App.tsx', content);
   console.log('App.tsx modified');
} else {
   console.log('Search string not found in App.tsx');
}
