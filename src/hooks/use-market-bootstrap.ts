'use client';

/**
 * REST bootstrap — initial snapshot fallback (if the socket is slow or the
 * engine briefly down), initial news load + 60s news refresh, and engine
 * availability state surfaced as a dismissible banner + retry.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMarketStore } from '@/lib/market/store';
import type { NewsItem, Snapshot } from '@/lib/market/types';

const NEWS_REFRESH_MS = 60_000;

export interface BootstrapState {
  /** True when /api/stocks returned 503 (engine unreachable via Next API). */
  engineDown: boolean;
  /** True after the first successful snapshot (REST or socket). */
  hydrated: boolean;
  dismissBanner: () => void;
  retry: () => void;
}

export function useMarketBootstrap(): BootstrapState {
  const [engineDown, setEngineDown] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const aliveRef = useRef(true);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch('/api/stocks', { cache: 'no-store' });
      if (res.status === 503) {
        if (aliveRef.current) {
          setEngineDown(true);
          setHydrated(useMarketStore.getState().stockOrder.length > 0);
        }
        return;
      }
      if (!res.ok) throw new Error(`stocks ${res.status}`);
      const snap = (await res.json()) as Snapshot;
      if (!aliveRef.current) return;
      useMarketStore.getState().applySnapshot(snap);
      setEngineDown(false);
      setHydrated(true);
    } catch {
      if (aliveRef.current) {
        setEngineDown(true);
        setHydrated(useMarketStore.getState().stockOrder.length > 0);
      }
    }
  }, []);

  const fetchNews = useCallback(async () => {
    try {
      const res = await fetch('/api/news?limit=30', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { news: NewsItem[] };
      if (aliveRef.current && Array.isArray(data.news)) {
        useMarketStore.getState().setNews(data.news);
      }
    } catch {
      // news is non-critical; ignore transient failures
    }
  }, []);

  // Initial bootstrap (REST fallback for the socket snapshot).
  useEffect(() => {
    aliveRef.current = true;
    fetchSnapshot();
    fetchNews();
    // While the store is still empty, keep retrying REST every 8s so the
    // terminal recovers automatically after an engine restart.
    const retryTimer = setInterval(() => {
      if (useMarketStore.getState().stockOrder.length === 0) fetchSnapshot();
    }, 8000);

    const newsTimer = setInterval(fetchNews, NEWS_REFRESH_MS);

    return () => {
      aliveRef.current = false;
      clearInterval(retryTimer);
      clearInterval(newsTimer);
    };
  }, [fetchSnapshot, fetchNews]);

  // Auto-clear the banner once a snapshot arrives through any channel.
  useEffect(() => {
    const unsub = useMarketStore.subscribe((state) => {
      if (state.stockOrder.length > 0) {
        setHydrated(true);
        setEngineDown(false);
      }
    });
    return unsub;
  }, []);

  const retry = useCallback(() => {
    setBannerDismissed(false);
    fetchSnapshot();
    fetchNews();
  }, [fetchSnapshot, fetchNews]);

  return {
    engineDown: engineDown && !bannerDismissed,
    hydrated,
    dismissBanner: () => setBannerDismissed(true),
    retry,
  };
}
