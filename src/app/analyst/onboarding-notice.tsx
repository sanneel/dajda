import { acknowledgeOnboardingAction } from '@/actions/analyst';
import { ActionButton } from '@/components/admin/action-button';
import { Card, CardBody } from '@/components/ui/card';

const KINDS = [
  {
    title: 'გამოწერით ხელმისაწვდომი პროგნოზები',
    body: 'ამ ტიპის პროგნოზებზე წვდომა ექნებათ მხოლოდ თქვენს გამომწერებს გამოწერიდან 1 თვის განმავლობაში. გამოწერით ხელმისაწვდომი ბილეთის დადებას შეძლებთ გამოწერის გააქტიურების შემდეგ.',
  },
  {
    title: 'უფასო პროგნოზები',
    body: 'უფასო ბილეთები საჯაროდ იქნება ხელმისაწვდომი საიტზე დარეგისტრირებული ყველა მომხმარებლისთვის.',
  },
  {
    title: 'ფასიანი პროგნოზები',
    body: 'თქვენ ასევე შეგეძლებათ ბილეთების ცალკე, ერთჯერადად გაყიდვა. მომხმარებელი კონკრეტული ბილეთის შეძენის შემდეგ მიიღებს მასზე წვდომას.',
  },
] as const;

/**
 * What an author reads before they post anything.
 *
 * The three kinds of ticket are three different products, and the one mistake
 * that costs a subscriber is putting the same pick in the subscription and on
 * sale separately. So it is said once, on the page an author lands on after
 * approval, and stays until they press "read". The moment is kept on the
 * profile, so it does not come back on another device.
 */
export function OnboardingNotice() {
  return (
    <Card as="section">
      <CardBody>
        <h2 className="font-display text-xl text-ink">გთხოვთ, წაიკითხოთ</h2>
        <p className="mt-2 text-ink-muted">
          საიტზე თქვენ შეძლებთ განათავსოთ სამი სახის პროგნოზი:
        </p>

        <ol className="mt-4 space-y-4">
          {KINDS.map((kind, index) => (
            <li key={kind.title} className="flex gap-3">
              <span className="tabular w-5 shrink-0 text-ink-faint">
                {index + 1}.
              </span>
              <div className="min-w-0">
                <p className="font-medium text-ink">{kind.title}</p>
                <p className="mt-1 leading-relaxed text-ink-muted">{kind.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-4 leading-relaxed text-ink-muted">
          პროგნოზის დამატება შეგეძლებათ „+ ბილეთის დამატება“ ღილაკზე დაჭერით,
          სადაც მიუთითებთ ბილეთის შესაბამის სახეობას.
        </p>

        <p className="mt-4 border-t border-line pt-4 leading-relaxed text-ink">
          გთხოვთ, გაითვალისწინოთ: გამოწერის ფარგლებში განთავსებული ბილეთები და
          ცალკე გასაყიდი ფასიანი ბილეთები ერთმანეთისგან განსხვავებული უნდა იყოს
          და არ უნდა ემთხვეოდეს ერთმანეთს.
        </p>

        <div className="mt-4">
          <ActionButton
            action={acknowledgeOnboardingAction}
            fields={{}}
            label="წავიკითხე"
            pendingLabel="ინახება…"
            tone="accent"
          />
        </div>
      </CardBody>
    </Card>
  );
}
