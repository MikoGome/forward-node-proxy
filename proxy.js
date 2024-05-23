const http = require("http");
const https = require("https");
const net = require('net');

const fs = require('fs');

const PORT = process.env.PORT || 8080;

const app = (req, res) => {
  const url = req.url;
  let data = [];
  req.on('data', chunk => data.push(chunk));
  req.on('end', async () => {
    const options = {
      method: req.method,
      headers: req.headers,
      gzip: true
    }
    if(data.length) options.body = String(Buffer.concat(data));

    const proxy = http.request(url, options, response => {
      const finalRes = response.pipe(res, {
        end: true
      });
      finalRes.writeHead(response.statusCode, response.headers);
    });
    
    req.pipe(proxy, {
      end: true
    });

    //ERROR HANDLING
    // Handle proxy request errors
    proxy.on('error', err => {
      console.error('Proxy request error:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    });

     // Handle request errors (e.g., invalid URL)
    req.on('error', err => {
      console.error('Client request error:', err);
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
    });
    
  });
};

const httpServer = http.createServer(app);

httpServer.on('connect', (req, clientSocket, head) => { // listen only for HTTP/1.1 CONNECT method
  const splitIdx = req.url.indexOf(':', 6);
  const [hostname, port] = splitIdx === -1 ? [req.url, 433] : [req.url.slice(0, splitIdx), Number(req.url.slice(splitIdx + 1))];
  if (hostname && port) {
    const serverErrorHandler = (err) => {
      console.error(err.message)
      if (clientSocket) {
        clientSocket.end(`HTTP/1.1 500 ${err.message}\r\n`)
      }
    }
    const serverEndHandler = () => {
      if (clientSocket) {
        clientSocket.end(`HTTP/1.1 500 External Server End\r\n`)
      }
    }
    const serverSocket = net.connect(port, hostname) // connect to destination host and port
    const clientErrorHandler = (err) => {
      console.error(err.message)
      if (serverSocket) {
        serverSocket.end()
      }
    }
    const clientEndHandler = () => {
      if (serverSocket) {
        serverSocket.end()
      }
    }
    clientSocket.on('error', clientErrorHandler)
    clientSocket.on('end', clientEndHandler)
    serverSocket.on('error', serverErrorHandler)
    serverSocket.on('end', serverEndHandler)
    serverSocket.on('connect', () => {
      clientSocket.write([
        'HTTP/1.1 200 Connection Established',
        //'Proxy-agent: Node-VPN',
      ].join('\r\n'))
      clientSocket.write('\r\n\r\n') // empty body
      // "blindly" (for performance) pipe client socket and destination socket between each other
      serverSocket.pipe(clientSocket, {end: false})
      clientSocket.pipe(serverSocket, {end: false})
    })
  } else {
    clientSocket.end('HTTP/1.1 400 Bad Request\r\n')
    clientSocket.destroy()
  }
})

httpServer.listen(PORT, () => console.log("HTTP Proxy started at port " + PORT));
