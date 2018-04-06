const webpack = require('webpack');
const path = require('path');

const BUILD_DIR = path.join( __dirname, 'dist' );
const APP_DIR = path.join( __dirname, 'src' );

module.exports =
{
  //with webpack 4 entry and output configuration is optional
  entry: APP_DIR + '/main.js',
  output:
  {
    path: BUILD_DIR,
    filename: 'app.js',
    publicPath: '/'
  },
  //must include modules for webpack to integrate with babel for es6 syntax
  module: {
    rules: [
      {
        test: /\.js?$/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['env']
          }
        },
        exclude: /node_modules/
      }
    ]
  },
  //resolves directory to look for modules
  resolve: {
    modules: ['node_modules']
  }
};
