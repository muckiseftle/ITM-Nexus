// @ts-check
import tseslint from 'typescript-eslint';

/**
 * NEXUS ESLint Flat-Config.
 * - typescript-eslint "strict-type-checked" + "stylistic-type-checked"
 * - Architektur-Grenzen via no-restricted-imports (Ports & Adapter, Schichtentrennung)
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.config.*',
      'eslint.config.mjs',
    ],
  },
  {
    files: ['packages/**/*.ts'],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Architektur-Grenze: Die Domänenschicht darf keine oberen/seitlichen Schichten kennen.
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@nexus/core-transport',
                '@nexus/core-transport/*',
                '@nexus/ui-kit',
                '@nexus/ui-kit/*',
              ],
              message:
                'Architektur-Grenze: @nexus/domain darf keine höheren Schichten importieren.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
