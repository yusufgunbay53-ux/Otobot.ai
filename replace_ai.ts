import fs from 'fs';

let content = fs.readFileSync('src/server/routes/aiApi.ts', 'utf-8');

const helper = `
async function fetchLatestEmails(token: string) {
  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=3', {
      headers: { Authorization: \`Bearer \${token}\` }
    });
    const data = await res.json();
    if (!data.messages) return "E-posta bulunamadı.";
    
    let emailsText = "";
    for (const msg of data.messages) {
      const msgRes = await fetch(\`https://gmail.googleapis.com/gmail/v1/users/me/messages/\${msg.id}?format=full\`, {
        headers: { Authorization: \`Bearer \${token}\` }
      });
      const msgData = await msgRes.json();
      
      const subjectHeader = msgData.payload.headers.find((h: any) => h.name === 'Subject');
      const fromHeader = msgData.payload.headers.find((h: any) => h.name === 'From');
      const subject = subjectHeader ? subjectHeader.value : "Konusuz";
      const from = fromHeader ? fromHeader.value : "Bilinmeyen Gönderici";
      const snippet = msgData.snippet || "";
      
      emailsText += \`Kimden: \${from}\\nKonu: \${subject}\\nÖzet: \${snippet}\\n---\\n\`;
    }
    return emailsText;
  } catch (err) {
    console.error("Gmail error:", err);
    return "E-postalar alınırken hata oluştu.";
  }
}
`;

if (!content.includes('fetchLatestEmails')) {
   content = content.replace('router.post(\'/decide\', async (req, res) => {', helper + '\nrouter.post(\'/decide\', async (req, res) => {');
}

const reqBodyReplace = `    const { prompt, htmlState, gmailToken } = req.body;
    
    let extraContext = "";
    if (gmailToken) {
       const emails = await fetchLatestEmails(gmailToken);
       extraContext = \`\\n\\n[KULLANICININ G-MAIL KUTUSUNDAKİ E-POSTALAR]\\n\${emails}\`;
    }`;

if (!content.includes('let extraContext = "";')) {
    content = content.replace('    const { prompt, htmlState } = req.body;', reqBodyReplace);
}

const userContentStr = '{ role: "user", content: `Mevcut Ekran Durumu (HTML DOM):\\n${htmlState}\\n\\nKullanıcı Ana Hedefi: ${prompt}\\n\\nMevcut durumu analiz et ve hedefe ulaşmak için atman gereken BİR SONRAKİ TEK ADIMI JSON olarak döndür.` }';
const newUserContentStr = '{ role: "user", content: `Mevcut Ekran Durumu (HTML DOM):\\n${htmlState}\\n\\nKullanıcı Ana Hedefi: ${prompt}${extraContext}\\n\\nMevcut durumu analiz et ve hedefe ulaşmak için atman gereken BİR SONRAKİ TEK ADIMI JSON olarak döndür.` }';

content = content.replace(userContentStr, newUserContentStr);

fs.writeFileSync('src/server/routes/aiApi.ts', content);
console.log('Modified aiApi.ts');
