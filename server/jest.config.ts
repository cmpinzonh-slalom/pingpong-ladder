import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/__tests__/**/*.test.ts'],
  clearMocks: true,
  // API tests hash passwords (bcrypt) and run on pg-mem; some full-bracket flows take a few seconds.
  testTimeout: 20000,
};

export default config;
