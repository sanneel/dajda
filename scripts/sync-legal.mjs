/**
 * Generates src/lib/legal/generated.ts from docs/legal/*.md.
 *
 * The markdown is the single source of truth - it is what a lawyer edits and
 * what gets exported as a PDF for the payment provider - and the site renders
 * this generated module, so the page and the document cannot drift apart.
 * Company requisites live once in src/lib/company.json and are substituted
 * into {{TOKENS}} here.
 *
 * Run after editing any document:  npm run legal:sync
 */
import { readFileSync, writeFileSync } from 'node:fs';

const company = JSON.parse(readFileSync('src/lib/company.json', 'utf8'));

const TOKENS = {
  '{{COMPANY_NAME}}': `${company.nameKa} (სავაჭრო სახელწოდება „${company.tradeNameKa}")`,
  '{{COMPANY_SHORT}}': company.nameKa,
  '{{COMPANY_ID}}': company.legalId,
  '{{COMPANY_ADDRESS}}': company.addressKa,
  '{{SUPPORT_EMAIL}}': company.supportEmail,
  '{{CONTACT_PHONE}}': company.phone,
};

function substitute(text) {
  return Object.entries(TOKENS).reduce(
    (out, [token, value]) => out.replaceAll(token, value),
    text,
  );
}

function parse(path) {
  const raw = substitute(readFileSync(path, 'utf8'));
  /*
   * Normalise line endings before splitting. These files are edited on
   * Windows, so a CRLF source left a literal carriage return at the end of
   * every paragraph in the generated data - an invisible control character
   * sitting inside legal text that the page then rendered.
   */
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');

  let title = '';
  let updated = '';
  /*
   * Which billing the document describes. It is a marker rather than prose
   * because a deploy has to be able to check it: see SUBSCRIPTION_RECURRING
   * in src/lib/env.ts, which refuses to boot when the terms on the site
   * describe one billing and the checkout performs the other.
   */
  let billingMode = null;
  const sections = [];
  let current = null;
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length && current) {
      // Markdown bold is presentation, not content, on the site.
      current.paragraphs.push(paragraph.join('\n').replaceAll('**', ''));
    }
    paragraph = [];
  };

  for (const line of lines) {
    const billing = line.match(/^<!--\s*billing-mode:\s*(oneoff|recurring)\s*-->$/);
    if (billing) {
      billingMode = billing[1];
    } else if (line.startsWith('# ') && !title) {
      title = line.slice(2).trim();
    } else if (line.startsWith('ბოლო განახლება:')) {
      updated = line.replace('ბოლო განახლება:', '').trim();
    } else if (line.startsWith('## ')) {
      flushParagraph();
      current = { title: line.slice(3).trim(), paragraphs: [] };
      sections.push(current);
    } else if (line.trim() === '') {
      flushParagraph();
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();

  return { title, updated, sections, billingMode };
}

const documents = {
  TERMS: parse('docs/legal/terms.md'),
  PRIVACY: parse('docs/legal/privacy.md'),
  RESPONSIBLE_USE: parse('docs/legal/responsible-use.md'),
};

const banner = `/**
 * GENERATED FILE - do not edit by hand.
 *
 * Source of truth: docs/legal/*.md plus src/lib/company.json.
 * Regenerate with:  npm run legal:sync
 */

export type LegalSection = { title: string; paragraphs: string[] };
export type LegalDoc = { title: string; updated: string; sections: LegalSection[] };
`;

const body = Object.entries(documents)
  .map(
    ([name, { billingMode: _ignored, ...doc }]) =>
      `export const ${name}: LegalDoc = ${JSON.stringify(doc, null, 2)};`,
  )
  .join('\n\n');

writeFileSync('src/lib/legal/generated.ts', `${banner}\n${body}\n`);

/*
 * The billing marker goes in a module of its own, not beside the documents:
 * the environment guard imports it at boot, and it should not have to pull
 * every word of the terms into that bundle to read one string.
 */
if (documents.TERMS.billingMode === null) {
  throw new Error(
    'docs/legal/terms.md has no <!-- billing-mode: oneoff|recurring --> marker',
  );
}
writeFileSync(
  'src/lib/legal/billing-mode.generated.ts',
  `/**
 * GENERATED FILE - do not edit by hand.
 *
 * Which billing docs/legal/terms.md describes. Regenerate with:
 *   npm run legal:sync
 */

export type BillingMode = 'oneoff' | 'recurring';

export const TERMS_BILLING_MODE: BillingMode = '${documents.TERMS.billingMode}';
`,
);
console.log(
  'generated',
  Object.entries(documents)
    .map(([name, doc]) => `${name}(${doc.sections.length} sections)`)
    .join(', '),
);
