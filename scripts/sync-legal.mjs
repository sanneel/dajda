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
  '{{COMPANY_NAME}}': company.nameKa,
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
  const lines = raw.split('\n');

  let title = '';
  let updated = '';
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
    if (line.startsWith('# ') && !title) {
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

  return { title, updated, sections };
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
    ([name, doc]) =>
      `export const ${name}: LegalDoc = ${JSON.stringify(doc, null, 2)};`,
  )
  .join('\n\n');

writeFileSync('src/lib/legal/generated.ts', `${banner}\n${body}\n`);
console.log(
  'generated',
  Object.entries(documents)
    .map(([name, doc]) => `${name}(${doc.sections.length} sections)`)
    .join(', '),
);
