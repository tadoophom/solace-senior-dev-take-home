module.exports = {
  testEnvironment: 'node',
  collectCoverage: true,
  moduleNameMapper: {
    '^webrtcvad$': '<rootDir>/__mocks__/webrtcvad.js',
    '^node-record-lpcm16$': '<rootDir>/__mocks__/empty.js'
  }
};
