import { useRef, useState, useEffect, useCallback } from 'react';
import { WS_URL } from '../config/constants.js';

// ============ WEBSOCKET HOOK ============
export function useWebSocket(token, onMessage) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  const reconnectTimeoutRef = useRef(null);
  const pingIntervalRef = useRef(null);

  // Keep onMessage ref updated without triggering reconnection
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!token) return;

    let intentionallyClosed = false;

    const connect = () => {
      console.log('🔌 Connecting to WebSocket...');
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket connected');
        ws.send(JSON.stringify({ type: 'auth', token }));

        // Start heartbeat ping every 30 seconds to keep connection alive
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Log ALL message types for debugging (except call_audio which spams)
          if (data.type && data.type !== 'call_audio' && data.type !== 'pong') {
            console.log(`🔌 [WS] Received: ${data.type}`, data);
          }

          if (data.type === 'auth_success') {
            setConnected(true);
            console.log('✅ WebSocket authenticated');
          } else if (data.type === 'auth_error') {
            setConnected(false);
            console.error('❌ WebSocket auth failed');
          } else if (data.type === 'pong') {
            // Heartbeat response, ignore
          } else {
            onMessageRef.current?.(data);
          }
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };

      ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        setConnected(false);
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
        }

        // Auto-reconnect after 3 seconds unless intentionally closed
        if (!intentionallyClosed) {
          console.log('🔄 Reconnecting in 3 seconds...');
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setConnected(false);
      };
    };

    connect();

    return () => {
      intentionallyClosed = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [token]);

  const sendMessage = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('🔌 [WS] Sending message:', message.type);
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.error('🔌 [WS] Cannot send - WebSocket not open:', {
        hasWs: !!wsRef.current,
        readyState: wsRef.current?.readyState,
        messageType: message.type
      });
    }
  }, []);

  return { connected, sendMessage };
}
