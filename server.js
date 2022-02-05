#!/usr/bin/env node
const app = require('./app')
const http = require('http')


// load Config
const config = require('./src/config')

const port = config.port
app.set('port', port)

/**
 * Create HTTP server.
 */
const server = http.createServer(app)
server.listen(port)
server.on('error', onError)
server.on('listening', onListening)




/**
 * Event listener for HTTP server "error" event.
 */
function onError (error) {
  if (error.syscall !== 'listen') {
    throw error
  }

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error('Port ' + port + ' requires elevated privileges')
      process.exit(1)
    case 'EADDRINUSE':
      console.error('Port ' + port + ' is already in use')
      process.exit(1)
    default:
      throw error
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */
function onListening () {
  const addr = server.address()
  console.log(`Express Server Listening on locahost:${addr.port}`)
}
