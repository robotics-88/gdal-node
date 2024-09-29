const axios = require('axios')
const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')
const  utmObj  = require('utm-latlng')

// Define directories
const DOWNLOAD_FOLDER = path.resolve(__dirname, 'downloads')
const croppedFilePath = '/host/cropped/cropped.tif';

// Ensure directory exists
if (!fs.existsSync(DOWNLOAD_FOLDER)) {
  fs.mkdirSync(DOWNLOAD_FOLDER)
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

//dynamically adjust filename if old files weren't cleared out
function generateUniqueFilename(filePath) {
  let ext = path.extname(filePath) // Get the file extension (e.g., '.tif')
  let baseName = path.basename(filePath, ext) // Get the base name (e.g., 'merged')
  let dirName = path.dirname(filePath) // Get the directory name

  let uniqueFilePath = filePath
  let counter = 1

  // Loop until a unique filename is found
  while (fs.existsSync(uniqueFilePath)) {
    uniqueFilePath = path.join(dirName, `${baseName}_${counter}${ext}`)
    counter++
  }

  return uniqueFilePath
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

// Function to delete all files in a given folder without deleting the folder itself
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

      // Wait for all delete operations to finish
      Promise.all(deletePromises)
        .then(() => {
          console.log(`Deleted all files in folder ${folderPath}, but kept the folder`)
          resolve()
        })
        .catch(reject)
    })
  })
}

// Function to clean up downloaded GeoTIFF files
async function cleanupDownloadedFiles() {
  try {
    await deleteFilesInFolder(DOWNLOAD_FOLDER)
    console.log(`Cleaned up download folder: ${DOWNLOAD_FOLDER}`)
    
  } catch (error) {
    console.error(`Cleanup failed: ${error}`)
  }
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
    console.log('Usage: npm run start-with-args -- <latitude1> <longitude1> <latitude2> <longitude2> ...')
    process.exit(1)
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
    coordinatesString = coordinatesString.slice(0, -1)
  }

  // Construct the API URL with the concatenated coordinates string
  let apiUrl = `https://tnmaccess.nationalmap.gov/api/v1/products?polygon=${coordinatesString}&datasets=Digital%20Elevation%20Model%20%28DEM%29%201%20meter&prodFormats=GeoTIFF&outputFormat=JSON`

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

    let files = fs.readdirSync(DOWNLOAD_FOLDER).filter(file => file.endsWith('.tif'))

    if (files.length > 1) {
      let mergedFilePath = path.resolve(__dirname, 'merged.tif')
      mergedFilePath = generateUniqueFilename(mergedFilePath) // Generate a unique filename
      await mergeGeoTIFFs(mergedFilePath)
      
      const croppedDir = '/host/cropped'
      if (!fs.existsSync(croppedDir)) {
        fs.mkdirSync(croppedDir, { recursive: true }); // Create directory recursively
      }

      let croppedFilePath = path.resolve('/host/cropped/cropped.tif')
      croppedFilePath = generateUniqueFilename(croppedFilePath) // Generate a unique filename
      await cropGeoTIFF(mergedFilePath, croppedFilePath, bbox)

    } else if (files.length === 1) {
      let singleFilePath = path.join(DOWNLOAD_FOLDER, files[0])
      let croppedFilePath = path.resolve('/host/cropped/cropped.tif')
      croppedFilePath = generateUniqueFilename(croppedFilePath) // Generate a unique filename
      await cropGeoTIFF(singleFilePath, croppedFilePath, bbox)
    }

    await cleanupDownloadedFiles()

    console.log('Processing completed successfully.')
  } catch (error) {
    console.error('An error occurred during processing:', error.message)
  }
})()