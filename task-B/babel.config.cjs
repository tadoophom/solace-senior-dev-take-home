module.exports = {
  presets: [
    ['@babel/preset-env', {
      targets: {
        node: 'current'
      }
    }]
  ],
  plugins: [
    // Transform import.meta.url for Jest compatibility
    ['babel-plugin-transform-import-meta', {
      module: 'ES6'
    }]
  ]
}; 