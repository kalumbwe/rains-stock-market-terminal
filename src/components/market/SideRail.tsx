'use client';

/**
 * Right rail — desktop: stacked tabs Market | Portfolio | News | Alerts.
 * On mobile the same tab components are rendered through top-level
 * navigation in TerminalApp, so the rail only mounts on desktop.
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Bell, Newspaper, Wallet } from 'lucide-react';
import { MarketTab } from './MarketTab';
import { PortfolioTab } from './PortfolioTab';
import { AlertsTab } from './AlertsTab';
import { NewsTab } from './NewsTab';
import type { AlertCondition, PriceAlert, PortfolioResponse } from '@/lib/market/types';

interface SideRailProps {
  alerts: PriceAlert[];
  alertsLoading: boolean;
  alertsError: boolean;
  onCreateAlert: (args: {
    symbol: string;
    condition: AlertCondition;
    targetPrice: number;
  }) => Promise<boolean>;
  onDeleteAlert: (id: string) => Promise<void>;
  portfolio: PortfolioResponse | null;
  portfolioLoading: boolean;
  onSell: (symbol: string) => void;
  onReset: () => Promise<boolean>;
}

export function SideRail(props: SideRailProps) {
  const [tab, setTab] = useState('market');

  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
      className="h-full min-h-0 gap-0"
    >
      <TabsList className="h-9 w-full shrink-0 bg-zinc-900/80 ring-1 ring-zinc-800">
        <TabsTrigger
          value="market"
          aria-label="Market overview tab"
          className="h-8 flex-1 gap-1 text-xs data-[state=active]:bg-orange-500/15 data-[state=active]:text-orange-400"
        >
          <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden xl:inline">Market</span>
        </TabsTrigger>
        <TabsTrigger
          value="portfolio"
          aria-label="Portfolio tab"
          className="h-8 flex-1 gap-1 text-xs data-[state=active]:bg-orange-500/15 data-[state=active]:text-orange-400"
        >
          <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden xl:inline">Portfolio</span>
        </TabsTrigger>
        <TabsTrigger
          value="news"
          aria-label="News tab"
          className="h-8 flex-1 gap-1 text-xs data-[state=active]:bg-orange-500/15 data-[state=active]:text-orange-400"
        >
          <Newspaper className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden xl:inline">News</span>
        </TabsTrigger>
        <TabsTrigger
          value="alerts"
          aria-label="Alerts tab"
          className="h-8 flex-1 gap-1 text-xs data-[state=active]:bg-orange-500/15 data-[state=active]:text-orange-400"
        >
          <Bell className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden xl:inline">Alerts</span>
        </TabsTrigger>
      </TabsList>

      <div className="luse-scroll mt-2 min-h-0 flex-1 overflow-y-auto pb-1 pr-0.5">
        <AnimatePresence initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <TabsContent value="market" className="mt-0">
              <MarketTab />
            </TabsContent>
            <TabsContent value="portfolio" className="mt-0">
              <PortfolioTab
                portfolio={props.portfolio}
                loading={props.portfolioLoading}
                onSell={props.onSell}
                onReset={props.onReset}
              />
            </TabsContent>
            <TabsContent value="news" className="mt-0">
              <NewsTab />
            </TabsContent>
            <TabsContent value="alerts" className="mt-0">
              <AlertsTab
                alerts={props.alerts}
                loading={props.alertsLoading}
                error={props.alertsError}
                onCreate={props.onCreateAlert}
                onDelete={props.onDeleteAlert}
              />
            </TabsContent>
          </motion.div>
        </AnimatePresence>
      </div>
    </Tabs>
  );
}
