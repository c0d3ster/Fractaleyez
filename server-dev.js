import path from 'path'
import express from 'express'
import bodyParser from 'body-parser'
import { presets } from './src/config/presets'
import { firebaseConfig } from './src/settings.ts'
import { initializeApp } from 'firebase/app'
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore'


const firebase = initializeApp(firebaseConfig);
const db = getFirestore(firebase);

const BUILD_DIR = path.join(__dirname, 'public/')

const app = express()

app.use(express.static(BUILD_DIR))
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

app.get('/api/getConfigDefaults', (req, res) => res.send(presets.default))

app.post('/api/saveConfig/:key', async (req, res) => {
  const { name, config } = req.body
  const docRef = doc(db, 'presets', req.params.key)

  const docSnap = await setDoc(docRef, {
    name,
    config,
  })

  console.log('Document: ', docSnap)
  res.status(200).send({ success: true })
})

app.get('/api/getConfig/:key', async (req, res) => {
  // const name = presets[req.params.name]
  console.log(`get ${req.params.key} initiated`)
  const docRef = doc(db, 'presets', req.params.key)
  const docSnap = await getDoc(docRef)
  
  if (docSnap.exists()) {
    console.log('Document data:', docSnap.data())
    res.send(docSnap.data().config)
  } else {
    res.status(404).send(`${req.params.key} preset could not be found`)
  }
})

app.listen(8080, () => console.info('Listening on port 8080!'))
