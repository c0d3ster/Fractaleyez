const path = require('path')
const webpack = require('webpack')

// Load .env before EnvironmentPlugin reads process.env (client bundle is separate from server-dev.js).
require('dotenv').config({ path: path.join(__dirname, '.env') })

const BUILD_DIR = path.join( __dirname, 'public' )
const APP_DIR = path.join( __dirname, 'src' )

module.exports = {
  // with webpack 4 entry and output configuration is optional
  entry: ['@babel/polyfill', APP_DIR + '/index.tsx'],
  output:
  {
    path: BUILD_DIR,
    filename: 'app.js',
    publicPath: '/',
    hashFunction: 'sha256'
  },
  // must include modules for webpack to integrate with babel for es6 syntax
  module: {
    rules: [
      // Webpack 4 treats .mjs as strict ESM; SWR + CJS react breaks without this.
      {
        test: /\.mjs$/,
        include: /node_modules/,
        type: 'javascript/auto'
      },
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
        use: [{
          loader: 'file-loader?name=[name].[ext]'
        }]
      },
      {
        test: /\.(png|woff|woff2|eot|ttf|svg)$/,
        use: [{
          loader: 'url-loader?limit=100000'
        }]
      }
    ]
  },
  devServer: {
    port: 3000,
    open: false,
    proxy: {
      '/api': 'http://localhost:8080'
    }
  },
  plugins: [
    new webpack.EnvironmentPlugin({ CLERK_PUBLISHABLE_KEY: '' }),
  ],
  // resolves directory to look for modules and resolves extensions
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs'],
    modules: ['node_modules'],
    // Webpack 4 ignores package "exports"; @vercel/analytics only exposes ./react via exports
    alias: {
      '@vercel/analytics/react': path.join(
        __dirname,
        'node_modules/@vercel/analytics/dist/react/index.js'
      ),
    },
  },
}
