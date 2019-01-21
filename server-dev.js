const path = require('path');
const express = require("express");
const os = require("os");

const app = express();

const BUILD_DIR = path.join(__dirname, 'public/');

app.use(express.static(BUILD_DIR));

app.get("/api/getUsername", (req, res) =>
  res.send({ username: os.userInfo().username })
);
app.listen(8080, () => console.log("Listening on port 8080!"));
