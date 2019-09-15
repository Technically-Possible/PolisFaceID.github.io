const path = require('path')
const IMAGEFOLDER = path.join(__dirname, '../images')
const CROPPEDIMAGEFOLDER = path.join(__dirname, '../cropped-images')
const REFIMAGEFOLDER = path.join(__dirname, '../ref-images')
const JSONDB = path.join(__dirname, './database/db.json')
const AWSCONFIG = path.join(__dirname, '../aws-config.json')
const S3BUCKET = 'faceid-bucket'
const FACEIDCOLLECTION = 'FaceID-collection'

module.exports = {
  IMAGEFOLDER: IMAGEFOLDER,
  CROPPEDIMAGEFOLDER: CROPPEDIMAGEFOLDER,
  JSONDB: JSONDB,
  AWSCONFIG: AWSCONFIG,
  S3BUCKET: S3BUCKET,
  FACEIDCOLLECTION: FACEIDCOLLECTION,
  REFIMAGEFOLDER: REFIMAGEFOLDER
}
