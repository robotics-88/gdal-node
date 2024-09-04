const axios = require('axios')
const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')
const  utmObj  = require('utm-latlng')
const gdal = require('gdal')

// Define directories
const DOWNLOAD_FOLDER = path.resolve(__dirname, 'downloads')
const REPROJECTED_FOLDER = path.resolve(__dirname, 'reprojected')

// Ensure directories exist
if (!fs.existsSync(DOWNLOAD_FOLDER)) {
  fs.mkdirSync(DOWNLOAD_FOLDER)
}
if (!fs.existsSync(REPROJECTED_FOLDER)) {
  fs.mkdirSync(REPROJECTED_FOLDER)
}

// Function to calculate the Euclidean distance between two UTM points
function calculateDistance(point1, point2) {
  let dx = point1.utmX - point2.utmX
  let dy = point1.utmY - point2.utmY
  return Math.sqrt(dx * dx + dy * dy)
}

// Function to make the API request and get the GeoTIFF download URLs
async function fetchGeoTIFFUrls(apiUrl) {
  try {
    let response = await axios.get(apiUrl)
    return response.data.items.map(item => item.downloadURL)
  } catch (error) {
    console.error('Failed to fetch GeoTIFF URLs:', error.message)
    throw error
  }
}

// Function to download a GeoTIFF file
async function downloadGeoTIFF(url, outputPath) {
  return new Promise(async (resolve, reject) => {
    try {
      let response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
      })

      // Create a writable stream to the output path
      let writer = fs.createWriteStream(outputPath)

      // Pipe the response data to the writable stream
      response.data.pipe(writer)

      // Handle the 'finish' event to resolve the promise when the file is fully written
        //this slows things down, but the next step fails if the download isn't complete
      writer.on('finish', () => {
        console.log(`File downloaded successfully to ${outputPath}`)
        resolve()
      })

      // Handle the 'error' event to reject the promise if an error occurs
      writer.on('error', (err) => {
        console.error('Failed to download GeoTIFF:', err.message)
        reject(err)
      })

    } catch (error) {
      console.error('Failed to download GeoTIFF:', error.message)
      reject(error)
    }
  })
}

// Function to get GeoTIFF metadata (assuming it returns UTM coordinates)
  //IS THIS SAFE TO ASSUME?  With the 1m resolution it seems fairly consistent
async function getGeoTIFFMetadata(filePath) {
  try {
    let dataset = gdal.open(filePath)
    let geoTransform = dataset.geoTransform
    let crs = dataset.srs.toProj4()
    let x = geoTransform[0] + geoTransform[1] * (dataset.rasterSize.x / 2)
    let y = geoTransform[3] + geoTransform[5] * (dataset.rasterSize.y / 2)
    return { utmX: x, utmY: y, crs }
  } catch (err) {
    throw new Error(`Failed to read metadata: ${err.message}`)
  }
}

// Function to merge GeoTIFFs
function mergeGeoTIFFs(outputFilePath) {
  return new Promise((resolve, reject) => {
    fs.readdir(DOWNLOAD_FOLDER, (err, files) => {
      if (err) {
        return reject(`Failed to read download folder: ${err.message}`)
      }

      let tiffFiles = files.filter(file => file.endsWith('.tif')).map(file => path.join(DOWNLOAD_FOLDER, file))
      if (tiffFiles.length === 0) {
        return reject('No TIFF files found to merge')
      }

      let mergeCommand = `gdal_merge.py -co CHECK_DISK_FREE_SPACE=FALSE -o ${outputFilePath} ${tiffFiles.join(' ')}`

      exec(mergeCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error merging GeoTIFFs: ${stderr}`)
          reject(error)
        } 
        else {
          console.log(`GeoTIFFs merged into ${outputFilePath}`)
          resolve(outputFilePath)
        }
      })
    })
  })
}


// Function to crop the merged GeoTIFF
function cropGeoTIFF(inputFilePath, outputFilePath, bbox) {
  return new Promise((resolve, reject) => {
    let { minX, minY, maxX, maxY } = bbox
    //Alternatively, we could handle this on the client side and send the bounding box in UTM in the first place... we can decide that later
    let utm = new utmObj()
    let minUtm = utm.convertLatLngToUtm(minY, minX, 6)
    let maxUtm = utm.convertLatLngToUtm(maxY, maxX, 6)
    let cropCommand = `gdalwarp -te ${minUtm.Easting} ${minUtm.Northing} ${maxUtm.Easting} ${maxUtm.Northing} ${inputFilePath} ${outputFilePath}`

    exec(cropCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error cropping GeoTIFF: ${stderr}`)
        reject(error)
      } 
      else {
        console.log(`GeoTIFF cropped to ${outputFilePath}`)
        resolve(outputFilePath)
      }
    })
  })
}

// Function to reproject GeoTIFF
function reprojectGeoTIFF(inputFilePath, outputFilePath, targetCRS) {
  return new Promise((resolve, reject) => {
    let reprojectCommand = `gdalwarp -t_srs ${targetCRS} ${inputFilePath} ${outputFilePath}`

    exec(reprojectCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error reprojecting GeoTIFF: ${stderr}`)
        reject(error)
      } 
      else {
        console.log(`GeoTIFF reprojected to ${outputFilePath}`)
        resolve(outputFilePath)
      }
    })
  })
}

// Function to delete all files in a given folder
function deleteFilesInFolder(folderPath) {
  return new Promise((resolve, reject) => {
    fs.readdir(folderPath, (err, files) => {
      if (err) {
        return reject(`Failed to read folder: ${err.message}`)
      }

      let deletePromises = files.map(file => {
        let filePath = path.join(folderPath, file)
        return new Promise((res, rej) => {
          fs.unlink(filePath, err => {
            if (err) {
              console.error(`Failed to delete ${filePath}: ${err.message}`)
              return rej(err)
            }
            console.log(`Deleted ${filePath}`)
            res()
          })
        })
      })

      Promise.all(deletePromises)
        .then(() => {
          // Optionally, delete the folder itself if needed
          fs.rmdir(folderPath, { recursive: true }, (err) => {
            if (err) {
              console.error(`Failed to delete folder ${folderPath}: ${err.message}`)
              return reject(err)
            }
            console.log(`Deleted folder ${folderPath}`)
            resolve()
          })
        })
        .catch(reject)
    })
  })
}

// Function to clean up downloaded GeoTIFF files and the 'reprojected' folder
async function cleanupDownloadedFiles() {
  try {
    await deleteFilesInFolder(DOWNLOAD_FOLDER)
    console.log(`Cleaned up download folder: ${DOWNLOAD_FOLDER}`)
    
    let REPROJECTED_FOLDER = path.join(__dirname, 'reprojected')
    await deleteFilesInFolder(REPROJECTED_FOLDER)
    console.log(`Cleaned up reprojected folder: ${REPROJECTED_FOLDER}`)
  } catch (error) {
    console.error(`Cleanup failed: ${error}`)
  }
}
// Main function to process GeoTIFFs 
  //THIS IS VERY UNTESTED -- it runs, but I don't know yet if it is doing what I hope
  // the example burnUnit I've been working with only pulls one map so this just runs right through
async function processGeoTIFFs() {
  let files = fs.readdirSync(DOWNLOAD_FOLDER).filter(file => file.endsWith('.tif'))
  
  if (files.length === 0) {
    console.log('No GeoTIFF files found.')
    return
  }

  let centerPoints = []
  
  for (let file of files) {
    let filePath = path.join(DOWNLOAD_FOLDER, file)
    try {
      let { utmX, utmY, crs } = await getGeoTIFFMetadata(filePath)
      console.log(`Processing ${file}: UTM (${utmX}, ${utmY}), CRS: ${crs}`)
      
      let isWithin1km = false
      let utmPoint = { utmX, utmY }

      for (let existingPoint of centerPoints) {
        let distance = calculateDistance(utmPoint, existingPoint.utmPoint)
        if (distance < 1000) {
          isWithin1km = true
          if (existingPoint.hasKnownCRS) {
            console.log(`Discarding ${file} as it overlaps with ${existingPoint.file}`)
            fs.unlinkSync(filePath)
          } 
          else {
            console.log(`Keeping ${file} and discarding ${existingPoint.file}`)
            fs.unlinkSync(existingPoint.filePath)
            existingPoint.file = file
            existingPoint.filePath = filePath
            existingPoint.utmPoint = utmPoint
            existingPoint.hasKnownCRS = crs !== 'Unknown'
          }
          break
        }
      }

      if (!isWithin1km) {
        centerPoints.push({ file, filePath, utmPoint, hasKnownCRS: crs !== 'Unknown' })
      }
    } catch (err) {
      console.error(`Failed to process ${file}: ${err.message}`)
    }
  }

  for (let i = 0; i < centerPoints.length; i++) {
    for (let j = i + 1; j < centerPoints.length; j++) {
      let distance = calculateDistance(centerPoints[i].utmPoint, centerPoints[j].utmPoint)
      if (distance >= 1000) {
        console.error(`Error: ${centerPoints[i].file} and ${centerPoints[j].file} are more than 1 km apart.`)
        return
      }
    }
  }

  console.log('All GeoTIFF files processed successfully!')
}

// Run the dang thing...
(async () => {
  // Initialize bbox with extreme values
  let bbox = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  }

  let args = process.argv.slice(2)

  if (args.length === 0 || args.length % 2 !== 0) {
      console.log('Usage: npm run start-with-args -- <latitude1> <longitude1> <latitude2> <longitude2> ...');
      process.exit(1);
  }

  // Concatenate all lat/lng pairs into a single string separated by spaces
  let coordinatesString = ''
  for (let i = 0; i < args.length; i += 2) {
    let longitude = parseFloat(args[i])
    let latitude = parseFloat(args[i + 1])

    // Update bbox with current latitude and longitude
    if (longitude < bbox.minX) bbox.minX = longitude
    if (longitude > bbox.maxX) bbox.maxX = longitude
    if (latitude < bbox.minY) bbox.minY = latitude
    if (latitude > bbox.maxY) bbox.maxY = latitude

    coordinatesString += `${longitude}%20${latitude},`
  }

  // Trim any trailing space
  coordinatesString = coordinatesString.trim()

  // Remove the last comma, if present
  if (coordinatesString.endsWith(',')) {
    coordinatesString = coordinatesString.slice(0, -1);
  }

  // Construct the API URL with the concatenated coordinates string
  console.log('Constructed coordinates string: ', coordinatesString)
  console.log('bbox: ', bbox)
  let apiUrl = `https://tnmaccess.nationalmap.gov/api/v1/products?polygon=${coordinatesString}&datasets=Digital%20Elevation%20Model%20%28DEM%29%201%20meter&prodFormats=GeoTIFF&outputFormat=JSON`
  
  console.log('Constructed apiurl: ', apiUrl)
  

  try {
    let urls = await fetchGeoTIFFUrls(apiUrl)
    console.log(urls)
   // Use Promise.all to wait for all downloads to complete
   await Promise.all(
      urls.map(async (url) => {
        let fileName = path.basename(url)
        let outputPath = path.join(DOWNLOAD_FOLDER, fileName)
        await downloadGeoTIFF(url, outputPath)
      })
    )

    //await processGeoTIFFs()

    let files = fs.readdirSync(DOWNLOAD_FOLDER).filter(file => file.endsWith('.tif'))
    if (files.length > 1) {
      let mergedFilePath = path.resolve(__dirname, 'merged.tif')
      await mergeGeoTIFFs(mergedFilePath)

      let croppedFilePath = path.resolve(__dirname, 'cropped.tif')
      await cropGeoTIFF(mergedFilePath, croppedFilePath, bbox)

      // let reprojectedFilePath = path.resolve(REPROJECTED_FOLDER, 'reprojected.tif')
      // await reprojectGeoTIFF(croppedFilePath, reprojectedFilePath, 'EPSG:4326')
    } 
    else if (files.length === 1) {
      let singleFilePath = path.join(DOWNLOAD_FOLDER, files[0])
      let croppedFilePath = path.resolve(__dirname, 'cropped.tif')
      await cropGeoTIFF(singleFilePath, croppedFilePath, bbox)

      // let reprojectedFilePath = path.resolve(REPROJECTED_FOLDER, 'reprojected.tif')
      // await reprojectGeoTIFF(croppedFilePath, reprojectedFilePath, 'EPSG:4326')
    }

    await cleanupDownloadedFiles()

    console.log('Processing completed successfully.')
  } catch (error) {
    console.error('An error occurred during processing:', error.message)
  }
})()