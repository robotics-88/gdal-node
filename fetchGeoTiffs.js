const axios = require('axios')
const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')
const  utmObj  = require('utm-latlng')
const fsExtra = require('fs-extra')

// Define directories
const DOWNLOAD_FOLDER = path.resolve(__dirname, 'downloads')
const CROPPED_DIR = '/host/cropped';
const downloadsFolder = '/host/downloads'; // This is mapped to the host's ~/Downloads

// Ensure directories exist
if (!fs.existsSync(DOWNLOAD_FOLDER)) {
  fs.mkdirSync(DOWNLOAD_FOLDER)
}
if (!fs.existsSync(CROPPED_DIR)) {
  fs.mkdirSync(CROPPED_DIR, { recursive: true });
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

// Dynamically adjust filename if old files weren't cleared out
function generateUniqueFilename(filePath) {
  let ext = path.extname(filePath)
  let baseName = path.basename(filePath, ext)
  let dirName = path.dirname(filePath)

  let uniqueFilePath = filePath
  let counter = 1

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

      let writer = fs.createWriteStream(outputPath)

      response.data.pipe(writer)

      writer.on('finish', () => {
        console.log(`File downloaded successfully to ${outputPath}`)
        resolve()
      })

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
        } else {
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
    let utm = new utmObj()
    let minUtm = utm.convertLatLngToUtm(minY, minX, 6)
    let maxUtm = utm.convertLatLngToUtm(maxY, maxX, 6)

    let cropCommand = `gdalwarp -te ${minUtm.Easting} ${minUtm.Northing} ${maxUtm.Easting} ${maxUtm.Northing} ${inputFilePath} ${outputFilePath}`

    exec(cropCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error cropping GeoTIFF: ${stderr}`)
        reject(error)
      } else {
        console.log(`GeoTIFF cropped to ${outputFilePath}`)
        resolve(outputFilePath)
      }
    })
  })
}

// Function to move cropped file to Downloads
async function moveFileToDownloads(croppedFilePath) {
  if (!fs.existsSync(downloadsFolder)) {
    console.error('Downloads folder is not available in the container.');
    return;
  }

  const destinationPath = path.join(downloadsFolder, path.basename(croppedFilePath));

  try {
    await fsExtra.move(croppedFilePath, destinationPath);
    console.log(`Moved cropped file to ${destinationPath}`);
  } catch (error) {
    console.error(`Failed to move file to Downloads: ${error.message}`);
  }
}

// Function to delete all files in a folder
async function cleanupDownloadedFiles() {
  try {
    await fsExtra.emptyDir(DOWNLOAD_FOLDER)
    console.log(`Cleaned up download folder: ${DOWNLOAD_FOLDER}`)
  } catch (error) {
    console.error(`Cleanup failed: ${error}`)
  }
}

// Main execution
(async () => {
  let bbox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  let args = process.argv.slice(2)

  if (args.length === 0 || args.length % 2 !== 0) {
    console.log('Usage: npm run start-with-args -- <latitude1> <longitude1> <latitude2> <longitude2> ...')
    process.exit(1)
  }

  let coordinatesString = ''
  for (let i = 0; i < args.length; i += 2) {
    let longitude = parseFloat(args[i])
    let latitude = parseFloat(args[i + 1])

    if (longitude < bbox.minX) bbox.minX = longitude
    if (longitude > bbox.maxX) bbox.maxX = longitude
    if (latitude < bbox.minY) bbox.minY = latitude
    if (latitude > bbox.maxY) bbox.maxY = latitude

    coordinatesString += `${longitude}%20${latitude},`
  }

  coordinatesString = coordinatesString.trim().replace(/,$/, '')

  let apiUrl = `https://tnmaccess.nationalmap.gov/api/v1/products?polygon=${coordinatesString}&datasets=Digital%20Elevation%20Model%20%28DEM%29%201%20meter&prodFormats=GeoTIFF&outputFormat=JSON`

  try {
    let urls = await fetchGeoTIFFUrls(apiUrl)
    console.log(urls)

    await Promise.all(urls.map(async (url) => {
      let fileName = path.basename(url)
      let outputPath = path.join(DOWNLOAD_FOLDER, fileName)
      await downloadGeoTIFF(url, outputPath)
    }))

    let files = fs.readdirSync(DOWNLOAD_FOLDER).filter(file => file.endsWith('.tif'))

    let croppedFilePath = path.resolve(CROPPED_DIR, 'cropped.tif')
    croppedFilePath = generateUniqueFilename(croppedFilePath)

    if (files.length > 1) {
      let mergedFilePath = path.resolve(__dirname, 'merged.tif')
      mergedFilePath = generateUniqueFilename(mergedFilePath)
      await mergeGeoTIFFs(mergedFilePath)
      await cropGeoTIFF(mergedFilePath, croppedFilePath, bbox)
    } else if (files.length === 1) {
      let singleFilePath = path.join(DOWNLOAD_FOLDER, files[0])
      await cropGeoTIFF(singleFilePath, croppedFilePath, bbox)
    }

    await moveFileToDownloads(croppedFilePath)
    await cleanupDownloadedFiles()

    console.log('Processing completed successfully.')
  } catch (error) {
    console.error('An error occurred during processing:', error.message)
  }
})()
