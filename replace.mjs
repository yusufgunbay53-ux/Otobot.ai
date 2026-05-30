import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf-8');
const search = '<div className="relative inline-block w-full h-[auto] shadow-2xl rounded-sm ring-1 ring-white/10" style={{ cursor: isAiLoading ? \'wait\' : \'crosshair\' }}>\n                            <img \n                              src={`data:image/jpeg;base64,${browserScreenshot}`} \n                              className="w-full h-auto block rounded-sm pointer-events-auto" \n                              alt="Browser View"';
const replace = '<div className="relative flex items-center justify-center w-full h-full shadow-2xl rounded-sm ring-1 ring-black/5" style={{ cursor: isAiLoading ? \'wait\' : \'crosshair\' }}>\n                            <img \n                              src={`data:image/jpeg;base64,${browserScreenshot}`} \n                              className="w-full h-full object-contain block rounded-sm pointer-events-auto" \n                              alt="Browser View"';
if(content.includes(search)) {
   content = content.replace(search, replace);
   fs.writeFileSync('src/App.tsx', content);
   console.log('Replaced');
} else {
   console.log('Not found');
   const rx = /<div className="relative inline-block w-full h-\[auto\][\s\S]*?alt="Browser View"/m;
   if(rx.test(content)) {
     content = content.replace(rx, replace);
     fs.writeFileSync('src/App.tsx', content);
     console.log('Replaced via regex');
   }
}
