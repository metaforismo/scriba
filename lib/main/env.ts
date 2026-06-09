import { app } from 'electron'
import path from 'path'

let stage = process.env.SCRIBA_ENV || import.meta.env.VITE_SCRIBA_ENV
if (!stage && import.meta.env.DEV) {
  stage = 'local'
}
if (!stage) {
  throw new Error('SCRIBA_ENV or VITE_SCRIBA_ENV must be set to dev or prod')
}

const userDataDir = path.join(app.getPath('appData'), `Scriba-${stage}`)
app.setPath('userData', userDataDir)

if (stage !== 'prod') {
  app.setName(`Scriba (${stage})`)
}

export const SCRIBA_ENV = stage
