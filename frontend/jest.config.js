module.exports = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/dist/'],
  moduleNameMapper: {
    '^@app/(.*)$': '<rootDir>/src/app/$1',
    '^@assets/(.*)$': '<rootDir>/src/assets/$1',
    '^@environments/(.*)$': '<rootDir>/src/environments/$1'
  },
  transform: {
    '^.+\\.(ts|js|html)$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.spec.json',
        stringifyContentPathRegex: '\\.html$',
        useESM: false
      }
    ]
  },
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.spec.json'
    }
  },
  collectCoverageFrom: [
    'src/app/**/*.{ts,html}',
    '!src/app/**/*.spec.ts',
    '!src/app/**/*.d.ts'
  ],
  coverageDirectory: 'coverage/jest',
  coverageReporters: ['html', 'lcov', 'text', 'clover'],
  testMatch: [
    '**/*.spec.ts'
  ],
  verbose: true
};