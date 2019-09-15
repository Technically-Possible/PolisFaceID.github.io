const CONST = require('./Const')
const AWS = require('aws-sdk')
const fs = require('fs')
const path = require('path')
const gm = require('gm')
const faceIdDb = require('./database/db')
const db = faceIdDb.db

AWS.config.loadFromPath(CONST.AWSCONFIG)
var s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  params: { Bucket: CONST.S3BUCKET }
})
const rekognition = new AWS.Rekognition()
const ddb = new AWS.DynamoDB.DocumentClient();

function GetAllPersons(){
  var params = {
    TableName: 'person'
  }

  ddb.scan(params, function(err, data) {
    if (err) {
      console.log("Error", err);
    } else {
      console.log("Success", data);
    }
  });
}

function ProcessImage (fileObject) {
  GetFacesFromImage(fileObject, function (faceDetails) {
    var croppedFaces = 0
    faceDetails.forEach(faceDetail => {
      CropFaceFromPhoto(faceDetail, fileObject, function (croppedFileObject) {
        croppedFaces += 1
        if(croppedFaces === faceDetails.length) {                                                                       // If we have cropped all faces from image delete photo
          DeleteFile(fileObject)
        }
        CompareFace(croppedFileObject, function (comparedFace) {
          var faceMatches = comparedFace.FaceMatches
          var personsMatched = []
          faceMatches.forEach(faceMatch => {
            personsMatched.push(db.get('person').find({ photos: [{ name: faceMatch.Face.ExternalImageId }] }).value())  // Search db for persons images that matched
          })
          if (personsMatched.filter(i => i.name === personsMatched[0].name).length === personsMatched.length) {         // If all images match one person continue
            console.log(`This person is ${personsMatched[0].fullName}`)
            if (faceMatches.filter(i => i.Similarity > 90).length === 5) {                                              // If all photos were over 90% similarity add to face index
              console.log(`five matches for ${personsMatched[0].fullName} over 90% similarity. Adding to face index.`)
              AddPhotoToAlbum(personsMatched[0].firstName, croppedFileObject, function (err, data) {
                if (data) {
                  faceIdDb.AddPhotoById(personsMatched[0].id, data)
                  IndexFace(data, function (data) {
                    console.log(`${personsMatched[0].fullName}'s face has been indexed`)
                    DeleteFile(croppedFileObject)                                                                         // Cropped photo has been upload it. Delete
                  })
                }
              })
            } else {
              // TODO: If there are multiple matches do something....
              DeleteFile(croppedFileObject)
            }
          }
        })
      })
    })
  })
}

// Process the image with aws
function GetFacesFromImage (fileObject, callback) {
  var params = {
    Image: {
      Bytes: new Buffer(fileObject.readFile)
    },
    Attributes: [
      'DEFAULT'
    ]
  }
  rekognition.detectFaces(params, function (err, data) {
    if (err) console.log(err, err.stack) // an error occurred
    else {
      var goodFaces = data.FaceDetails.filter(i => i.Confidence > 94)
      if (goodFaces.length > 0) {
        callback(goodFaces)
      } else {
        console.error(`No faces found in ${fileObject.name}`)
        DeleteFile(fileObject)
      }
    }
  })
}

// Crop faces from photos and save them
function CropFacesFromPhoto (FaceDetails = [], fileObject, callback) {
  var facesCropped = 0
  var croppedFacesFiles = []
  console.log(`cropping ${FaceDetails.length} faces from image ${fileObject.name}`)
  FaceDetails.forEach(face => {
    gm(fileObject.path).size(function (err, size) {
      var croppedFileName = `${Math.round(Math.random() * 10000)}${fileObject.name}`
      this.crop(
        (face.BoundingBox.Width * size.width) * 1.3,
        (face.BoundingBox.Height * size.height) * 1.3,
        (face.BoundingBox.Left * size.width) * 0.9,
        (face.BoundingBox.Top * size.height) * 0.9
      )
        .write(`${CONST.CROPPEDIMAGEFOLDER}/${croppedFileName}`, function (err) {
          if (!err) {
            facesCropped += 1
            console.log(`Face cropped and saved to: ${CONST.CROPPEDIMAGEFOLDER}`)
            var filePath = path.join(CONST.CROPPEDIMAGEFOLDER, `/${croppedFileName}`)
            croppedFacesFiles.push({ readFile: fs.readFileSync(filePath), path: filePath, name: croppedFileName })
            if (facesCropped === FaceDetails.length) {
              DeleteFile(fileObject)
              callback(croppedFacesFiles)
            }
          } else console.log(err)
        })
    })
  })
}

function CropFaceFromPhoto (FaceDetail, fileObject, callback) {
  gm(fileObject.path).size(function (err, size) {
    var croppedFileName = `${Math.round(Math.random() * 10000)}${fileObject.name}`
    this.crop(
      (FaceDetail.BoundingBox.Width * size.width) * 1.3,
      (FaceDetail.BoundingBox.Height * size.height) * 1.3,
      (FaceDetail.BoundingBox.Left * size.width) * 0.9,
      (FaceDetail.BoundingBox.Top * size.height) * 0.9
    )
      .write(`${CONST.CROPPEDIMAGEFOLDER}/${croppedFileName}`, function (err) {
        if (!err) {
          console.log(`Face cropped and saved to: ${CONST.CROPPEDIMAGEFOLDER}`)
          var filePath = path.join(CONST.CROPPEDIMAGEFOLDER, `/${croppedFileName}`)
          callback({ readFile: fs.readFileSync(filePath), path: filePath, name: croppedFileName })
        } else console.error(err)
      })
  })
}

function DeleteFile (fileObject) {
  fs.unlink(fileObject.path, function (err) {
    if (err) throw err
    // if no error, file has been deleted successfully
    console.log(`File ${fileObject.name} deleted!`)
  })
}

//* ************************************************
// Add faces to collection
// EXAMPLE:
// var params = {
//     CollectionId: "myphotos",
//     DetectionAttributes: [
//     ],
//     ExternalImageId: "myphotoid",
//     Image: {
//     Bytes: new Buffer('...')
//      S3Object: {
//       Bucket: "mybucket",
//       Name: "myphoto"
//      }
//     }
// };

// rekognition.indexFaces(params, function(err, data) {
//      if (err) console.log(err, err.stack); // an error occurred
//      else     console.log(data);
// });

function IndexFace (fileObject, callback) {
  var params = {
    CollectionId: CONST.FACEIDCOLLECTION,
    ExternalImageId: fileObject.name,
    Image: {
      Bytes: new Buffer(fileObject.readFile)
    }
  }

  rekognition.indexFaces(params, function (err, data) {
    if (err) console.log(err, err.stack) // an error occurred
    else {
      callback(data.FaceRecords[0].Face)
    }
  })
}

function IndexFaceInBucket (photoInfo, callback) {
  var params = {
    CollectionId: CONST.FACEIDCOLLECTION,
    ExternalImageId: photoInfo.name,
    Image: {
      S3Object: {
        Bucket: CONST.S3BUCKET,
        Name: photoInfo.key
      }
    }
  }

  rekognition.indexFaces(params, function (err, data) {
    if (err) console.log(err, err.stack) // an error occurred
    else {
      callback(data.FaceRecords[0].Face)
    }
  })
}

//* ************************************************

//* ************************************************
// Create a database that puts faceids to names
//* ************************************************

//* ************************************************
// Take photos with camera when faces are detected
// If motion is detected take photo
// ?? check if photo has face in it OR just send
// ?? image to SearchFacesByImage...
//* ************************************************

//* ************************************************
// Search collection for faceid that match photo
// EXAMPLE:
// var params = {
//     CollectionId: "myphotos",
//     FaceMatchThreshold: 95,
//     Bytes: new Buffer('...')
//     Image: {
//      S3Object: {
//       Bucket: "mybucket",
//       Name: "myphoto"
//      }
//     },
//     MaxFaces: 5
//    };
//    rekognition.searchFacesByImage(params, function(err, data) {
//      if (err) console.log(err, err.stack); // an error occurred
//      else     console.log(data);           // successful response
//    });

function CompareFace (fileObject, callback) {
  var params = {
    CollectionId: 'FaceID-collection',
    FaceMatchThreshold: 89,
    Image: {
      Bytes: new Buffer(fileObject.readFile)
    },
    MaxFaces: 5
  }
  rekognition.searchFacesByImage(params, function (err, data) {
    if (err) console.log(err, err.stack) // an error occurred
    else {
      // DeleteFile(fileObject);
      callback(data)
    }
  })
}

//* ************************************************

function IndexAlbumPhotosOnAWS () {
  ListAlbums(function (data) {
    data.forEach(album => {
      ViewAlbum(album.slice(0, -1), function (data) {
        var person = db.get('person').find(i => i.firstName === album.slice(0, -1)).value()
        data.forEach(photoInfo => {
          IndexFace(photoInfo, function (data) {
            faceIdDb.AddPhotoById(person.id, photoInfo)
            data.forEach(photoIndexed => {
              console.log(`${photoIndexed.ExternalImageId} has been indexed`)
            })
          })
        })
      })
    })
  })
}

function IndexAlbumPhotos () {
  fs.readdir(CONST.REFIMAGEFOLDER, function (err, folders) {
    folders.forEach(folder => {
    var person = db.get('person').find(i => i.firstName === folder).value()
      fs.readdir(`${CONST.REFIMAGEFOLDER}/${folder}`, function (err, files) {
        files.forEach(file => {  
          var filePath = path.join(`${CONST.REFIMAGEFOLDER}/${folder}`, `/${file}`)
          var readFile = fs.readFileSync(filePath)
          var fileObject = { readFile: readFile, path: filePath, name: file }
          IndexFace(fileObject, function (data) {
            faceIdDb.AddPhotoById(person.id, fileObject)
            console.log(`${data.ExternalImageId} has been indexed`)
          })
        })
      })
    });
  })
}

function UploadPhoto (albumName, fileObject, callback) {
  var albumPhotosKey = encodeURIComponent(albumName) + '/'

  var photoKey = albumPhotosKey + fileObject.name
  s3.upload({
    Key: photoKey,
    Body: new Buffer(fileObject.readFile),
    ACL: 'public-read',
    ContentType: 'binary'
  }, function (err, data) {
    if (err) {
      console.error('There was an error uploading your photo: ', err.message)
    } else {
      console.log('Successfully uploaded photo.')
      callback(data)
    }
  })
}

function AddPhotoToAlbum (albumName, fileObject, callback) {
  var newFilePath = `${CONST.REFIMAGEFOLDER}/${albumName}/${fileObject.name}`
  fs.copyFile(fileObject.path, newFilePath, function (err) {
    if (err) {
      console.error("error copying file", err)
      callback(err, null)
    } else {
      callback( null, { readFile: fs.readFileSync(newFilePath), name: fileObject.name, path: newFilePath })
    }
  })
}

// Delte photo
function DeletePhoto (albumName, photoKey) {
  s3.deleteObject({ Key: photoKey }, function (err, data) {
    if (err) {
       console.error('There was an error deleting your photo: ', err.message)
       return
    }
    console.log('Successfully deleted photo.')
    viewAlbum(albumName)
  })
}

function CreateAlbum (albumName) {
  albumName = albumName.trim()
  if (!albumName) {
    console.error('Album names must contain at least one non-space character.')
    return
  }
  if (albumName.indexOf('/') !== -1) {
    console.error('Album names cannot contain slashes.')
    return
  }
  var albumKey = encodeURIComponent(albumName) + '/'
  s3.headObject({ Key: albumKey }, function (err, data) {
    if (!err) {
      console.error(`${albumKey} already exists`)
      return
    }
    if (err.code !== 'NotFound') {
      console.error('There was an error creating your album: ' + err.message)
      return
    }
    s3.putObject({ Key: albumKey }, function (err, data) {
      if (err) {
        console.error('There was an error creating your album: ' + err.message)
      } else {
        console.log('Successfully created album.')
        ViewAlbum(albumName)
      }
    })
  })
}

function ViewAlbum (albumName, callback) {
  var albumPhotosKey = encodeURIComponent(albumName) + '/'
  s3.listObjects({ Prefix: albumPhotosKey }, function (err, data) {
    if (err) {
      console.error('There was an error viewing your album: ' + err.message)
      return
    }

    var href = this.request.httpRequest.endpoint.href // `this` references the AWS.Response instance that represents the response
    var bucketUrl = href + CONST.S3BUCKET + '/'
    var photos = data.Contents
    var photoInfos = []
    for (let i = 1; i < photos.length; i++) {
      var photoUrl = bucketUrl + encodeURIComponent(photos[i].Key)
      var splitKeyName = photos[i].Key.split('/')
      var fileName = splitKeyName[1]
      var album = splitKeyName[0]
      photoInfos.push({ key: photos[i].Key, url: photoUrl, name: fileName, album: album })
    }
    callback(photoInfos)
  })
}

function ListAlbums (callback) {
  s3.listObjects({ Delimiter: '/' }, function (err, data) {
    if (err) {
      console.error('There was an error listing your albums: ' + err.message)
    } else {
      var prefixes = []
      var albums = data.CommonPrefixes.map(function (album) {
        prefixes.push(album.Prefix)
      })
      callback(prefixes)
    }
  })
}

module.exports = {
  ProcessImage: ProcessImage,
  GetFacesFromImage: GetFacesFromImage,
  CropFacesFromPhoto: CropFacesFromPhoto,
  CropFaceFromPhoto: CropFaceFromPhoto,
  DeleteFile: DeleteFile,
  IndexFace: IndexFace,
  CompareFace: CompareFace,
  UploadPhoto: UploadPhoto,
  DeletePhoto: DeletePhoto,
  CreateAlbum: CreateAlbum,
  ViewAlbum: ViewAlbum,
  ListAlbums: ListAlbums,
  IndexAlbumPhotos: IndexAlbumPhotos,
  GetAllPersons: GetAllPersons
}
