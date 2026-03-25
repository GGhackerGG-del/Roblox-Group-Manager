const http = require('http');
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  console.log(`[TEST] ${req.method} ${req.url}`);
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({status: 'ok', port, url: req.url}));
}).listen(port, '0.0.0.0', () => {
  console.log(`Test server on 0.0.0.0:${port}`);
});
