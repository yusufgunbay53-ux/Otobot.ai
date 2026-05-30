import React, { useState, useEffect, useRef } from 'react';
import { Send, MonitorPlay, Sparkles, ChevronLeft, MousePointer2, Globe, Mail, PanelLeft, Settings, Plus, MessageSquare, LogOut, X } from 'lucide-react';
import { GiOctopus } from 'react-icons/gi';
import { decideNextAction } from './lib/gemini';
import { playClickSound, playTypeSound } from './lib/sounds';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export default function App() {
  const [view, setView] = useState<'chat' | 'preview'>('chat');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiActiveTarget, setAiActiveTarget] = useState<{agentId: string} | null>(null);
  const [aiVirtualEmail, setAiVirtualEmail] = useState<string>("");

  // Sidebar & Conv State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<{id: string, title: string, messages: ChatMessage[]}[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Browser state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [browserScreenshot, setBrowserScreenshot] = useState<string>("");
  const [browserHtml, setBrowserHtml] = useState<string>("");
  const [urlInput, setUrlInput] = useState<string>("http://localhost:3000/start-page");
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [keyboardInput, setKeyboardInput] = useState<string>("");
  const [inputRects, setInputRects] = useState<{x: number, y: number, w: number, h: number, val: string}[]>([]);
  const [remoteSize, setRemoteSize] = useState({ w: 1280, h: 800 });
  const [viewportSize, setViewportSize] = useState({ w: 1280, h: 800 });
  const [gmailConnected, setGmailConnected] = useState(false);

  const [alertMsg, setAlertMsg] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Using a ref for state data to use inside the looping async function
  const htmlRef = useRef(browserHtml);
  
  useEffect(() => {
    htmlRef.current = browserHtml;
  }, [browserHtml]);

  useEffect(() => {
    if (sessionStorage.getItem('gmailAccessToken')) {
       setGmailConnected(true);
    }
  }, []);

  const fetchVirtualMailbox = async (email: string) => {
    if (email.includes('@gmail.com')) {
      return "Bu bir Gmail adresidir. Botun bu gelen kutusuna doğrudan erişimi yoktur! Gelen e-posta (onay/şifre) olursa, kullanıcının KENDİ Gmail gelen kutusuna düşecektir. Kullanıcıdan kodu sana sohbette vermesini iste.";
    }
    try {
      const [login, domain] = email.split('@');
      const res = await fetch(`https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`);
      const messages = await res.json();
      if (messages && messages.length > 0) {
        const msgRes = await fetch(`https://www.1secmail.com/api/v1/?action=readMessage&login=${login}&domain=${domain}&id=${messages[0].id}`);
        const msgDetails = await msgRes.json();
        return `YENİ GELEN MESAJ VAR! (Gönderen: ${msgDetails.from}, Konu: ${msgDetails.subject}):\n${msgDetails.textBody}`;
      }
    } catch(e) {}
    return "Gelen kutusu boş.";
  };

  useEffect(() => {
    document.title = "otobot.ai";
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthInitialized(true);
      if (user && user.email) {
        setAiVirtualEmail(user.email);
        const storedConvs = localStorage.getItem(`conversations_${user.uid}`);
        if (storedConvs) {
           try {
             setConversations(JSON.parse(storedConvs));
           } catch(e) {}
        }
      } else {
        setAiVirtualEmail("");
        setConversations([]);
        setCurrentConvId(null);
        setChatMessages([]);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (currentUser && conversations.length > 0) {
      localStorage.setItem(`conversations_${currentUser.uid}`, JSON.stringify(conversations));
    }
  }, [conversations, currentUser]);

  useEffect(() => {
    if (currentUser && !currentConvId && authInitialized) {
       startNewChat();
    }
  }, [currentUser, currentConvId, authInitialized]);

  useEffect(() => {
    if (currentConvId && chatMessages.length > 0) {
      setConversations(prev => {
        const exists = prev.find(c => c.id === currentConvId);
        if (exists) {
           return prev.map(c => c.id === currentConvId ? { ...c, messages: chatMessages } : c);
        } else {
           const title = chatMessages[0].content.substring(0, 25) + (chatMessages[0].content.length > 25 ? "..." : "");
           return [{ id: currentConvId, title, messages: chatMessages }, ...prev];
        }
      });
    }
  }, [chatMessages, currentConvId]);

  const startNewChat = () => {
    setChatMessages([]);
    setCurrentConvId(Date.now().toString());
    setIsSidebarOpen(false);
  };
  
  const loadConversation = (id: string) => {
    const conv = conversations.find(c => c.id === id);
    if (conv) {
       setChatMessages(conv.messages);
       setCurrentConvId(id);
       setIsSidebarOpen(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, isAiLoading]);

  // Init Browser Session
  useEffect(() => {
    const initBrowser = async () => {
      try {
        const browserWidth = Math.min(1280, window.innerWidth);
        const browserHeight = Math.min(800, window.innerHeight - 60 - 56); // 60px header, 56px url bar
        setViewportSize({ w: browserWidth, h: browserHeight });
        const res = await fetch('/api/browser/init', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            width: browserWidth, 
            height: browserHeight,
            loadStateId: currentUser ? currentUser.uid : undefined
          })
        });
        const data = await res.json();
        if (data.sessionId) {
          setSessionId(data.sessionId);
          // Initial Navigation
          handleAction(data.sessionId, 'NAVIGATE', { url: "http://localhost:3000/start-page" });
        }
      } catch (err) {
        console.error("Failed to init browser", err);
      }
    };
    initBrowser();
  }, [currentUser]);

  const getCoords = (e: React.MouseEvent, img: HTMLImageElement) => {
    const rect = img.getBoundingClientRect();
    const naturalW = img.naturalWidth || viewportSize.w;
    const naturalH = img.naturalHeight || viewportSize.h;
    const imageAspect = naturalW / naturalH;
    const canvasAspect = rect.width / rect.height;
    let renderW = rect.width;
    let renderH = rect.height;
    let offsetX = 0;
    let offsetY = 0;
    
    if (imageAspect > canvasAspect) {
      renderH = rect.width / imageAspect;
      offsetY = (rect.height - renderH) / 2;
    } else {
      renderW = rect.height * imageAspect;
      offsetX = (rect.width - renderW) / 2;
    }
    
    let clickX = e.clientX - rect.left - offsetX;
    let clickY = e.clientY - rect.top - offsetY;
    if (clickX < 0 || clickX > renderW || clickY < 0 || clickY > renderH) return null;
    
    const percentX = clickX / renderW;
    const percentY = clickY / renderH;
    
    const x = percentX * remoteSize.w;
    const y = percentY * remoteSize.h;
    
    console.log("Tıklanan Raw Koordinat:", e.clientX, e.clientY, "Dönüştürülen Koordinat:", x, y);
    return { x, y };
  };

  const wsRef = useRef<WebSocket | null>(null);

  // WebSockets for Live Screencast
  useEffect(() => {
    if (!sessionId) return;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/browser/stream?sessionId=${sessionId}`);
    wsRef.current = ws;
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'screencastFrame') {
          // message.data is base64 JPEG
          setBrowserScreenshot(message.data);
          if (message.metadata) {
             const { deviceWidth, deviceHeight, pageScaleFactor } = message.metadata;
             if (deviceWidth && deviceHeight && pageScaleFactor) {
                setViewportSize({ 
                    w: deviceWidth / pageScaleFactor, 
                    h: deviceHeight / pageScaleFactor 
                });
             }
          }
        } else if (message.type === 'urlChanged') {
          setUrlInput(message.url);
        } else if (message.type === 'inputRects') {
          setInputRects(message.rects || []);
        }
      } catch (err) {}
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [sessionId]);

  const fetchState = async (sid: string) => {
    try {
      const res = await fetch('/api/browser/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid })
      });
      const data = await res.json();
      if (data.success && data.state) {
        // No need to set the screenshot here as WS streams it live, 
        // but it doesn't hurt. We'll skip it to avoid flickering.
        setBrowserHtml(data.state.html);
        if (data.state.url) setUrlInput(data.state.url);
        return data.state.html as string;
      }
    } catch(e) { }
    return "";
  };

  const handleAction = async (sid: string, action: string, params: any) => {
    setIsLoadingUrl(true);
    let newHtml = "";
    try {
      const res = await fetch('/api/browser/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, action, params })
      });
      const data = await res.json();
      if (data.success && data.state) {
        setBrowserHtml(data.state.html);
        if (data.state.url) setUrlInput(data.state.url);
        newHtml = data.state.html;
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingUrl(false);
    }
    return newHtml;
  };

  const handleURLSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAiLoading) return;
    if (sessionId && urlInput) {
      await handleAction(sessionId, 'NAVIGATE', { url: urlInput });
    }
  };

  const handleAiSubmit = async () => {
    if (!aiPrompt.trim() || isAiLoading || !sessionId) return;
    
    const userMsg = aiPrompt.trim();
    setAiPrompt("");
    setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: userMsg }]);
    setIsAiLoading(true);
    setView('preview');
    
    try {
      // Her yeni mesajda sayfanın en güncel HTML durumunu çekiyoruz.
      let currentHtml = await fetchState(sessionId);

      // Reconing Loop
      const maxSteps = 9999;
      let step = 0;
      let isFinished = false;
      let actionHistory: string[] = [];

      while (step < maxSteps && !isFinished) {
        step++;
        
        let contextInfo = "Ekrandaki Tıklanabilir Öğeler (Sadeleştirilmiş HTML):\n\n";
        if (currentHtml) {
          contextInfo += currentHtml.slice(0, 30000); // Prevent overflow for API limits
        } else {
          contextInfo += "(Şu anda açık bir sayfa yok veya sayfa yüklenmedi.)\n";
        }

        if (aiVirtualEmail) {
          const mailBody = await fetchVirtualMailbox(aiVirtualEmail);
          const isGmailAddress = aiVirtualEmail.includes('@gmail.com');
          contextInfo += `\n\n--- YAPAY ZEKA KALICI MAİL KUTUSU ---
Senin bu görev için kayıt e-posta adresin: ${aiVirtualEmail}
Bu sitelere / servislere kayıt olurken bu mail adresini kullanacaksın. Asla başka mailleri deneme!
Mevcut Gelen Kutusu Durumu:
${mailBody}
Kayıt oldugun sitelerde doğrulama (OTP vb) kodu istendiğinde${isGmailAddress ? ', kullanıcıdan kodu sohbette vermesini bekle (Gmail gelen kutusunu göremezsin).' : ', bu metinden okuyup hemen TYPE komutuyla siteye yaz (e-postalar buraya düşer).'}\n\n`;
        }

        if (actionHistory.length > 0) {
          contextInfo += "\n\n--- GEÇMİŞ İŞLEMLER (Bu görevde şu ana kadar yaptıkların) ---\n";
          actionHistory.forEach((h, i) => contextInfo += `${i+1}. ${h}\n`);
          contextInfo += "\nLütfen Geçmiş İşlemlerine bak. Eğer kullanıcının tam olarak istediğini zaten yaptıysan (örneğin sadece 1 tıklama istenmişse ve tıkladıysan, ya da metin girmen istendiyse ve girdiysen), AYNI YERİ TEKRAR DENEME ve isTaskComplete: true döndürerek DUR.\n";
        }

        const gmailToken = sessionStorage.getItem('gmailAccessToken');
        const agentResponse = await decideNextAction(userMsg, contextInfo, gmailToken);
        
        actionHistory.push(`Eylem: ${agentResponse.action}, Detay: ${JSON.stringify(agentResponse.params)}, Sistem Açıklaması: "${agentResponse.thought}"`);

        if (agentResponse.action === 'FINISH') {
          isFinished = true;
          setChatMessages(prev => [...prev, { 
            id: Date.now().toString() + Math.random(), 
            role: 'assistant', 
            content: `Görev başarıyla tamamlandı!\n\nSon İşlem Özeti: ${agentResponse.thought}` 
          }]);
          break;
        }

        // Execute action
        if (agentResponse.params && agentResponse.params.agentId) {
          setAiActiveTarget({ agentId: agentResponse.params.agentId });
        }
        
        
        if (agentResponse.action === 'CLICK') {
          playClickSound();
        } else if (agentResponse.action === 'TYPE') {
          let charCount = agentResponse.params.text ? agentResponse.params.text.length : 5;
          for(let i=0; i<charCount; i++) {
             setTimeout(playTypeSound, i * 50);
          }
        }
        
        currentHtml = await handleAction(sessionId, agentResponse.action, agentResponse.params);

        setAiActiveTarget(null);
        
        if (agentResponse.isTaskComplete || agentResponse.action === "FINISH") {
          isFinished = true;
          let finalMsg = agentResponse.thought;
          const userMsgMatch = finalMsg.match(/<Ö>([\s\S]*?)<Ö>/);
          if (userMsgMatch && userMsgMatch[1]) {
             finalMsg = userMsgMatch[1].trim();
          } else {
             finalMsg = `Görev tamamlandı: ${finalMsg}`;
          }
          setChatMessages(prev => [...prev, { 
            id: Date.now().toString() + Math.random(), 
            role: 'assistant', 
            content: finalMsg 
          }]);
          break;
        }
        
        // Yapay zeka adım gecikmesi
        await new Promise(r => setTimeout(r, 15000));
      }
      
    } catch (error) {
      setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: "Bir hata oluştu: " + String(error) }]);
    } finally {
      setIsAiLoading(false);
      setView('chat');
    }
  };

  const handleMainLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Giriş başarısız:", error);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
      const result = await signInWithPopup(auth, provider);
      
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential && credential.accessToken) {
         // Store the token in session storage or send it to server
         sessionStorage.setItem('gmailAccessToken', credential.accessToken);
         setGmailConnected(true);
      }
    } catch (error) {
      console.error("Giriş başarısız:", error);
      alert("Gmail bağlantısı iptal edildi veya başarısız oldu.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Çıkış başarısız:", e);
    }
  };

  // Hide alert message after 5 seconds
  useEffect(() => {
    if (alertMsg) {
      const timer = setTimeout(() => setAlertMsg(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [alertMsg]);

  if (!authInitialized) {
    return (
      <div className="w-[100vw] h-[100dvh] bg-white text-slate-900 flex flex-col items-center justify-center font-sans">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <div className="mt-4 text-slate-500 text-sm font-medium">Uygulama Yükleniyor...</div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="w-[100vw] h-[100dvh] bg-slate-50 flex items-center justify-center font-sans p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl overflow-hidden shadow-indigo-100/50">
          <div className="p-8 text-center border-b border-slate-100">
            <div className="mx-auto w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-6 shadow-inner">
               <GiOctopus className="w-8 h-8 text-indigo-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Otobot.ai'a Giriş Yapın</h1>
            <p className="text-slate-500 text-sm">
              Devam etmek ve yapay zeka aracını kullanmaya başlamak için Google hesabınızla oturum açın.
            </p>
          </div>
          <div className="p-8">
            <button
              onClick={handleMainLogin}
              className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 py-3 px-4 rounded-xl font-medium transition-all hover:shadow-sm"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="w-5 h-5">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google ile Devam Et
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[100vw] h-[100dvh] bg-white text-slate-900 flex flex-col font-sans overflow-hidden fixed inset-0">
      
      {/* ---------- TOAST MESSAGE ---------- */}
      {alertMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-3 bg-white border border-slate-200 shadow-2xl rounded-lg text-sm text-slate-800 flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
          <span>{alertMsg}</span>
          <button onClick={() => setAlertMsg("")} className="ml-2 text-slate-500 hover:text-slate-800">X</button>
        </div>
      )}

      {/* ---------- HEADER ---------- */}
      <header className="h-[60px] shrink-0 border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 relative z-20">
        <div className="flex items-center gap-2 lg:gap-3">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 -ml-2 text-slate-500 hover:text-slate-800 transition-colors">
            <PanelLeft className="w-5 h-5 lg:w-6 lg:h-6" />
          </button>
          <button 
            onClick={() => setView(view === 'chat' ? 'preview' : 'chat')} 
            className="bg-slate-100 hover:bg-slate-200 border border-slate-200 px-3 py-2 lg:px-4 rounded-lg text-xs lg:text-sm font-medium flex flex-row items-center gap-2 transition-colors active:scale-95 text-slate-700"
          >
            {view === 'chat' ? (
               <>
                 <MonitorPlay className="w-4 h-4 text-indigo-400" />
                 <span className="hidden sm:inline text-indigo-400">Yapay Tıklama Önizlemesi</span>
                 <span className="sm:hidden text-indigo-400">Önizleme</span>
               </>
            ) : (
               <>
                 <ChevronLeft className="w-4 h-4" />
                 <span>Sohbete Dön</span>
               </>
            )}
          </button>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={gmailConnected ? undefined : handleGoogleLogin}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-semibold transition-colors border ${gmailConnected ? 'bg-green-50 text-green-600 border-green-100 cursor-default' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border-indigo-100'}`}
            title="Okuma izni vererek AI'ın doğrulama kodlarını e-postanızdan otomatik okumasını sağlayın."
          >
            <Mail className="w-4 h-4" />
            <span className="hidden sm:inline">{gmailConnected ? "Gmail Bağlandı" : "Gmail'i Bağla"}</span>
          </button>
          <div className="flex items-center gap-2 font-black text-base tracking-wide text-slate-900 border-l border-slate-200 pl-4">
             <GiOctopus className="w-6 h-6 text-indigo-500" />
            Otobot AI
          </div>
        </div>
      </header>

      {/* ---------- MAIN AREA ---------- */}
      <main className="flex-1 relative overflow-hidden flex w-full h-[calc(100vh-60px)]">
          
          {/* ---------- SIDEBAR ---------- */}
          <div className={`absolute left-0 top-0 h-full bg-slate-50 border-r border-slate-200 z-50 flex flex-col transition-all duration-300 transform shadow-2xl lg:shadow-none ${isSidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64'}`}>
             <div className="flex items-center justify-between p-4 border-b border-slate-200">
                <button 
                   onClick={() => startNewChat()}
                   className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg font-medium transition-colors text-sm"
                >
                   <Plus className="w-4 h-4" /> Yeni Sohbet
                </button>
             </div>
             
             <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 pt-3 pb-2">Sohbetler</h3>
                {conversations.map(conv => (
                   <button
                      key={conv.id}
                      onClick={() => loadConversation(conv.id)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${currentConvId === conv.id ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-200'}`}
                   >
                      <MessageSquare className="w-4 h-4 shrink-0 opacity-70" />
                      <span className="truncate">{conv.title}</span>
                   </button>
                ))}
             </div>
             
             <div className="p-3 border-t border-slate-200 relative">
                <button 
                   onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                   className="w-full flex items-center justify-between p-2 rounded-lg text-left hover:bg-slate-200 transition-colors"
                >
                   <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-8 h-8 bg-indigo-200 rounded-full flex items-center justify-center shrink-0">
                         <span className="text-indigo-700 font-bold text-sm">{currentUser?.email?.substring(0, 1).toUpperCase()}</span>
                      </div>
                      <div className="flex flex-col truncate">
                         <span className="text-[13px] font-semibold text-slate-800 truncate">{currentUser?.displayName || 'Kullanıcı'}</span>
                         <span className="text-[11px] text-slate-500 truncate">{currentUser?.email}</span>
                      </div>
                   </div>
                   <Settings className="w-4 h-4 text-slate-500 shrink-0 mx-1" />
                </button>
                
                {isSettingsOpen && (
                   <div className="absolute bottom-full left-3 w-[calc(100%-24px)] mb-2 bg-white rounded-xl border border-slate-200 shadow-lg flex flex-col p-1.5 animate-in slide-in-from-bottom-2 fade-in">
                      <button 
                         onClick={handleLogout}
                         className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                         <LogOut className="w-4 h-4" />
                         Çıkış Yap
                      </button>
                   </div>
                )}
             </div>
          </div>
          
          {isSidebarOpen && (
             <div 
               className="absolute inset-0 bg-slate-900/20 z-40 lg:hidden"
               onClick={() => setIsSidebarOpen(false)}
             />
          )}

          {/* SCREENSHOT PREVIEW CONTAINER */}
          <div className={`absolute inset-0 flex items-center justify-center bg-slate-100 p-0 transition-opacity duration-500 ease-in-out ${view === 'preview' ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none z-0'}`}>
              <div className="w-full h-full mx-auto bg-white flex flex-col border-none overflow-hidden relative">
                 {/* Modern Browser Tab / Address Bar (Chrome Dark style) */}
                 <div className="bg-[#202124] flex flex-col shrink-0">
                   {/* Tabs Area */}
                   <div className="flex items-end px-2 pt-2 gap-1 h-10 border-b border-[#000]">
                     <div className="flex items-center justify-between bg-[#323639] w-48 sm:w-60 h-8 rounded-t-lg px-3 group">
                       <div className="flex items-center gap-2 overflow-hidden mix-blend-plus-lighter">
                         <div className="w-4 h-4 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                            <Globe className="w-2.5 h-2.5 text-white" />
                         </div>
                         <span className="text-xs font-medium text-slate-200 truncate">{urlInput || "Yeni Sekme"}</span>
                       </div>
                     </div>
                     <div className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors mb-0.5 ml-1">
                       <div className="text-white/70 text-lg font-light leading-none">+</div>
                     </div>
                   </div>
                   
                   {/* Address Bar Area */}
                   <div className="h-12 bg-[#323639] border-b border-[#000] flex items-center px-3 sm:px-4 gap-3">
                     
                     <div className="flex items-center gap-1.5 text-[#E8EAED]">
                       <div className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center cursor-pointer transition-colors">
                         <ChevronLeft className="w-4 h-4" />
                       </div>
                       <div className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center cursor-pointer transition-colors">
                         <ChevronLeft className="w-4 h-4 rotate-180" />
                       </div>
                       <div className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center cursor-pointer transition-colors ml-1">
                         <div className="w-3.5 h-3.5 border-2 border-current border-r-transparent rounded-full" style={{ transform: 'rotate(45deg)' }}></div>
                       </div>
                     </div>
                     
                     <form onSubmit={handleURLSubmit} className="flex-1 flex items-center justify-center">
                       <div className="w-full relative flex items-center">
                         <input 
                            type="text" 
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            disabled={isAiLoading}
                            className="w-full bg-[#202124] border border-transparent focus:border-[#8AB4F8] outline-none rounded-full text-[#E8EAED] px-5 py-1.5 text-sm transition-all disabled:opacity-50"
                            spellCheck="false"
                         />
                         {isLoadingUrl && (
                           <div className="absolute right-3 flex items-center h-full">
                             <div className="w-3.5 h-3.5 border-2 border-[#8AB4F8] border-t-transparent rounded-full animate-spin"></div>
                           </div>
                         )}
                       </div>
                     </form>
                     
                     <div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full hover:bg-slate-200 hidden sm:flex items-center justify-center"><GiOctopus className="w-4 h-4 text-slate-500" /></div></div></div></div>
                 
                 {/* Browser Viewport */}
                 <div className="flex-1 relative overflow-hidden bg-white flex items-center justify-center"
                      tabIndex={0}
                      onKeyDown={(e) => {
                         if (isAiLoading || !wsRef.current) return;
                         e.preventDefault();
                         wsRef.current.send(JSON.stringify({ type: 'keydown', key: e.key }));
                      }}
                 >
                    {isAiLoading && (
                       <div className="absolute inset-0 z-20 bg-black/10 cursor-not-allowed"></div>
                    )}
                    {browserScreenshot ? (
                       <div className="relative flex items-center justify-center w-full h-full shadow-2xl rounded-sm ring-1 ring-black/5" style={{ cursor: isAiLoading ? 'wait' : 'crosshair' }}>
                            <img 
                              src={`data:image/jpeg;base64,${browserScreenshot}`} 
                              className="w-full h-full object-contain block rounded-sm pointer-events-auto" 
                              alt="Browser View" 
                             onLoad={(e) => {
                                 setRemoteSize({ 
                                     w: e.currentTarget.naturalWidth || 1280, 
                                     h: e.currentTarget.naturalHeight || 800 
                                 });
                             }}
                             onDragStart={(e) => e.preventDefault()}
                             onMouseDown={(e) => {
                            if (isAiLoading || !wsRef.current) return;
                            const coords = getCoords(e, e.currentTarget);
                            if (coords) wsRef.current.send(JSON.stringify({ type: 'mousedown', ...coords, button: e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle' }));
                         }}
                         onMouseUp={(e) => {
                            if (isAiLoading || !wsRef.current) return;
                            const coords = getCoords(e, e.currentTarget);
                            if (!coords) return;
                            wsRef.current.send(JSON.stringify({ type: 'mouseup', ...coords, button: e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle' }));
                            
                            // Let the server focus within the virtual browser
                            wsRef.current.send(JSON.stringify({ type: 'focusAt', ...coords }));
                            
                            // Update the keyboard input if we clicked on an input field
                            const pad = 30; // Increased padding for easier mobile tapping
                            const clickedInput = inputRects.find(r => 
                                coords.x >= (r.x - pad) && coords.x <= (r.x + r.w + pad) && 
                                coords.y >= (r.y - pad) && coords.y <= (r.y + r.h + pad)
                            );
                            if (clickedInput) {
                                setKeyboardInput(clickedInput.val || "");
                            } else {
                                setKeyboardInput("");
                            }
                         }}
                         onMouseMove={(e) => {
                            if (isAiLoading || !wsRef.current || e.buttons === 0) return; // only track drag
                            const coords = getCoords(e, e.currentTarget);
                            if (coords) wsRef.current.send(JSON.stringify({ type: 'mousemove', ...coords }));
                         }}
                         onWheel={(e) => {
                            if (isAiLoading || !wsRef.current) return;
                            wsRef.current.send(JSON.stringify({ type: 'wheel', deltaX: e.deltaX, deltaY: e.deltaY }));
                         }}
                       />
                       
                       {/* MOBILE / MANUAL KEYBOARD INPUT BAR */}
                       <div className="absolute bottom-0 left-0 right-0 p-3 bg-[#1C1C1E] border-t border-black/50 z-30 flex items-center justify-center gap-2 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
                           <div className="w-full max-w-lg bg-[#323639] border border-[#3A3A3C] rounded-xl flex items-center shadow-lg px-2 py-1 relative">
                               <div className="text-xs text-white/40 uppercase tracking-widest pl-2 pr-1 font-bold select-none cursor-default">KLAVYE</div>
                               <input 
                                   className="flex-1 bg-transparent text-white px-3 py-2.5 outline-none text-[16px] placeholder-white/30"
                                   placeholder="Tarayıcıya yazılacak metni girin..."
                                   value={keyboardInput}
                                   autoComplete="off"
                                   autoCorrect="off"
                                   spellCheck="false"
                                   onChange={(e) => {
                                       const newValue = e.target.value;
                                       const oldValue = keyboardInput;
                                       if (wsRef.current) {
                                           if (newValue.length < oldValue.length) {
                                               const diff = oldValue.length - newValue.length;
                                               for (let d = 0; d < diff; d++) {
                                                   wsRef.current.send(JSON.stringify({ type: 'keydown', key: 'Backspace' }));
                                               }
                                           } else if (newValue.length > oldValue.length) {
                                               const added = newValue.substring(oldValue.length);
                                               wsRef.current.send(JSON.stringify({ type: 'insertText', text: added }));
                                           }
                                       }
                                       setKeyboardInput(newValue);
                                   }}
                                   onKeyDown={(e) => {
                                       if (e.key === 'Enter') {
                                           wsRef.current?.send(JSON.stringify({ type: 'keydown', key: 'Enter' }));
                                           setKeyboardInput("");
                                           e.currentTarget.blur();
                                       }
                                   }}
                               />
                               <button 
                                   onClick={() => {
                                       wsRef.current?.send(JSON.stringify({ type: 'keydown', key: 'Enter' }));
                                       setKeyboardInput("");
                                   }}
                                   className="bg-[#8AB4F8]/10 hover:bg-[#8AB4F8]/20 text-[#8AB4F8] px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                               >
                                   Gönder
                               </button>
                           </div>
                       </div>
                       
                       </div>
                    ) : (
                       <div className="absolute inset-0 flex flex-col gap-3 items-center justify-center text-[#8E8E93]">
                         <div className="w-8 h-8 border-4 border-[#3A3A3C] border-t-[#0A84FF] rounded-full animate-spin"></div>
                         <div className="text-sm font-medium animate-pulse">Tarayıcı Motoru Başlatılıyor...</div>
                       </div>
                    )}
                 </div>
              </div>
          </div>

          {/* CHAT CONTAINER */}
          <div className={`absolute inset-0 flex flex-col transition-opacity duration-300 ease-in bg-white/70 backdrop-blur-3xl ${view === 'chat' ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none z-0'}`}>
              <div className="flex-1 overflow-y-auto p-4 lg:p-8 flex flex-col gap-6 w-full max-w-5xl mx-auto h-[calc(100vh-140px)]">
                {chatMessages.length === 0 ? (
                   <div className="flex-1 flex flex-col items-center justify-center text-center opacity-70 mt-10">
                      <GiOctopus className="w-12 h-12 mb-5 text-indigo-500" />
                      <h2 className="text-2xl font-bold mb-3 text-slate-800">Otobot AI'a Hoş Geldiniz</h2>
                   </div>
                ) : (
                   chatMessages.map(msg => (
                      <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                         <div className={`max-w-[88%] lg:max-w-[70%] rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-white shadow-md text-slate-700 border border-slate-200 rounded-bl-sm whitespace-pre-wrap font-sans'}`}>
                            {msg.role === 'assistant' && (
                              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100 text-[11px] font-bold text-indigo-500 font-sans tracking-wider">
                                <GiOctopus className="w-3.5 h-3.5" /> Otobot
                              </div>
                            )}
                            {msg.content}
                         </div>
                      </div>
                   ))
                )}
                {isAiLoading && (
                   <div className="flex justify-start w-full">
                     <div className="max-w-[85%] rounded-2xl px-5 py-4 text-sm bg-white shadow-md border border-slate-200 text-slate-500 animate-pulse flex items-center gap-3 rounded-bl-sm">
                        <div className="flex gap-1.5 pt-0.5">
                          <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                        <span className="ml-1 font-medium text-xs tracking-wide">Otobot düşünüyor...</span>
                     </div>
                   </div>
                )}
                <div ref={messagesEndRef} className="h-4 shrink-0" />
              </div>
              
              <div className="p-4 lg:p-6 w-full max-w-5xl mx-auto flex-shrink-0 bg-transparent z-20 absolute bottom-0 left-0 right-0">
                <div className="bg-white border border-slate-200 rounded-2xl p-2 flex items-end relative focus-within:border-slate-300 transition-colors shadow-2xl">
                   <textarea
                     value={aiPrompt}
                     onChange={e => setAiPrompt(e.target.value)}
                     onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                           e.preventDefault();
                           handleAiSubmit();
                        }
                     }}
                     disabled={isAiLoading}
                     placeholder="Otobot AI'a komut ver..."
                     className="w-full bg-transparent min-h-[50px] max-h-40 outline-none resize-none p-3 text-base text-slate-800 placeholder-slate-400 font-medium"
                   />
                   <button 
                     onClick={handleAiSubmit}
                     disabled={isAiLoading || !aiPrompt.trim()}
                     className="w-12 h-12 shrink-0 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl flex items-center justify-center transition-all active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 mb-0.5 mr-0.5"
                   >
                     <Send className="w-5 h-5 ml-1" />
                   </button>
                </div>
              </div>
          </div>
      </main>

    </div>
  );
}
