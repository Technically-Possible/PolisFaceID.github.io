const CONST = require('../Const')
const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const adapter = new FileSync(CONST.JSONDB)
const db = low(adapter)

db.defaults({ person: [{ id: 0, firstName: '', fullName: '', photos: [] }], count: 0 })
  .write()

function AddPerson (person) {
  var userCount = db.get('count').value() // string or number?
  db.get('person')
    .push({ id: userCount + 1, firstName: person.firstName, fullName: person.fullName, photos: person.photos })
    .write()

  UpdateUserCount()
}

function UpdateUserCount () {
  db.update('count', n => n + 1)
    .write()
}

function AddPhotoById (personId, photoInfo) {
  var photos = db
    .get('person')
    .find({ id: personId })
    .get('photos')
    .value()

  photos.push({ name: photoInfo.name, path: photoInfo.path })

  db.get('person')
    .find({ id: personId })
    .assign({ photos })
    .write()

  console.log(`${photoInfo.name} added to user ${personId}'s photos`)
}

function AddPhotoByName (personFirstName, photosInfo) {
  var photos = db
    .get('person')
    .find({ firstName: personFirstName })
    .get('photos')
    .value()

  photos.push(photosInfo)

  db.get('person')
    .find({ id: personId })
    .assign({ photos })
    .write()
}

module.exports = {
  AddPerson: AddPerson,
  UpdateUserCount: UpdateUserCount,
  AddPhotoById: AddPhotoById,
  AddPhotoByName: AddPhotoByName,
  db: db
}
