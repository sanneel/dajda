/**
 * The card scheme marks the payment provider requires on the site.
 *
 * Visa and Mastercard are the two networks Flitt settles for us, and their
 * marks must be visible before a card is entered. These are the only
 * third-party colours the interface carries: drawn small, on their own line,
 * and never next to a result, so the Verdict Rule (green and brick mean won
 * and lost) is not muddied by a red circle that means something else.
 *
 * Apple Pay and Google Pay get the same treatment: the provider settles
 * both, and a reviewer looks for the marks, not the words.
 */
function VisaMark({ height }: { height: number }) {
  return (
    <svg
      height={height}
      viewBox="0 0 48 16"
      role="img"
      aria-label="Visa"
      focusable="false"
    >
      <text
        x="24"
        y="14"
        textAnchor="middle"
        fontFamily="'Google Sans', Arial, Helvetica, sans-serif"
        fontSize="17"
        fontWeight="800"
        fontStyle="italic"
        letterSpacing="-0.5"
        fill="#1434CB"
      >
        VISA
      </text>
    </svg>
  );
}

function MastercardMark({ height }: { height: number }) {
  // Two circles of radius 7 centred 7 apart; the lens between them is the
  // overlap colour the brand specifies.
  return (
    <svg
      height={height}
      viewBox="0 0 24 15"
      role="img"
      aria-label="Mastercard"
      focusable="false"
    >
      <circle cx="8.5" cy="7.5" r="7" fill="#EB001B" />
      <circle cx="15.5" cy="7.5" r="7" fill="#F79E1B" />
      <path d="M12 1.44A7 7 0 0 1 12 13.56A7 7 0 0 1 12 1.44Z" fill="#FF5F00" />
    </svg>
  );
}


function ApplePayMark({ height }: { height: number }) {
  // The Apple mark, then "Pay" in the weight Apple sets it in.
  return (
    <svg
      height={height}
      viewBox="0 0 46 20"
      role="img"
      aria-label="Apple Pay"
      focusable="false"
    >
      <path
        transform="translate(2 1.5) scale(0.034)"
        fill="#000"
        d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
      />
      <text
        x="18"
        y="15.5"
        fontFamily="'Google Sans', 'Helvetica Neue', Arial, sans-serif"
        fontSize="15"
        fontWeight="500"
        letterSpacing="-0.3"
        fill="#000"
      >
        Pay
      </text>
    </svg>
  );
}

function GooglePayMark({ height }: { height: number }) {
  // The four-colour G at brand values, then "Pay" in Google grey.
  return (
    <svg
      height={height}
      viewBox="0 0 49 20"
      role="img"
      aria-label="Google Pay"
      focusable="false"
    >
      <g transform="translate(1 1) scale(0.375)">
        <path
          fill="#4285F4"
          d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
        />
        <path
          fill="#34A853"
          d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
        />
        <path
          fill="#FBBC05"
          d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
        />
        <path
          fill="#EA4335"
          d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
        />
      </g>
      <text
        x="21"
        y="15.5"
        fontFamily="'Google Sans', 'Helvetica Neue', Arial, sans-serif"
        fontSize="15"
        fontWeight="500"
        letterSpacing="-0.3"
        fill="#3C4043"
      >
        Pay
      </text>
    </svg>
  );
}

export function PaymentMarks({
  size = 'sm',
  withWallets = false,
  className = '',
}: {
  /** sm sits inside a form; md is the footer and the pricing page. */
  size?: 'sm' | 'md';
  /** Also show the Apple Pay and Google Pay marks. */
  withWallets?: boolean;
  className?: string;
}) {
  const height = size === 'sm' ? 14 : 20;
  return (
    <span
      className={`inline-flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}
    >
      <span
        className="inline-flex items-center rounded-card bg-white px-1.5"
        style={{ height: height + 8 }}
      >
        <VisaMark height={height * 0.7} />
      </span>
      <span
        className="inline-flex items-center rounded-card bg-white px-1.5"
        style={{ height: height + 8 }}
      >
        <MastercardMark height={height} />
      </span>
      {withWallets ? (
        <>
          <span
            className="inline-flex items-center rounded-card bg-white px-1.5"
            style={{ height: height + 8 }}
          >
            <ApplePayMark height={height} />
          </span>
          <span
            className="inline-flex items-center rounded-card bg-white px-1.5"
            style={{ height: height + 8 }}
          >
            <GooglePayMark height={height} />
          </span>
        </>
      ) : null}
    </span>
  );
}
