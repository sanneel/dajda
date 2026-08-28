/**
 * The one HTML wrapper every DAJDA email uses.
 *
 * One template rather than one per message, because what varies between a
 * verification mail and a settlement notice is a heading, a few paragraphs
 * and at most one button - and a second layout would be a second thing to
 * keep in step with the brand.
 *
 * Email HTML is written to the medium's rules, which are not the web's:
 * tables for layout and every style inline, because major clients strip
 * <style> blocks and ignore most of CSS; no remote images, because clients
 * block them by default and the wordmark works as styled text; light
 * palette only, taken from the site's own light tokens, because client
 * "dark modes" recolour mail unpredictably and a light base degrades the
 * least badly.
 *
 * The HTML part is presentation ONLY. Every message still carries the full
 * plain-text part: multipart mail scores better with spam filters, text-only
 * clients keep working, and the text is what tests assert on.
 */

/** The site's light palette, inlined - mail cannot read the stylesheet. */
const C = {
  canvas: '#e9eef4',
  surface: '#f7fafc',
  ink: '#0a2842',
  inkMuted: '#4d5f70',
  line: '#adbccd',
  accent: '#25507d',
  onAccent: '#ffffff',
} as const;

const FONT =
  "-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Noto Sans Georgian',sans-serif";

/** Minimal escaping - everything interpolated below passes through this. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export type EmailHtmlOptions = {
  /** Card heading, e.g. "ელფოსტის დადასტურება". */
  heading: string;
  /** Body paragraphs, plain text - escaped here. */
  paragraphs: string[];
  /** Optional single action button, with the raw URL repeated beneath it. */
  cta?: { label: string; url: string };
  /** Small print under the card, e.g. how to turn notifications off. */
  footerLines?: string[];
};

export function renderEmailHtml(options: EmailHtmlOptions): string {
  const preheader = escapeHtml(options.paragraphs[0] ?? '');

  const paragraphs = options.paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.ink};">${escapeHtml(text)}</p>`,
    )
    .join('\n');

  /*
   * The raw URL is repeated under the button on purpose: corporate filters
   * rewrite or strip button links, and a verification mail whose only link
   * died in transit locks the person out. Text they can copy cannot die.
   */
  const cta = options.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;">
        <tr><td style="border-radius:8px;background:${C.accent};">
          <a href="${escapeHtml(options.cta.url)}" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:${C.onAccent};text-decoration:none;border-radius:8px;">${escapeHtml(options.cta.label)}</a>
        </td></tr>
      </table>
      <p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.inkMuted};word-break:break-all;">
        თუ ღილაკი არ მუშაობს, გახსენით ეს ბმული:<br>
        <a href="${escapeHtml(options.cta.url)}" style="color:${C.accent};">${escapeHtml(options.cta.url)}</a>
      </p>`
    : '';

  const footer = (options.footerLines ?? [])
    .map(
      (line) =>
        `<p style="margin:0 0 4px;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.inkMuted};">${escapeHtml(line)}</p>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="ka">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(options.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${C.canvas};">
<!-- Inbox preview text; invisible in the opened mail. -->
<div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
    <tr><td style="padding:0 4px 16px;">
      <span style="font-family:${FONT};font-size:22px;font-weight:800;font-style:italic;letter-spacing:-0.02em;color:${C.ink};">DA<span style="color:${C.accent};">J</span>DA</span>
    </td></tr>
    <tr><td style="background:${C.surface};border:1px solid ${C.line};border-radius:12px;padding:28px;">
      <h1 style="margin:0 0 16px;font-family:${FONT};font-size:19px;line-height:1.35;color:${C.ink};">${escapeHtml(options.heading)}</h1>
      ${paragraphs}
      ${cta}
    </td></tr>
    <tr><td style="padding:16px 4px 0;">
      <p style="margin:0 0 4px;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.inkMuted};">DAJDA · dajda.ge · სპორტული ანალიზი, გამჭვირვალე ჩანაწერით.</p>
      ${footer}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
