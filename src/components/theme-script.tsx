/**
 * Applies the saved theme before the first paint.
 *
 * This has to be a blocking inline script in <head>. The theme lives in
 * localStorage, which the server cannot read, so anything that runs after
 * hydration would let the page paint in the wrong theme first and then snap.
 * A dozen bytes of render-blocking script is the accepted price for that.
 *
 * No stored choice means no attribute, which leaves the CSS media query in
 * charge: the site follows the operating system until the reader says
 * otherwise, and "follow the system" stays a real third state rather than
 * being silently collapsed into light.
 */
export const THEME_STORAGE_KEY = 'dajda-theme';

const SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
