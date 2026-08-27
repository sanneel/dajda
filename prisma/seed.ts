import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/lib/auth/password';
import { computeProfitUnitsCenti } from '../src/lib/predictions/settlement';

/**
 * Development seed.
 *
 * EVERY row created here is flagged `isDemo: true` and is labelled "დემო" in
 * the UI. None of it describes a real person or a real result.
 *
 * The data is generated from a fixed seed so that repeated runs produce the
 * same record. A demo whose ROI changes on every reset is useless for
 * screenshots and for reasoning about the statistics code.
 *
 * Bet slips are GENERATED here as real images, because `screenshotPath` is
 * required and every bet must have evidence behind it. They are stored the
 * same way an uploaded slip is, as rows in the database, so a fresh deploy
 * has working images without needing a disk. They are obviously synthetic
 * placeholders, not fabricated bookmaker slips.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed.');
}

const poolMax = process.env.DATABASE_POOL_MAX
  ? Number(process.env.DATABASE_POOL_MAX)
  : undefined;

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString,
    ...(poolMax ? { max: poolMax } : {}),
  }),
});


/** Deterministic PRNG (mulberry32) so the demo record is reproducible. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  );

/**
 * Writes a placeholder slip and returns its stored path.
 *
 * Marked "დემო" across the face so a seeded image can never be mistaken for a
 * real bookmaker screenshot in a demo or a screenshot of the product.
 */
async function makeSlip(lines: string[], tone: 'bet' | 'result') {
  const accent = tone === 'bet' ? '#c6f423' : '#8ab4ff';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="675">
    <rect width="900" height="675" fill="#0e1013"/>
    <rect x="40" y="40" width="820" height="595" rx="10" fill="#16181c" stroke="#22262b" stroke-width="2"/>
    <text x="80" y="120" fill="${accent}" font-family="sans-serif" font-size="30" font-weight="700">
      ${escapeXml(tone === 'bet' ? 'ფსონის კუპონი' : 'შედეგი')}
    </text>
    ${lines
      .map(
        (line, i) =>
          `<text x="80" y="${195 + i * 52}" fill="#e8eaed" font-family="sans-serif" font-size="26">${escapeXml(line)}</text>`,
      )
      .join('')}
    <text x="80" y="600" fill="#5a616b" font-family="sans-serif" font-size="22">დემო სურათი, რეალური კუპონი არ არის</text>
  </svg>`;

  const name = `${randomBytes(16).toString('hex')}.webp`;
  const { data, info } = await sharp(Buffer.from(svg))
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });

  await prisma.screenshot.create({
    data: {
      name,
      mimeType: 'image/webp',
      bytes: data,
      byteSize: data.byteLength,
      width: info.width,
      height: info.height,
    },
  });

  return `/uploads/${name}`;
}

const DEMO_PASSWORD = 'DemoPass2026';

async function main() {
  console.info('Seeding DAJDA demo data…');

  // -------------------------------------------------------------------------
  // Clean slate. Order matters: children before parents.
  // -------------------------------------------------------------------------
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.paymentStatusTransition.deleteMany(),
    prisma.webhookEvent.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.userSubscription.deleteMany(),
    prisma.subscriptionPlan.deleteMany(),
    prisma.report.deleteMany(),
    prisma.predictionView.deleteMany(),
    prisma.predictionEdit.deleteMany(),
    prisma.predictionResult.deleteMany(),
    prisma.prediction.deleteMany(),
    /*
     * Screenshots have no parent row to cascade from - `screenshotPath` is a
     * plain string, not a foreign key - so re-seeding would otherwise leave
     * every previous run's images behind in the table forever.
     */
    prisma.screenshot.deleteMany(),
    prisma.analystSport.deleteMany(),
    prisma.analystProfile.deleteMany(),
    prisma.notificationPreference.deleteMany(),
    prisma.savedAnalyst.deleteMany(),
    prisma.authToken.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
    prisma.sport.deleteMany(),
  ]);

  const football = await prisma.sport.create({
    data: { code: 'FOOTBALL', slug: 'football', nameKa: 'ფეხბურთი' },
  });
  const basketball = await prisma.sport.create({
    data: { code: 'BASKETBALL', slug: 'basketball', nameKa: 'კალათბურთი' },
  });

  // -------------------------------------------------------------------------
  // People
  // -------------------------------------------------------------------------
  const password = await hashPassword(DEMO_PASSWORD);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@dajda.ge',
      name: 'ადმინისტრატორი',
      password,
      role: 'ADMIN',
      emailVerifiedAt: new Date(),
      ageConfirmedAt: new Date(),
      isDemo: true,
      notificationPrefs: { create: {} },
    },
  });

  const subscriber = await prisma.user.create({
    data: {
      email: 'user@dajda.ge',
      name: 'ნინო ხარაზი',
      password,
      role: 'USER',
      emailVerifiedAt: new Date(),
      ageConfirmedAt: new Date(),
      isDemo: true,
      notificationPrefs: { create: {} },
    },
  });

  const analystSeeds = [
    {
      email: 'giorgi@dajda.ge',
      name: 'გიორგი ბერიძე',
      slug: 'giorgi-beridze',
      headline: 'ეროვნული ლიგა და ინგლისის პრემიერ ლიგა',
      bio: 'ვაანალიზებ ქართულ და ინგლისურ ფეხბურთს 2019 წლიდან. ვმუშაობ ძირითადად ჯამურ გოლებსა და გუნდურ ტოტალებზე. ყველა პროგნოზს ვაქვეყნებ მატჩის დაწყებამდე და არასდროს ვშლი წაგებულს.',
      sportId: football.id,
      seed: 11,
      count: 42,
      winRate: 0.56,
    },
    {
      email: 'levan@dajda.ge',
      name: 'ლევან ჯაფარიძე',
      slug: 'levan-japaridze',
      headline: 'ევროლიგა',
      bio: 'ევროლიგის სტატისტიკაზე ორიენტირებული ანალიზი. მაინტერესებს ტემპი, მფლობელობა და მწვრთნელის როტაცია. მცირე ბანკროლის მართვის მომხრე ვარ.',
      sportId: basketball.id,
      seed: 22,
      count: 34,
      winRate: 0.5,
    },
    {
      email: 'tamar@dajda.ge',
      name: 'თამარ კვარაცხელია',
      slug: 'tamar-kvaratskhelia',
      headline: 'მოთამაშეთა სტატისტიკა',
      bio: 'ვმუშაობ ინდივიდუალურ მაჩვენებლებზე: დარტყმები კარისკენ, გადაცემები. მონაცემებს ვამუშავებ ხელით, ამიტომ პროგნოზების რაოდენობა შეზღუდულია.',
      sportId: football.id,
      seed: 33,
      count: 26,
      winRate: 0.62,
    },
    {
      email: 'davit@dajda.ge',
      name: 'დავით მაისურაძე',
      slug: 'davit-maisuradze',
      headline: 'ახალი ავტორი, მცირე ისტორია',
      bio: 'ახლახან დავიწყე პროგნოზების გამოქვეყნება. ისტორია ჯერ მოკლეა, ამიტომ სტატისტიკა ჯერ არაა რეპრეზენტატული.',
      sportId: football.id,
      seed: 44,
      count: 9,
      winRate: 0.67,
    },
  ];

  const footballPicks = [
    'დინამო თბილისი vs საბურთალო',
    'ტორპედო ქუთაისი vs დილა',
    'სამგურალი vs გაგრა',
    'არსენალი vs ჩელსი',
    'ლივერპული vs მანჩესტერ სიტი',
    'ტოტენჰემი vs ევერტონი',
    'ნიუკასლი vs ასტონ ვილა',
    'ბრაითონი vs ვესტ ჰემი',
  ];
  const basketballPicks = [
    'რეალ მადრიდი vs ბარსელონა',
    'ოლიმპიაკოსი vs პანათინაიკოსი',
    'ფენერბაჰჩე vs ეფესი',
    'ბაიერნი vs ალბა',
  ];
  const markets = [
    'ჯამური გოლები 2.5-ზე მეტი',
    'ორივე გაიტანს',
    'პირველი ტაიმი, ტოტალი',
    'გუნდის ტოტალი',
    'ორმაგი შანსი',
  ];

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  let settledCount = 0;
  let awaitingReview = 0;
  let liveCount = 0;
  let freeCount = 0;

  for (const seed of analystSeeds) {
    const user = await prisma.user.create({
      data: {
        email: seed.email,
        name: seed.name,
        password,
        role: 'ANALYST',
        emailVerifiedAt: new Date(),
        ageConfirmedAt: new Date(),
        isDemo: true,
        notificationPrefs: { create: {} },
      },
    });

    const profile = await prisma.analystProfile.create({
      data: {
        userId: user.id,
        displayName: seed.name,
        slug: seed.slug,
        headline: seed.headline,
        bio: seed.bio,
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedById: admin.id,
        isDemo: true,
        sports: { create: { sportId: seed.sportId } },
      },
    });

    await prisma.subscriptionPlan.createMany({
      data: [
        {
          analystProfileId: profile.id,
          tier: 'PREMIUM',
          nameKa: `${seed.name} · Premium`,
          descriptionKa: 'ავტორის ყველა პროგნოზი და სრული აღწერა.',
          featuresKa: [
            'ავტორის ყველა პროგნოზი',
            'სრული აღწერა თითოეულზე',
            'შედეგების დეტალური ისტორია',
          ],
          priceMinor: 3000,
          currency: 'GEL',
          billingPeriod: 'MONTHLY',
          isDemo: true,
          sortOrder: 1,
        },
        {
          analystProfileId: profile.id,
          tier: 'VIP',
          nameKa: `${seed.name} · VIP`,
          descriptionKa: 'ყველაფერი Premium-იდან და კვირის შეჯამება.',
          featuresKa: [
            'ყველაფერი Premium-იდან',
            'ავტორის კვირის შეჯამება',
            'პრიორიტეტული პასუხი',
          ],
          priceMinor: 5000,
          currency: 'GEL',
          billingPeriod: 'MONTHLY',
          isDemo: true,
          sortOrder: 2,
        },
      ],
    });

    const random = makeRandom(seed.seed);
    const picks = seed.sportId === basketball.id ? basketballPicks : footballPicks;

    for (let i = 0; i < seed.count; i += 1) {
      const pick = picks[i % picks.length]!;
      const market = markets[i % markets.length]!;
      const odds = 1.5 + Math.round(random() * 180) / 100;
      const oddsMilli = Math.round(odds * 1000);
      const stakeUnitsCenti = 100;

      // Most are in the past and settled. The last few are live or waiting on
      // an admin, so both queues have something in them.
      const isSettled = i < seed.count - 3;
      const eventAt = new Date(now - (seed.count - i) * 1.7 * day);

      // Free bets: every fourth one, so the public feed is not empty.
      const visibility =
        i % 4 === 0 ? 'PUBLIC' : i % 4 === 3 ? 'VIP' : 'PREMIUM';
      if (visibility === 'PUBLIC') freeCount += 1;

      const screenshotPath = await makeSlip(
        [pick, market, `კოეფიციენტი: ${odds.toFixed(2)}`, `ფსონი: 1 ერთეული`],
        'bet',
      );

      const publishedAt = new Date(eventAt.getTime() - 1.2 * day);

      if (isSettled) {
        const won = random() < seed.winRate;
        const outcome = won ? 'WON' : 'LOST';
        const finishedAt = new Date(eventAt.getTime() + 3 * 60 * 60 * 1000);

        // Half the settled ones carry the author's result screenshot, so the
        // admin queue shows both the easy and the manual case.
        const resultScreenshotPath =
          i % 2 === 0
            ? await makeSlip(
                [pick, market, outcome === 'WON' ? 'დაჯდა' : 'ვერ დაჯდა'],
                'result',
              )
            : null;

        const prediction = await prisma.prediction.create({
          data: {
            authorId: profile.id,
            postedById: user.id,
            sportId: seed.sportId,
            screenshotPath,
            resultScreenshotPath,
            titleKa: `${pick} · ${market}`,
            descriptionKa: `${market}. ავტორის მოსაზრება ამ მატჩზე, დემო ტექსტი.`,
            oddsMilli,
            stakeUnitsCenti,
            visibility,
            publishedAt,
            eventAt,
            finishedAt,
            status: outcome,
            isDemo: true,
          },
        });

        await prisma.predictionResult.create({
          data: {
            predictionId: prediction.id,
            outcome,
            profitUnitsCenti: computeProfitUnitsCenti(
              outcome,
              oddsMilli,
              stakeUnitsCenti,
            ),
            settlementSource: 'დემო მონაცემი, ავტორის სკრინშოტი',
            settledById: admin.id,
            settledAt: new Date(finishedAt.getTime() + 30 * 60 * 1000),
          },
        });
        settledCount += 1;
      } else if (i === seed.count - 1) {
        // Live: the event has not happened yet.
        await prisma.prediction.create({
          data: {
            authorId: profile.id,
            postedById: user.id,
            sportId: seed.sportId,
            screenshotPath,
            titleKa: `${pick} · ${market}`,
            descriptionKa: `${market}. ავტორის მოსაზრება ამ მატჩზე, დემო ტექსტი.`,
            oddsMilli,
            stakeUnitsCenti,
            visibility,
            publishedAt,
            eventAt: new Date(now + 2 * day),
            isDemo: true,
          },
        });
        liveCount += 1;
      } else {
        // Marked finished by the author, waiting on an admin. One of the two
        // has no result screenshot, which is the case an admin must check by
        // hand.
        const withProof = i === seed.count - 2;
        await prisma.prediction.create({
          data: {
            authorId: profile.id,
            postedById: user.id,
            sportId: seed.sportId,
            screenshotPath,
            resultScreenshotPath: withProof
              ? await makeSlip([pick, market, 'დაჯდა'], 'result')
              : null,
            titleKa: `${pick} · ${market}`,
            descriptionKa: `${market}. ავტორის მოსაზრება ამ მატჩზე, დემო ტექსტი.`,
            oddsMilli,
            stakeUnitsCenti,
            visibility,
            publishedAt,
            eventAt,
            finishedAt: new Date(eventAt.getTime() + 2 * 60 * 60 * 1000),
            isDemo: true,
          },
        });
        awaitingReview += 1;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Community free tickets
  // -------------------------------------------------------------------------
  /*
   * Posted by an ordinary subscriber, not an analyst. `authorId` is null, so
   * these count toward nobody's record and stay out of every accuracy figure
   * while still appearing in the free feed. Seeding them is what makes that
   * distinction visible: without one, /free would show only analyst bets and
   * the two shapes would look identical.
   */
  const communityTickets = [
    { title: 'დინამო თბილისი vs საბურთალო · ჯამური 2.5-ზე მეტი', odds: 1.72 },
    { title: 'რეალი vs ბარსელონა · ორივე გაიტანს', odds: 1.65 },
    { title: 'ვირტუსი vs ოლიმპია · ჯამური 160.5-ზე ნაკლები', odds: 1.9 },
  ];

  let communityCount = 0;
  for (const [index, ticket] of communityTickets.entries()) {
    await prisma.prediction.create({
      data: {
        authorId: null,
        postedById: subscriber.id,
        sportId: index === 2 ? basketball.id : football.id,
        screenshotPath: await makeSlip(
          [ticket.title, `კოეფიციენტი: ${ticket.odds.toFixed(2)}`],
          'bet',
        ),
        titleKa: ticket.title,
        descriptionKa: 'დემო უფასო ბილეთი, მომხმარებლის ატვირთული.',
        oddsMilli: Math.round(ticket.odds * 1000),
        stakeUnitsCenti: 100,
        visibility: 'PUBLIC',
        publishedAt: new Date(now - (index + 1) * 0.4 * day),
        isDemo: true,
      },
    });
    communityCount += 1;
  }

  // -------------------------------------------------------------------------
  // Feed: statuses and one running live session
  // -------------------------------------------------------------------------
  /*
   * One of each kind, on the first analyst, because the three read completely
   * differently and a demo that only shows notes would not reveal that. The
   * live session is left OPEN on purpose: that is the state the feed and the
   * author's own controls are actually designed around.
   */
  const feedAuthor = await prisma.analystProfile.findFirstOrThrow({
    where: { slug: 'giorgi-beridze' },
    select: { id: true },
  });

  await prisma.analystPost.create({
    data: {
      authorId: feedAuthor.id,
      kind: 'NOTE',
      bodyKa:
        'დღეს ეროვნულ ლიგას ვუყურებ. ორი მატჩი მაინტერესებს, ჯერ ვაკვირდები შემადგენლობებს.',
      isDemo: true,
      createdAt: new Date(now - 6 * 60 * 60 * 1000),
    },
  });

  const liveNotice = await prisma.analystPost.create({
    data: {
      authorId: feedAuthor.id,
      kind: 'LIVE_NOTICE',
      bodyKa:
        'ვიწყებ ლაივ პოსტინგს. ყველა პროგნოზს აქვე გამოვაქვეყნებ სკრინშოტით, კომენტარებთან ერთად.',
      liveLabelKa: 'დინამო თბილისი vs საბურთალო',
      liveAt: new Date(now + 90 * 60 * 1000),
      isDemo: true,
      createdAt: new Date(now - 2 * 60 * 60 * 1000),
    },
  });

  await prisma.analystPost.createMany({
    data: [
      {
        authorId: feedAuthor.id,
        kind: 'LIVE_UPDATE',
        parentId: liveNotice.id,
        bodyKa: 'შემადგენლობები გამოვიდა. ორივე გუნდი სრული შემადგენლობითაა.',
        isDemo: true,
        createdAt: new Date(now - 100 * 60 * 1000),
      },
      {
        authorId: feedAuthor.id,
        kind: 'LIVE_UPDATE',
        parentId: liveNotice.id,
        bodyKa: 'პირველი ტაიმი მშვიდად მიდის. ველოდები კოეფიციენტის მომატებას.',
        isDemo: true,
        createdAt: new Date(now - 40 * 60 * 1000),
      },
    ],
  });

  // -------------------------------------------------------------------------
  // Platform plans and the demo subscriber
  // -------------------------------------------------------------------------
  await prisma.subscriptionPlan.create({
    data: {
      analystProfileId: null,
      tier: 'FREE',
      nameKa: 'უფასო',
      descriptionKa: 'ღია პროგნოზები და სრული სტატისტიკა.',
      featuresKa: [
        'ყველა უფასო პროგნოზი',
        'ანალიტიკოსების სრული ისტორია',
        'ROI, სიზუსტე და სერიები',
      ],
      priceMinor: 0,
      currency: 'GEL',
      billingPeriod: 'MONTHLY',
      isDemo: true,
      sortOrder: 0,
    },
  });

  const freePlan = await prisma.subscriptionPlan.findFirstOrThrow({
    where: { analystProfileId: null, tier: 'FREE' },
  });
  const firstAnalyst = await prisma.analystProfile.findFirstOrThrow({
    where: { slug: 'giorgi-beridze' },
  });
  const analystPremiumPlan = await prisma.subscriptionPlan.findFirstOrThrow({
    where: { analystProfileId: firstAnalyst.id, tier: 'PREMIUM' },
  });

  /*
   * Two subscriptions on purpose, because one would only demonstrate half the
   * access rule: the platform-wide FREE plan plus a PREMIUM plan scoped to ONE
   * analyst. Signing in therefore shows Giorgi's bets unlocked and every other
   * author's still behind the paywall.
   */
  await prisma.userSubscription.createMany({
    data: [
      {
        userId: subscriber.id,
        planId: freePlan.id,
        status: 'ACTIVE',
        startedAt: new Date(),
        currentPeriodEnd: new Date(now + 30 * day),
      },
      {
        userId: subscriber.id,
        planId: analystPremiumPlan.id,
        status: 'ACTIVE',
        startedAt: new Date(now - 3 * day),
        currentPeriodEnd: new Date(now + 27 * day),
      },
    ],
  });

  await prisma.savedAnalyst.create({
    data: { userId: subscriber.id, analystProfileId: firstAnalyst.id },
  });

  const totals = {
    users: await prisma.user.count(),
    analysts: await prisma.analystProfile.count(),
    bets: await prisma.prediction.count(),
    settled: settledCount,
    awaitingReview,
    live: liveCount,
    free: freeCount,
    communityTickets: communityCount,
    plans: await prisma.subscriptionPlan.count(),
  };

  console.info('Seed complete:', totals);
  console.info(`Demo logins (password: ${DEMO_PASSWORD})`);
  console.info('  user@dajda.ge   - მომხმარებელი, აქტიური Premium გამოწერით');
  console.info('  giorgi@dajda.ge - ანალიტიკოსი, აქვეყნებს პროგნოზებს');
  console.info('  admin@dajda.ge  - ადმინი, ამოწმებს სკრინშოტებს');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
