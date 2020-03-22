import path from 'path'
import express from "express"
import bodyParser from "body-parser"
import { presets } from './src/config/presets'

const BUILD_DIR = path.join(__dirname, 'public/');

const app = express();

app.use(express.static(BUILD_DIR));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get("/api/getConfigDefaults", (req, res) =>
  res.send(presets.default)
);

app.get("/api/getConfig/:name", (req, res) => {
  const name = presets[req.params.name]
  if(name) {
    res.send(name)
  } else {
    res.status(404).send(`${req.params.name} preset could not be found`)
  }
});

app.listen(8080, () => console.log("Listening on port 8080!"));
