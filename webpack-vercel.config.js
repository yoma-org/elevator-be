const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: './src/main.ts',
  target: 'node',
  mode: 'production',
  // Bundle everything into a single file
  externals: [],
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: { configFile: 'tsconfig.build.json' },
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist-vercel'),
    libraryTarget: 'commonjs2',
  },
  plugins: [
    new webpack.IgnorePlugin({
      checkResource(resource) {
        // Ignore optional/dynamic NestJS dependencies
        const lazyImports = [
          '@nestjs/microservices',
          '@nestjs/websockets',
          '@nestjs/microservices/microservices-module',
          '@nestjs/websockets/socket-module',
          'class-transformer/storage',
          '@nestjs/platform-fastify',
          '@grpc/grpc-js',
          '@grpc/proto-loader',
          'mqtt',
          'nats',
          'ioredis',
          'amqplib',
          'amqp-connection-manager',
          'kafkajs',
          'cache-manager',
        ];
        if (lazyImports.includes(resource)) return true;
        return false;
      },
    }),
  ],
  optimization: {
    minimize: false,
  },
};
