import { WebSocketServer } from 'ws';
import type { Server } from 'http';
import { log } from './vite';

class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, any>();

  setup(server: Server) {
    this.wss = new WebSocketServer({ server });
    
    this.wss.on('connection', (ws: any, req) => {
      const clientId = Math.random().toString(36).substring(2);
      this.clients.set(clientId, ws);
      
      log(`WebSocket client connected: ${clientId}`, "websocket");
      
      ws.on('message', (data: any) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'subscribe' && message.documentId) {
            ws.documentId = message.documentId;
            log(`Client ${clientId} subscribed to document ${message.documentId}`, "websocket");
          }
        } catch (error) {
          log(`Error parsing WebSocket message: ${error}`, "websocket");
        }
      });
      
      ws.on('close', () => {
        this.clients.delete(clientId);
        log(`WebSocket client disconnected: ${clientId}`, "websocket");
      });
      
      ws.on('error', (error) => {
        log(`WebSocket error for client ${clientId}: ${error}`, "websocket");
        this.clients.delete(clientId);
      });
    });
    
    log("WebSocket server initialized", "websocket");
  }
  
  broadcastProgress(documentId: number, progress: any) {
    if (!this.wss) return;
    
    const message = JSON.stringify({
      type: 'progress',
      documentId,
      ...progress
    });
    
    this.wss.clients.forEach((client: any) => {
      if (client.readyState === 1 && client.documentId === documentId) {
        client.send(message);
      }
    });
  }
  
  broadcastCompletion(documentId: number, result: any) {
    if (!this.wss) return;
    
    const message = JSON.stringify({
      type: 'completed',
      documentId,
      ...result
    });
    
    this.wss.clients.forEach((client: any) => {
      if (client.readyState === 1 && client.documentId === documentId) {
        client.send(message);
      }
    });
  }
}

export const wsManager = new WebSocketManager();