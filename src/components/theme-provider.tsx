'use client';

/**
 * Theme provider — next-themes with a two-state class strategy.
 * "dark" is the canonical terminal skin; "light" is the Daylight remap
 * defined in globals.css. Managed on <html> so Radix portals inherit it.
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
      enableSystem={false}
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
