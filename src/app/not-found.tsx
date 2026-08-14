import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { ButtonLink } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4 text-center"
    >
      <Logo size={28} />

      <p className="tabular mt-10 text-6xl font-bold tracking-tight text-accent">
        404
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
        გვერდი ვერ მოიძებნა
      </h1>
      <p className="mt-2 text-ink-muted">
        შესაძლოა ბმული შეიცვალა ან ჩანაწერი აღარ არსებობს.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/">მთავარი გვერდი</ButtonLink>
        <ButtonLink href="/free" variant="secondary">
          უფასო ბილეთები
        </ButtonLink>
      </div>

      <p className="mt-8 text-sm text-ink-faint">
        <Link href="/analysts" className="hover:text-ink">
          ანალიტიკოსების ნახვა
        </Link>
      </p>
    </main>
  );
}
