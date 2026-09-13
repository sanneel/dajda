import { permanentRedirect } from 'next/navigation';

/** Settings is now the preferences tab of the account hub. */
export default function SettingsRedirect(): never {
  permanentRedirect('/account?tab=preferences');
}
