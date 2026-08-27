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
 */
export const THEME_STORAGE_KEY = 'dajda-theme';

const SCRIPT = `(function(){var t='dark';try{if(localStorage.getItem('${THEME_STORAGE_KEY}')==='light'){t='light';}}catch(e){}document.documentElement.setAttribute('data-theme',t);})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
