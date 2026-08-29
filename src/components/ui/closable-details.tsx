'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A native <details> that also closes the way a menu is expected to: on a
 * click anywhere outside and on Escape. The disclosure itself stays fully
 * functional without JavaScript - this only adds the dismissal.
 */
export function ClosableDetails({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const onPointerDown = (event: PointerEvent) => {
      if (
        element.open &&
        event.target instanceof Node &&
        !element.contains(event.target)
      ) {
        element.open = false;
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') element.open = false;
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <details ref={ref} className={className}>
      {children}
    </details>
  );
}
