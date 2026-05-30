import { Router } from 'express';
import { parseAgentAction } from '../../lib/parser';

const router = Router();
const MISTRAL_API_KEY = "HZ5HpRrF9umDeodp5h1fc8FzbdTAzYOq";
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";

const systemInstruction = `Sen bir yapay zeka tarayıcı otomasyon motorusun. Kullanıcının verdiği hedefi gerçekleştirmek için web sayfasında adımlar atacaksın.
Kullanıcı sana her adımda sayfanın mevcut durumunu (sadeleştirilmiş HTML ve data-agent-id etiketli elementleri) verecek.

Senin görevin durumu analiz etmek ve YAPMAN GEREKEN BİR SONRAKİ ADIMI KESİNLİKLE aşağıdaki JSON formatında vermek. 

JSON Formatı:
{
  "thought": "Şu an x sayfasındayım, 'Ara' butonuna tıklayacağım.",
  "action": "TYPE" | "CLICK" | "SCROLL" | "NAVIGATE" | "FINISH",
  "params": { 
    "agentId": "el_1 (Eğer TYPE veya CLICK ise gerekli. SADECE var olan idleri kullan, UYDURMA)", 
    "text": "Araba (TYPE ise gerekli)", 
    "url": "https://... (NAVIGATE ise gerekli)",
    "direction": "down veya up (SCROLL ise gerekli)"
  },
  "isTaskComplete": false
}

Kurallar:
- "thought" alanında KESİNLİKLE "el_4", "el_12" gibi teknik kimlikler KULLANMA. Onun yerine "Arama butonuna tıklıyorum", "Kutucuğa metin giriyorum" gibi tamamen doğal ifadeler kullan. Tıkladığın butonun üzerinde yazan metni kullanarak ne yaptığını söyle.
- Eğer kullanıcı bir web sitesine gitmeni isterse İLK İŞ OLARAK "action": "NAVIGATE" kullan.
- Genel konularda bilgi aramanı isterse her zaman "https://duckduckgo.com/?q=ARANACAK_KELIME" sayfasına git (Google botları engeller, KULLANMA).
- TIKANIRSAN VEYA HEDEFE ULAŞAMAZSAN, farklı bağlantılara (linklere) tıklayarak veya sayfayı kaydırarak ("action": "SCROLL") sorunu AKTİF OLARAK çözüp ilerlemeye çalış. Çözüm üretmeden görevi bitirme.
- GÖREVİ TAMAMEN BİTİRMEDEN "isTaskComplete": true YAPMA. Hedeflenen sonuca veya bilgiye ulaştığında bitir.
- GÖREVİ BİTİRDİĞİNDE (isTaskComplete: true VEYA action: FINISH olduğunda): "thought" alanına YALNIZCA KULLANICIYA MESAJ olacak şekilde metni şu iki işaret arasına yaz: <Ö> mesajın buraya gelecek <Ö>.
- Kapanış mesajı (yani <Ö> içindeki metin) teknik hiçbir terim içermeyecek. Tamamen samimi, normal, sıcak kanlı bir insanın söyleyeceği bir cümle olacak (Örnek: <Ö>İstediğiniz yere tıkladım ve işlemi başarıyla hallettim!<Ö> veya <Ö>Tüm işlemleri bitirdim, başka bir isteğiniz var mı?<Ö>). İşlemi ben yaptım, hallettim tarzı kelimeleri sık kullan.
- SADECE geçerli bir JSON döndür.`;


async function fetchLatestEmails(token: string) {
  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=3', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.messages) return "E-posta bulunamadı.";
    
    let emailsText = "";
    for (const msg of data.messages) {
      const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const msgData = await msgRes.json();
      
      const subjectHeader = msgData.payload.headers.find((h: any) => h.name === 'Subject');
      const fromHeader = msgData.payload.headers.find((h: any) => h.name === 'From');
      const subject = subjectHeader ? subjectHeader.value : "Konusuz";
      const from = fromHeader ? fromHeader.value : "Bilinmeyen Gönderici";
      const snippet = msgData.snippet || "";
      
      emailsText += `Kimden: ${from}\nKonu: ${subject}\nÖzet: ${snippet}\n---\n`;
    }
    return emailsText;
  } catch (err) {
    console.error("Gmail error:", err);
    return "E-postalar alınırken hata oluştu.";
  }
}

router.post('/decide', async (req, res) => {
  try {
    const { prompt, htmlState, gmailToken } = req.body;
    
    let extraContext = "";
    if (gmailToken) {
       const emails = await fetchLatestEmails(gmailToken);
       extraContext = `\n\n[KULLANICININ G-MAIL KUTUSUNDAKİ E-POSTALAR]\n${emails}`;
    }
    
    let response;
    let retries = 3;
    let delay = 15000; // 15 seconds
    let lastErrorText = "";
    let statusCode = 500;
    let currentModel = "mistral-large-latest";
    
    // Try multiple times in case of rate limit (429)
    for (let i = 0; i < retries; i++) {
      response = await fetch(MISTRAL_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${MISTRAL_API_KEY}`
        },
        body: JSON.stringify({
          model: currentModel,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: `Mevcut Ekran Durumu (HTML DOM):\n${htmlState}\n\nKullanıcı Ana Hedefi: ${prompt}${extraContext}\n\nMevcut durumu analiz et ve hedefe ulaşmak için atman gereken BİR SONRAKİ TEK ADIMI JSON olarak döndür.` }
          ],
          response_format: { type: "json_object" },
          max_tokens: 1000,
          temperature: 0.1,
        })
      });

      if (response.ok) {
        break; // Success!
      }

      statusCode = response.status;
      lastErrorText = await response.text();
      
      // If rate limited, wait and try again
      if (response.status === 429) {
        console.warn(`Mistral rate limited on ${currentModel}. Retrying in ${delay}ms...`);
        // Switch to a smaller model on subsequent retries for better rate limits
        if (i === 0) {
           currentModel = "mistral-small-latest";
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        // keep delay at 15000
      } else {
        // Break on other errors (e.g. 401, 400)
        break;
      }
    }

    if (!response || !response.ok) {
      throw new Error(`Mistral API Error: ${statusCode} - ${lastErrorText}`);
    }

    const data = await response.json();
    const aiText = data.choices?.[0]?.message?.content || "";
    const parsed = parseAgentAction(aiText);
    res.json({ success: true, ...parsed });

  } catch (error: any) {
    console.error("AI Proxy Error:", error);
    res.status(500).json({ success: false, error: error.message || String(error) });
  }
});

export default router;
