-- Sports an author can file a ticket under.
--
-- The seed script owns this list, but the seed is a laptop command: a
-- deployment runs `prisma migrate deploy` and nothing else, so a sport added
-- to the seed after the first deploy never reached the live database. Tennis
-- and MMA were in that position, and multisport did not exist anywhere.
--
-- Multisport is for a slip whose legs cross sports. Filing one under its
-- first leg's sport made every per-sport record slightly wrong.
--
-- Written to be safe to re-run and safe on a database that already has these
-- rows: it inserts what is missing and re-activates what an earlier
-- administrator switched off by hand only if the row is not there at all.
INSERT INTO "Sport" (id, code, slug, "nameKa", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'TENNIS',     'tennis',     'ჩოგბურთი',    true, now(), now()),
  (gen_random_uuid(), 'MMA',        'mma',        'MMA',          true, now(), now()),
  (gen_random_uuid(), 'MULTISPORT', 'multisport', 'მულტისპორტი', true, now(), now())
ON CONFLICT (code) DO NOTHING;

-- MMA existed already, under the name "ბრძოლის ხელოვნება". That is a correct
-- translation and a useless label: an author scanning the list for MMA does
-- not find it, which is how it came to be reported as missing.
UPDATE "Sport" SET "nameKa" = 'MMA', "updatedAt" = now()
WHERE code = 'MMA' AND "nameKa" <> 'MMA';
