/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: '.*\\.(spec|test)\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@hj/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true }],
  },
  testTimeout: 30000,
  clearMocks: true,
};
