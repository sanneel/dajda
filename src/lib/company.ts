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
  /** The registered entity, as it appears in the documents. */
  nameKa: string;
  /** The trading name the platform operates under. */
  tradeNameKa: string;
  legalId: string;
  addressKa: string;
  supportEmail: string;
  phone: string;
  domain: string;
} = data;
