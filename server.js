require('dotenv').config()
require('@babel/register')({
  extensions: ['.ts'],
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    '@babel/preset-typescript',
  ],
})
require('./server/prod')
