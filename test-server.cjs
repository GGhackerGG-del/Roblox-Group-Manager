const http = require('http');
const handler = (req, res) => {
  console.log(`[TEST] port=${req.socket.localPort} ${req.method} ${req.url}`);
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({status: 'ok', port: req.socket.localPort, url: req.url}));
};
const port = process.env.PORT || 3000;
http.createServer(handler).listen(port, '0.0.0.0', () => console.log(`Listening on 0.0.0.0:${port}`));
if (port != 80) {
  try { http.createServer(handler).listen(80, '0.0.0.0', () => console.log(`Also listening on 0.0.0.0:80`)); } catch(e) { console.log(`Cannot listen on 80: ${e.message}`); }
}
if (port != 8080) {
  try { http.createServer(handler).listen(8080, '0.0.0.0', () => console.log(`Also listening on 0.0.0.0:8080`)); } catch(e) { console.log(`Cannot listen on 8080: ${e.message}`); }
}
if (port != 1104) {
  try { http.createServer(handler).listen(1104, '0.0.0.0', () => console.log(`Also listening on 0.0.0.0:1104`)); } catch(e) { console.log(`Cannot listen on 1104: ${e.message}`); }
}
