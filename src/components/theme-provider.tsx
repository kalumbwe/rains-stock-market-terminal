'use client';

/**
 * Theme provider — next-themes with a class strategy over three skins:
 *   dark  — canonical zinc-950 terminal
 *   light — Daylight remap (globals.css .light)
 *   oled  — pure-black variant of dark (globals.css .oled)
 * Managed on <html> so Radix portals inherit it.
 */

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      themes={['dark', 'light', 'oled']}
      enableSystem={false}
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
