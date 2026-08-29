'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/feedback';

export type PaymentReturnStatus = 'SUCCEEDED' | 'PENDING' | 'FAILED';

/**
 * The banner a buyer lands on coming back from the payment page.
 *
 * The gateway redirects before our webhook has necessarily arrived, so the
 * honest first message is "processing". While it says that, the page quietly
 * refreshes itself every few seconds; the moment the webhook lands, the
 * server re-renders this as a green confirmation and unlocks whatever was
 * bought - no manual reload, no guessing.
 */
export function PaymentReturnBanner({ status }: { status: PaymentReturnStatus }) {
  const router = useRouter();
  const attempts = useRef(0);

  useEffect(() => {
    if (status !== 'PENDING') return;
    const timer = setInterval(() => {
      attempts.current += 1;
      // Give the webhook a generous minute, then stop burning requests.
      if (attempts.current > 15) {
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, 4000);
    return () => clearInterval(timer);
  }, [status, router]);

  if (status === 'SUCCEEDED') {
    return (
      <Alert tone="success" title="გადახდა დადასტურდა">
        შენაძენი გააქტიურებულია.
      </Alert>
    );
  }

  if (status === 'FAILED') {
    return (
      <Alert tone="error" title="გადახდა ვერ შესრულდა">
        თანხა არ ჩამოგეჭრათ ან უკან დაბრუნდება. სცადეთ თავიდან, ან მოგვწერეთ
        კონტაქტის გვერდიდან.
      </Alert>
    );
  }

  return (
    <Alert tone="info" title="გადახდა მუშავდება…">
      ბანკიდან დადასტურებას ველოდებით - ჩვეულებრივ რამდენიმე წამია. გვერდი
      თავისით განახლდება.
    </Alert>
  );
}
