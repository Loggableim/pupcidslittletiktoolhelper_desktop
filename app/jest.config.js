module.exports = {
  testEnvironment: 'node',
  transformIgnorePatterns: [
    'node_modules/(?!(franc-min|trigram-utils)/)'
  ],
  transform: {
    '^.+\\.js$': ['babel-jest', { 
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }]
      ]
    }]
  }
};
