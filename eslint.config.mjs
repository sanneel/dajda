import next from 'eslint-config-next';
import nextTypescript from 'eslint-config-next/typescript';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'src/generated/**',
      'next-env.d.ts',
      'coverage/**',
    ],
  },
  ...next,
  ...nextTypescript,
  {
    // eslint-plugin-react's automatic version detection calls an ESLint 9 API
    // that was removed in ESLint 10, which crashes the run. Declaring the
    // version explicitly skips detection entirely.
    settings: { react: { version: '19.2' } },
    rules: {
      // The generated Prisma client and Next's typed routes rely on `any` in
      // places we do not control; everything we author is explicitly typed.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

export default config;
