const path = require('path');
const express = require('express');
const app = express();

const DIST_DIR = path.join(__dirname, 'public/');
const PORT = 3000;

app.use(express.static(DIST_DIR));

app.get('*', function(req, res) {
    res.sendFile(path.join(DIST_DIR, "index.html"));
});

app.listen(PORT, () => console.log("Node server listening on port " + PORT));
