const path = require('path');
const fs = require('fs');
const express = require('express');
const https = require('https');

const BUILD_DIR = path.join(__dirname, 'public/');
const SSL_DIR = '/etc/letsencrypt/live/fractaleyez.com/';
const PORT = 443;

const options = {
  key: fs.readFileSync(path.join(SSL_DIR, 'privkey.pem')),
  cert: fs.readFileSync(path.join(SSL_DIR, 'fullchain.pem'))
}

const app = express();
const server = https.createServer(options, app);

app.use(express.static(BUILD_DIR));

app.get('*', function(req, res) {
    res.sendFile(path.join(BUILD_DIR, "index.html"));
});

const configDefault = {"user":{"speed":{"name":"Speed","type":"slider","defaultValue":2,"value":2,"min":0,"max":40,"step":0.5},"rotationSpeed":{"name":"Rotation Speed","type":"slider","defaultValue":2,"value":2,"min":-50,"max":50,"step":0.25},"scaleFactor":{"name":"Scale Factor","type":"slider","defaultValue":1500,"value":1500,"min":100,"max":2000,"step":100},"cameraBound":{"name":"Camera Bound","type":"slider","defaultValue":100,"value":0,"min":0,"max":500,"step":20}},"audio":{"soundThreshold":{"name":"Sound Threshold","type":"slider","defaultValue":2,"value":2,"min":0,"max":5,"step":0.1},"ignoreTime":{"name":"Ignore Time","type":"slider","defaultValue":250,"value":250,"min":0,"max":2500,"step":50}},"effects":{"cyclone":{"name":"Cyclone","type":"checkbox","defaultValue":true,"value":true},"wobWob":{"name":"Wob Wob","type":"checkbox","defaultValue":true,"value":true},"switcheroo":{"name":"Switcheroo","type":"checkbox","defaultValue":true,"value":true},"colorShift":{"name":"Color Shift","type":"checkbox","defaultValue":true,"value":true},"glow":{"name":"Glow","type":"checkbox","defaultValue":true,"value":true},"shockwave":{"name":"Shockwave","type":"checkbox","defaultValue":true,"value":false}},"orbit":{"a":{"name":"A","type":"slider","defaultValue":2.5,"value":2.5,"min":1,"max":10,"step":0.1},"b":{"name":"B","type":"slider","defaultValue":0.5,"value":0.5,"min":0,"max":1,"step":0.01},"c":{"name":"C","type":"slider","defaultValue":5.5,"value":5.5,"min":5,"max":6,"step":0.1},"d":{"name":"D","type":"slider","defaultValue":0.5,"value":0.5,"min":0,"max":1,"step":0.1},"e":{"name":"E","type":"slider","defaultValue":0.5,"value":0.5,"min":0,"max":1,"step":0.1}},"particle":{"particleSize":{"name":"Particle Size","type":"slider","defaultValue":10,"value":10,"min":1,"max":200,"step":1},"particlesPerLayer":{"name":"Particles Per Layer","type":"slider","defaultValue":7500,"value":7500,"min":1,"max":15000,"step":1},"layers":{"name":"Layers","type":"slider","defaultValue":5,"value":5,"min":1,"max":20,"step":1},"levels":{"name":"Levels","type":"slider","defaultValue":5,"value":5,"min":1,"max":20,"step":1}}}

app.get("/api/getConfigDefaults", (req, res) =>
  res.send(configDefault)
);

server.listen(PORT, () => console.log("Node server listening on port " + PORT));

// Redirect from http port 80 to https
var http = require('http');
http.createServer(function (req, res) {
    res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
    res.end();
}).listen(80);
