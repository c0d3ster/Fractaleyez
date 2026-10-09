require('dotenv').config({ quiet: true })
require('@babel/register')({
  extensions: ['.ts', '.tsx'],
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    '@babel/preset-typescript',
  ],
})
require('./server/dev')
