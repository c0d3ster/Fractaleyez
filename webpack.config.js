const path = require('path')

const BUILD_DIR = path.join( __dirname, 'public' )
const APP_DIR = path.join( __dirname, 'src' )

module.exports = {
  // with webpack 4 entry and output configuration is optional
  entry: ['@babel/polyfill', APP_DIR + '/index.jsx'],
  output:
  {
    path: BUILD_DIR,
    filename: 'app.js',
    publicPath: '/'
  },
  // must include modules for webpack to integrate with babel for es6 syntax
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react'],
            plugins: ['@babel/plugin-proposal-class-properties']
          }
        },
        exclude: /node_modules/
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
  // resolves directory to look for modules and resolves extensions
  resolve: {
    extensions: ['.js', '.jsx'],
    modules: ['node_modules']
  },
}
