const http = require("http");
const https = require("https");
const net = require('net');

const fs = require('fs');
const {pipeline} = require('stream/promises');

const app = (req, res) => {
  const url = req.url;
  let data = [];
  req.on('data', chunk => data.push(chunk));
  req.on('end', async () => {
    const options = {
      method: req.method,
      headers: req.headers,
    }
    if(data.length) options.body = Buffer.concat(data);
    const response = await fetch(url, options);
    const headers = Object.fromEntries(response.headers);
    res.writeHead(response.status, headers);
    if(response.body) await pipeline(response.body, res);
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

httpServer.listen(8080, () => console.log("HTTP Proxy started at port 8080"));