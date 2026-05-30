import { WebSocket } from 'ws';

async function run() {
  const ws = new WebSocket('ws://localhost:3000/api/browser/stream?sessionId=5105c16b-286f-4bcf-85d4-90a6155e7993');
  ws.on('open', () => {
    console.log("WS Opened");
  });
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log("Received msg:", msg.type);
    if (msg.type === 'screencastFrame') {
      console.log("Screencast works!");
      process.exit(0);
    }
  });
  ws.on('error', console.error);
  
  setTimeout(() => {
    console.log("Timeout waiting for message");
    process.exit(1);
  }, 10000);
}
run();
