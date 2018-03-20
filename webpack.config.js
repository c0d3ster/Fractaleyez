const webpack = require( 'webpack' );
const path = require( 'path' );


const BUILD_DIR = path.join( __dirname, 'public' );
const APP_DIR = path.join( __dirname, 'src' );

module.exports = {
  devtool: "source-map",
  entry: APP_DIR + '/index.jsx',
  output: {
    devtoolLineToLine: true,
    sourceMapFilename: "./bundle.js.map",
    pathinfo: true,
    path: BUILD_DIR,
    filename: 'bundle.js',
    publicPath: '/'
  },
  module: {
    rules: [ {
        test: /\.(js|jsx)$/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [ 'react', 'env', 'stage-2' ]
          }
        },
        exclude: /node_modules/
      },
      {
        test: /\.(css|less)$/,
        use: [ {
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
        test: /\.json$/,
        use: [ {
          loader: 'json-loader'
        } ]
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
  }
};
