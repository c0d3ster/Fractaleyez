const path = require('path')
const fs = require('fs')
const express = require('express')
const https = require('https')

const BUILD_DIR = path.join(__dirname, 'public/')
const SSL_DIR = '/etc/letsencrypt/live/fractaleyez.com/'
const PORT = 443

const options = {
  key: fs.readFileSync(path.join(SSL_DIR, 'privkey.pem')),
  cert: fs.readFileSync(path.join(SSL_DIR, 'fullchain.pem'))
}

const app = express()
const server = https.createServer(options, app)

app.use(express.static(BUILD_DIR))

app.get('*', (req, res) => {
  res.sendFile(path.join(BUILD_DIR, 'index.html'))
})

app.get('/api/getConfigDefaults', (req, res) =>
  res.send(configs.default)
)

app.get('/api/getConfig/:name', (req, res) => {
  res.send(configs[req.params.name])
})

server.listen(PORT, () => console.info('Node server listening on port ' + PORT))

// Redirect from http port 80 to https
const http = require('http')
http.createServer((req, res) => {
  res.writeHead(301, { 'Location': 'https://' + req.headers.host + req.url })
  res.end()
}).listen(80)
