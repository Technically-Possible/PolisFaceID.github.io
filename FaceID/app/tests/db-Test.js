const faceIdDb = require('../database/db')
const faceId = require('../FaceID')
const db = faceIdDb.db

function StartTest () {
  TestAddUser()
}

function TestAddUser () {
  faceIdDb.AddPerson({ firstName: 'robert', fullName: 'robert holstein', photos: [] })
  faceIdDb.AddPerson({ firstName: 'courtney', fullName: 'courtney rude', photos: [] })
  faceIdDb.AddPerson({ firstName: 'shilo', fullName: 'shilo rude', photos: [] })
  faceIdDb.AddPerson({ firstName: 'audrey', fullName: 'audrey rude', photos: [] })
  //var person = db.get('person').find(i => i.title === 'robert').value()
  //faceId.CreateAlbum(person.title)
}

module.exports = {
  StartTest: StartTest
}
