const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { cpSync } = fs;

// 1. Build NestJS with tsc (standard)
console.log('Building NestJS...');
execSync('npx nest build', { stdio: 'inherit', cwd: __dirname });

// 2. Create .vercel/output structure
const outDir = path.join(__dirname, '.vercel', 'output');
const fnDir = path.join(outDir, 'functions', 'api.func');

fs.mkdirSync(fnDir, { recursive: true });

// Copy dist
cpSync(path.join(__dirname, 'dist'), path.join(fnDir, 'dist'), { recursive: true });

// Install production-only deps into function dir
console.log('Installing production dependencies...');
fs.copyFileSync(path.join(__dirname, 'package.json'), path.join(fnDir, 'package.json'));
execSync('npm install --omit=dev --no-package-lock', { stdio: 'inherit', cwd: fnDir });

// package.json already copied above

// Create handler entry — debug env
fs.writeFileSync(path.join(fnDir, 'index.js'), `
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    DB_HOST: process.env.DB_HOST || 'NOT_SET',
    DB_PORT: process.env.DB_PORT || 'NOT_SET',
    DB_USER: process.env.DB_USER || 'NOT_SET',
    DB_NAME: process.env.DB_NAME || 'NOT_SET',
    DB_SSL: process.env.DB_SSL || 'NOT_SET',
  }));
};
`);

// .vc-config.json
fs.writeFileSync(path.join(fnDir, '.vc-config.json'), JSON.stringify({
  runtime: 'nodejs20.x',
  handler: 'index.js',
  launcherType: 'Nodejs',
  maxDuration: 60,
}, null, 2));

// config.json with routes
fs.writeFileSync(path.join(outDir, 'config.json'), JSON.stringify({
  version: 3,
  routes: [
    { src: '/(.*)', dest: '/api' }
  ]
}, null, 2));

console.log('Vercel build output ready.');
