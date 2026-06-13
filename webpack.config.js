const path = require('path')
const webpack = require('webpack')

// Load .env before EnvironmentPlugin reads process.env (client bundle is separate from server-dev.js).
require('dotenv').config({ path: path.join(__dirname, '.env') })

const BUILD_DIR = path.join( __dirname, 'public' )
const APP_DIR = path.join( __dirname, 'src' )

module.exports = {
  entry: ['@babel/polyfill', APP_DIR + '/index.tsx'],
  output:
  {
    path: BUILD_DIR,
    filename: 'app.js',
    publicPath: '/',
  },
  // must include modules for webpack to integrate with babel for es6 syntax
  module: {
    rules: [
      {
        test: /\.(js|jsx|ts|tsx)$/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-env',
              '@babel/preset-react',
              '@babel/preset-typescript'
            ],
            plugins: [
              '@babel/plugin-proposal-class-properties',
              '@babel/plugin-proposal-optional-chaining',
              '@babel/plugin-proposal-nullish-coalescing-operator'
            ]
          }
        },
        // Transpile @clerk/* (optional chaining), @vercel/analytics (?? / modern syntax); skip other node_modules
        exclude: (modulePath) =>
          /node_modules/.test(modulePath) &&
          !/node_modules[\\/]@clerk/.test(modulePath) &&
          !/node_modules[\\/]@vercel[\\/]analytics/.test(modulePath)
      },
      {
        test: /\.(css|less)$/,
        use: [{
          loader: 'style-loader'
        },
        {
          loader: 'css-loader',
          options: {
            importLoaders: 1
          }
        },
        {
          loader: 'postcss-loader'
        }
        ]
      },
      {
        test: /\.(png|jpg)$/,
        type: 'asset/resource',
        generator: {
          filename: '[name][ext]'
        }
      },
      {
        test: /\.(woff|woff2|eot|ttf|svg)$/,
        type: 'asset',
        parser: {
          dataUrlCondition: {
            maxSize: 100000
          }
        }
      }
    ]
  },
  devServer: {
    port: 3000,
    open: false,
    proxy: [
      {
        context: ['/api'],
        target: 'http://localhost:8080'
      }
    ]
  },
  plugins: [
    new webpack.EnvironmentPlugin({ CLERK_PUBLISHABLE_KEY: '' }),
  ],
  // resolves directory to look for modules and resolves extensions
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs'],
    modules: ['node_modules'],
  },
}
