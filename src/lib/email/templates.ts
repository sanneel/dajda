/**
 * The messages this app sends, written once, in Georgian, as plain text.
 *
 * Each template takes fully-resolved values (absolute links included) and
 * returns subject + body; nothing here reads the environment or the database,
 * which keeps every template a pure function a test can snapshot.
 */

export type EmailContent = {
  subject: string;
  text: string;
};

const SIGNATURE = '— DAJDA · dajda.ge';

export function verificationEmail(link: string): EmailContent {
  return {
    subject: 'დაადასტურეთ ელფოსტა — DAJDA',
    text: [
      'გამარჯობა,',
      '',
      'ამ მისამართით DAJDA-ზე ანგარიშის რეგისტრაცია მოხდა. დასადასტურებლად გადადით ბმულზე:',
      '',
      link,
      '',
      'ბმული მოქმედებს 24 საათი. თუ ეს თქვენ არ ყოფილხართ, უბრალოდ არ მიაქციოთ წერილს ყურადღება.',
      '',
      SIGNATURE,
    ].join('\n'),
  };
}

export function passwordResetEmail(link: string): EmailContent {
  return {
    subject: 'პაროლის აღდგენა — DAJDA',
    text: [
      'გამარჯობა,',
      '',
      'მოთხოვნილია პაროლის აღდგენა. ახალი პაროლის დასაყენებლად გადადით ბმულზე:',
      '',
      link,
      '',
      'ბმული მოქმედებს 1 საათი. თუ პაროლის აღდგენა თქვენ არ მოგითხოვიათ, წერილი უგულებელყავით — პაროლი უცვლელი რჩება.',
      '',
      SIGNATURE,
    ].join('\n'),
  };
}

/** A queued notification, rendered for email with its absolute link. */
export function notificationEmail(
  subjectKa: string,
  bodyKa: string,
  link: string | null,
): EmailContent {
  return {
    subject: `${subjectKa} — DAJDA`,
    text: [bodyKa, ...(link ? ['', link] : []), '', SIGNATURE].join('\n'),
  };
}
