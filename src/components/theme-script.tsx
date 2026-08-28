import { headers } from 'next/headers';
import { THEME_STORAGE_KEY } from '@/lib/theme';

/**
 * Applies the saved theme before the first paint.
 *
 * This has to be a blocking inline script in <head>. The theme lives in
 * localStorage, which the server cannot read, so anything that runs after
 * hydration would let the page paint in the wrong theme first and then snap.
 * A dozen bytes of render-blocking script is the accepted price for that.
 *
 * Dark is the product's default, not a guess about the reader's operating
 * system: anything other than an explicitly chosen "light" stamps dark. The
 * attribute is deliberately NOT rendered from JSX - React would re-apply the
 * server value on hydration and overwrite what this script or the toggle
 * wrote. The stylesheet's own no-attribute fallback is also dark, so even a
 * no-JS visitor gets the intended look.
 *
 * THE NONCE IS NOT OPTIONAL. src/proxy.ts sends a per-request CSP whose
 * script-src carries a nonce, and a nonce in the list makes the browser
 * ignore 'unsafe-inline' entirely - so without this attribute the browser
 * refuses to run the script and the one job it exists to do, painting the
 * right theme first, silently stops happening.
 */
const SCRIPT = `(function(){var t='dark';try{if(localStorage.getItem('${THEME_STORAGE_KEY}')==='light'){t='light';}}catch(e){}document.documentElement.setAttribute('data-theme',t);})();`;

export async function ThemeScript() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
