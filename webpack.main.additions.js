// // const TerserPlugin = require('terser-webpack-plugin');
// const CopyWebpackPlugin = require('copy-webpack-plugin');
// const { CleanWebpackPlugin } = require('clean-webpack-plugin');

// module.exports = {
//   // mode: 'development',
//   // mode: 'production',
//   // optimization: {
//   //   minimizer: [
//   //     new TerserPlugin({
//   //       /* additional options here */
//   //     }),
//   //   ],
//   // },
//   resolve: {
//     extensions: ['.js', '.wasm'],
//   },
//   // module: {
//   //   rules: [
//   //     {
//   //       test: /\.js$/,
//   //       use: 'raw-loader',
//   //       // exclude: /src/main/lib/
//   //     },
//   //   ],
//   // },
//   plugins: [
//     // new CleanWebpackPlugin({
//     //   root: __dirname,
//     //   verbose: true,
//     // }),
//     // new CopyWebpackPlugin(
//     //   [
//     //     { context: 'src', from: 'main/libcmsn/*' },
//     //   ],
//     //   {
//     //     ignore: ['*.txt', '*.scss', '*.less', '*.md'],
//     //     copyUnmodified: true,
//     //   }
//     // ),
//   ],
// };

// const CopyPlugin = require('copy-webpack-plugin');

// module.exports = {
//   plugins: [
//     new CopyPlugin({
//       patterns: [{ from: 'src/main/libcmsn/*.wasm', to: 'dist' }],
//     }),
//   ],
// };
