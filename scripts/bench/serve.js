// Usage: node serve.js <dir> <port>
// A small static server for a built copy of the app (public/ after `pnpm build`), with Range requests so video clips seek and play. Used by ab.sh to
// serve the baseline and the new build side by side; the app boots without its API, so both run on the same offline defaults.
const http = require('http')
const fs = require('fs')
const path = require('path')

const [dir, port] = [process.argv[2], Number(process.argv[3])]
if (!dir || !port) { console.log('usage: node serve.js <dir> <port>'); process.exit(1) }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ico': 'image/x-icon', '.wav': 'audio/wav', '.woff2': 'font/woff2' }

http.createServer((request, response) => {
  const url = decodeURIComponent(request.url.split('?')[0])
  let file = path.join(dir, url.endsWith('/') ? `${url}index.html` : url)
  if (!file.startsWith(path.resolve(dir))) { response.writeHead(403).end(); return }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dir, 'index.html')
  const { size } = fs.statSync(file)
  const type = TYPES[path.extname(file)] || 'application/octet-stream'
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.range || '')
  if (range) {
    const start = range[1] ? Number(range[1]) : 0
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    response.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 })
    fs.createReadStream(file, { start, end }).pipe(response)
    return
  }
  response.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' })
  fs.createReadStream(file).pipe(response)
}).listen(port, () => console.log(`serving ${dir} on ${port}`))
