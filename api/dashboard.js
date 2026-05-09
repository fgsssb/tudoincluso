const fs = require('fs');
const path = require('path');
const { getSessionFromRequest, noStore } = require('./_utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end('Método não permitido');
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    res.statusCode = 302;
    res.setHeader('Location', '/index.html');
    return res.end();
  }

  const filePath = path.join(process.cwd(), 'NNcek4x8lzToZwE3p2Upw7kWdcG5J1Dacq45odaYj9htiPDx8s.html');
  const html = fs.readFileSync(filePath, 'utf8');

  noStore(res);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
};
