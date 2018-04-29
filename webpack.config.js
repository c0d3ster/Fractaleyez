const webpack = require('webpack');
const path = require('path');
const HtmlWebPackPlugin = require('html-webpack-plugin');

const BUILD_DIR = path.join( __dirname, 'dist' );
const APP_DIR = path.join( __dirname, 'src' );

//dynamically generates html file with correct references
const htmlPlugin = new HtmlWebPackPlugin({
  template: './src/index.html',
  filename: './index.html'
});

//prepends all instances of $ with var $ = require('jquery')
const jQuery = new webpack.ProvidePlugin({
     $: 'jquery',
     jQuery: 'jquery'
 })

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
            presets: ['env', 'stage-2']
          }
        },
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
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
          }]
      },
      {
        test: /\.(png|jpg)$/,
        use: [ {
          loader: 'file-loader?name=[name].[ext]'
        } ]
      },
      {
        test: /\.(png|woff|woff2|eot|ttf|svg)$/,
        use: [ {
          loader: 'url-loader?limit=100000'
        } ]
      }
    ]
  },
  //resolves directory to look for modules
  resolve: {
    modules: ['node_modules']
  },
  //manages plugins specified above configuration
  plugins: [htmlPlugin, jQuery]
};
