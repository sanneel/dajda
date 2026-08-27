'use client';

import { useLayoutEffect } from 'react';
import { THEME_STORAGE_KEY } from './theme-script';

/**
 * Re-applies the theme after hydration.
 *
 * The boot script stamps data-theme on <html> before first paint, but React
 * 19 reconciles the root element's attributes during hydration and removes
 * ones its JSX never rendered - including that stamp. Rendering the attribute
 * from JSX is not the fix, because then React re-applies the server's value
 * over every later change the toggle makes.
 *
 * So the attribute stays script-owned, and this component - mounted once in
 * the root layout - puts it back the moment hydration finishes, in a layout
 * effect so it lands before the browser paints the reconciled frame. The CSS
 * default for an unstamped page is dark, the same as the default stamp, so
 * the only reader who could glimpse the wrong theme for a frame is one who
 * chose light.
 *
 * The storage listener keeps a background tab in step when the theme is
 * switched in another one.
 */

function apply() {
  let theme = 'dark';
  try {
    if (localStorage.getItem(THEME_STORAGE_KEY) === 'light') theme = 'light';
  } catch {
    // Unreadable storage means the default, which is already `dark`.
  }
  const root = document.documentElement;
  if (root.getAttribute('data-theme') !== theme) {
    root.setAttribute('data-theme', theme);
  }

  // The browser chrome follows the page's ground. Read from the live token
  // rather than a copied hex, so a palette change cannot leave it behind.
  const canvas = getComputedStyle(root)
    .getPropertyValue('--color-canvas')
    .trim();
  if (canvas) {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', canvas);
  }
}

export function ThemeApplier() {
  useLayoutEffect(() => {
    apply();
    window.addEventListener('storage', apply);
    return () => window.removeEventListener('storage', apply);
  }, []);

  return null;
}
