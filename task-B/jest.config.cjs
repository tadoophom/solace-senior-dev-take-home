module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  moduleNameMapper: {
    '^webrtcvad$': '<rootDir>/__mocks__/webrtcvad.js',
    '^node-record-lpcm16$': '<rootDir>/__mocks__/empty.js'
  },
  collectCoverage: true,
  testMatch: [
    '**/__tests__/**/*.test.js'
  ],
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: ['**/__tests__/vad.test.js', '**/__tests__/encryption.test.js', '**/__tests__/http.test.js'],
      transform: {
        '^.+\\.js$': 'babel-jest'
      },
      moduleNameMapper: {
        '^webrtcvad$': '<rootDir>/__mocks__/webrtcvad.js',
        '^node-record-lpcm16$': '<rootDir>/__mocks__/empty.js'
      }
    },
    {
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      testMatch: ['**/__tests__/vadBrowser.test.js'],
      transform: {
        '^.+\\.js$': 'babel-jest'
      },
      setupFilesAfterEnv: ['<rootDir>/__tests__/setupBrowserTests.js']
    }
  ]
};
