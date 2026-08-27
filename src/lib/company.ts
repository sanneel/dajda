import data from './company.json';

/**
 * The company's requisites, once.
 *
 * Every place that names the legal entity - the terms, the privacy policy,
 * the contact page, the footer - reads from here, so registering the company
 * or moving office is one edit and the documents cannot disagree about who
 * they bind. Bracketed values are the ones still waiting on the real
 * registration data; they are deliberately visible rather than invented.
 */
export const COMPANY: {
  nameKa: string;
  legalId: string;
  addressKa: string;
  supportEmail: string;
  phone: string;
  domain: string;
} = data;

/** True while any requisite is still a bracketed placeholder. */
export const COMPANY_INCOMPLETE = Object.values(data).some((value) =>
  value.startsWith('['),
);
