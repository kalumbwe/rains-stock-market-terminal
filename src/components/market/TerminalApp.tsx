'use client';

/**
 * TerminalApp — root client composition.
 * Desktop: 3-column grid (stocks list | detail | side rail).
 * Mobile (<lg): top-level tabs Market / Terminal / Portfolio / News / Alerts.
 * Owns the single socket/bootstrap/portfolio/alert-engine instances and the
 * trade dialog.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CandlestickChart,
  Newspaper,
  RotateCw,
  Wallet,
  X,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { useMarketSocket } from '@/hooks/use-market-socket';
import { useMarketBootstrap } from '@/hooks/use-market-bootstrap';
import { usePortfolio } from '@/hooks/use-portfolio';
import { useAlertEngine } from '@/hooks/use-alert-engine';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useMarketStore } from '@/lib/market/store';
import { Header } from './Header';
import { TickerTape } from './TickerTape';
import { StocksList } from './StocksList';
import { StockDetail } from './StockDetail';
import { SideRail } from './SideRail';
import { MarketTab } from './MarketTab';
import { PortfolioTab } from './PortfolioTab';
import { AlertsTab } from './AlertsTab';
import { NewsTab } from './NewsTab';
import { ScreenerDialog } from './ScreenerDialog';
import { CompareDialog } from './CompareDialog';
import { ShortcutsDialog } from './ShortcutsDialog';
import { TradeDialog, type TradeSide } from './TradeDialog';
import { Footer } from './Footer';

type MobileTab = 'market' | 'terminal' | 'portfolio' | 'news' | 'alerts';

export function TerminalApp() {
  // Dark terminal theme (shadcn vars) — applied on <html> so portals inherit it.
  useEffect(() => {
    document.documentElement.classList.add('dark');
    return () => document.documentElement.classList.remove('dark');
  }, []);

  useMarketSocket();
  const bootstrap = useMarketBootstrap();
  const portfolio = usePortfolio();
  const alerts = useAlertEngine();

  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState<MobileTab>('market');
  const selectedSymbol = useMarketStore((s) => s.selectedSymbol);

  // On mobile, following a selection (list row, tape, news chip) jumps to the terminal.
  useEffect(() => {
    return useMarketStore.subscribe((state, prev) => {
      if (state.selectedSymbol !== prev.selectedSymbol && isMobile) {
        setMobileTab('terminal');
      }
    });
  }, [isMobile]);

  // Trade dialog state
  const [trade, setTrade] = useState<{ open: boolean; symbol: string; side: TradeSide }>({
    open: false,
    symbol: 'ZANACO',
    side: 'BUY',
  });

  // Market screener dialog
  const [screenerOpen, setScreenerOpen] = useState(false);

  // Keyboard-shortcuts help dialog
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Compare dialog
  const [compareOpen, setCompareOpen] = useState(false);

  const openTrade = useCallback((symbol: string, side: TradeSide) => {
    setTrade({ open: true, symbol, side });
  }, []);

  // Global keyboard shortcuts: / search · ↑↓ navigate · B buy · S sell · P screener · C compare · ? help.
  const openScreener = useCallback(() => setScreenerOpen(true), []);
  const openCompare = useCallback(() => setCompareOpen(true), []);
  const openShortcuts = useCallback(() => setShortcutsOpen((v) => !v), []);
  useKeyboardShortcuts(openTrade, openScreener, openCompare, openShortcuts);

  const toggleNotifications = useCallback(() => {
    if (alerts.notifyEnabled) alerts.disableNotifications();
    else void alerts.enableNotifications();
  }, [alerts]);

  const toggleSound = useCallback(() => {
    if (alerts.soundEnabled) alerts.disableSound();
    else alerts.enableSound();
  }, [alerts]);

  const handleTradeSubmit = useCallback(
    async (args: { symbol: string; side: TradeSide; quantity: number }) =>
      portfolio.submitTrade(args, useMarketStore.getState().stocks[args.symbol]?.price ?? null),
    [portfolio]
  );

  const positionQty = trade.symbol
    ? portfolio.portfolio?.positions.find((p) => p.symbol === trade.symbol)?.quantity ?? null
    : null;

  // Live price for the dialog (subscribed so it ticks while open).
  const tradePrice = useMarketStore((s) =>
    trade.open ? s.stocks[trade.symbol]?.price ?? null : null
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0b] text-zinc-100">
      <Header onOpenScreener={() => setScreenerOpen(true)} onOpenCompare={() => setCompareOpen(true)} />
      <TickerTape />

      {/* Engine-down banner */}
      <AnimatePresence>
        {bootstrap.engineDown && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
            role="alert"
          >
            <div className="mx-auto mt-2 flex w-[calc(100%-2rem)] max-w-[1800px] items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
              <p className="flex-1 text-sm text-amber-200">
                Market engine reconnecting… live prices may be stale.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={bootstrap.retry}
                className="h-8 shrink-0 border-amber-500/40 bg-transparent text-amber-300 hover:bg-amber-500/15 hover:text-amber-200"
                aria-label="Retry connection to market engine"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                Retry
              </Button>
              <button
                type="button"
                onClick={bootstrap.dismissBanner}
                aria-label="Dismiss banner"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-amber-500/70 hover:bg-amber-500/10 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="mx-auto w-full max-w-[1800px] flex-1 px-3 pb-6 pt-3 sm:px-6">
        {isMobile ? (
          <Tabs
            value={mobileTab}
            onValueChange={(v) => setMobileTab(v as MobileTab)}
            className="gap-3"
          >
            <TabsList className="h-11 w-full justify-between bg-zinc-900/80 p-1 ring-1 ring-zinc-800">
              <MobileTabTrigger value="market" label="Market" icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />} />
              <MobileTabTrigger value="terminal" label="Terminal" icon={<CandlestickChart className="h-4 w-4" aria-hidden="true" />} />
              <MobileTabTrigger value="portfolio" label="Portfolio" icon={<Wallet className="h-4 w-4" aria-hidden="true" />} />
              <MobileTabTrigger value="news" label="News" icon={<Newspaper className="h-4 w-4" aria-hidden="true" />} />
              <MobileTabTrigger value="alerts" label="Alerts" icon={<Bell className="h-4 w-4" aria-hidden="true" />} />
            </TabsList>

            <TabsContent value="market" className="mt-0 space-y-3">
              <div className="h-[62vh]">
                <StocksList />
              </div>
              <MarketTab />
            </TabsContent>
            <TabsContent value="terminal" className="mt-0">
              <StockDetail symbol={selectedSymbol} onTrade={openTrade} />
            </TabsContent>
            <TabsContent value="portfolio" className="mt-0">
              <PortfolioTab
                portfolio={portfolio.portfolio}
                loading={portfolio.loading}
                onSell={(symbol) => openTrade(symbol, 'SELL')}
                onReset={portfolio.resetAccount}
              />
            </TabsContent>
            <TabsContent value="news" className="mt-0">
              <NewsTab />
            </TabsContent>
            <TabsContent value="alerts" className="mt-0">
              <AlertsTab
                alerts={alerts.alerts}
                loading={alerts.loading}
                error={alerts.error}
                notifyEnabled={alerts.notifyEnabled}
                onToggleNotifications={toggleNotifications}
                soundEnabled={alerts.soundEnabled}
                onToggleSound={toggleSound}
                onCreate={alerts.createAlert}
                onDelete={alerts.removeAlert}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="grid grid-cols-[minmax(0,320px)_minmax(0,1fr)_minmax(0,340px)] items-start gap-3">
            <div className="lg:sticky lg:top-[73px] lg:h-[calc(100vh-97px)] lg:flex lg:flex-col lg:overflow-hidden">
              <StocksList />
            </div>
            <StockDetail symbol={selectedSymbol} onTrade={openTrade} />
            <aside
              className="lg:sticky lg:top-[73px] lg:h-[calc(100vh-97px)] lg:flex lg:flex-col lg:overflow-hidden"
              aria-label="Market side rail"
            >
              <SideRail
                alerts={alerts.alerts}
                alertsLoading={alerts.loading}
                alertsError={alerts.error}
                notifyEnabled={alerts.notifyEnabled}
                onToggleNotifications={toggleNotifications}
                soundEnabled={alerts.soundEnabled}
                onToggleSound={toggleSound}
                onCreateAlert={alerts.createAlert}
                onDeleteAlert={alerts.removeAlert}
                portfolio={portfolio.portfolio}
                portfolioLoading={portfolio.loading}
                onSell={(symbol) => openTrade(symbol, 'SELL')}
                onReset={portfolio.resetAccount}
              />
            </aside>
          </div>
        )}
      </main>

      <Footer onOpenShortcuts={openShortcuts} />

      <TradeDialog
        key={`${trade.open}-${trade.symbol}-${trade.side}`}
        open={trade.open}
        onOpenChange={(open) => setTrade((t) => ({ ...t, open }))}
        symbol={trade.symbol}
        price={tradePrice}
        initialSide={trade.side}
        cash={portfolio.portfolio?.cash ?? null}
        positionQty={positionQty}
        onSubmit={handleTradeSubmit}
      />

      <ScreenerDialog open={screenerOpen} onOpenChange={setScreenerOpen} />
      <CompareDialog open={compareOpen} onOpenChange={setCompareOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}

function MobileTabTrigger({
  value,
  label,
  icon,
}: {
  value: string;
  label: string;
  icon: ReactNode;
}) {
  return (
    <TabsTrigger
      value={value}
      className="h-9 min-h-[44px] flex-1 flex-col gap-0.5 rounded-md px-1 text-[10px] font-medium text-zinc-400 data-[state=active]:bg-orange-500/15 data-[state=active]:text-orange-400"
    >
      {icon}
      {label}
    </TabsTrigger>
  );
}
