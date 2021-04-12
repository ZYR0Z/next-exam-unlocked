#!/usr/bin/env node

const app = require('./app')
const debug = require('debug')('test:server')
const http = require('http')
const multicastClient = require('./src/classes/multicastclient.js')
multicastClient.init()

// load Config
const env = process.env.NODE_ENV || 'development'
const config = require('./src/config')[env]

const port = config.server.port
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
  const bind = typeof addr === 'string'
    ? 'Pipe ' + addr
    : addr.port
  console.log(`Express Server Listening on locahost:${bind}`)
}
