const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

const baseConfig = {
  entry: {
    content: './src/content/index.ts',
    background: './src/background/index.ts',
    options: './src/options/options.ts',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
};

module.exports = (env, argv) => {
  const mode = argv.mode || 'development';
  const devtool = mode === 'development' ? 'inline-source-map' : false;

  const chromiumConfig = {
    ...baseConfig,
    name: 'chromium',
    mode,
    devtool,
    output: {
      path: path.resolve(__dirname, 'dist/chromium'),
      filename: '[name].js',
      clean: true,
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          { from: 'manifests/v3.json', to: 'manifest.json' },
          { from: 'src/options/options.html', to: 'options.html' },
          { from: 'src/options/options.css', to: 'options.css' },
          { from: 'src/assets', to: 'assets', noErrorOnMissing: true },
        ],
      }),
    ],
  };

  const firefoxConfig = {
    ...baseConfig,
    name: 'firefox',
    mode,
    devtool,
    output: {
      path: path.resolve(__dirname, 'dist/firefox'),
      filename: '[name].js',
      clean: true,
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          { from: 'manifests/v2.json', to: 'manifest.json' },
          { from: 'src/options/options.html', to: 'options.html' },
          { from: 'src/options/options.css', to: 'options.css' },
          { from: 'src/assets', to: 'assets', noErrorOnMissing: true },
        ],
      }),
    ],
  };

  return [chromiumConfig, firefoxConfig];
};
