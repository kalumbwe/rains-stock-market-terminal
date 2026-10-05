'use client';

/**
 * Live market socket — connects the browser to the market engine
 * (mini-service on port 3003) through the Caddy gateway.
 *
 * URL rules: NEVER a port or absolute URL in client code — the gateway
 * port travels in the `XTransformPort` query param and the socket path
 * is always "/".
 *
 * Events (see shared/api-contract.md §2):
 *  - snapshot → hydrate the store
 *  - tick     → merge live quote fields, flash + price buffers, index history
 *  - news     → prepend headline
 */

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useMarketStore } from '@/lib/market/store';
import type { NewsItem, Snapshot, TickPayload } from '@/lib/market/types';

export function useMarketSocket() {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      useMarketStore.getState().setConnected(true);
    });

    socket.on('disconnect', () => {
      useMarketStore.getState().setConnected(false);
    });

    socket.on('connect_error', () => {
      useMarketStore.getState().setConnected(false);
    });

    socket.on('snapshot', (snap: Snapshot) => {
      useMarketStore.getState().applySnapshot(snap);
      useMarketStore.getState().setConnected(true);
    });

    socket.on('tick', (tick: TickPayload) => {
      useMarketStore.getState().applyTick(tick);
    });

    socket.on('news', (item: NewsItem) => {
      useMarketStore.getState().prependNews(item);
    });

    // Safety: if the socket is still silent after 6s, the bootstrap
    // REST hook provides the snapshot — nothing to do here.

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      // Keep last-known market data; just mark the link down.
      useMarketStore.getState().setConnected(false);
    };
  }, []);

  return socketRef;
}
