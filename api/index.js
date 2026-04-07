const main = require('../dist/main');
const server = main.default || main;
const ensureBootstrap = main.ensureBootstrap;
let booted = null;

module.exports = async (req, res) => {
  try {
    if (!booted) booted = ensureBootstrap();
    await booted;
    server(req, res);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: e.message }));
  }
};
