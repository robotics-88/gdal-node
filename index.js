let axios = require('axios')
let gdal = require('gdal')
let fs = require('fs')
let path = require('path')

// Function to fetch elevation data from an API
async function fetchElevationData(lat, lon) {
    let url = `https://elevation-api.io/api/elevation?points=(${lat},${lon})`
    try {
        let response = await axios.get(url)
        return response.data.elevations[0].elevation
    } catch (error) {
        console.error('Error fetching elevation data:', error)
        return null
    }
}

// Function to create a simple GeoTIFF file using GDAL
function createGeoTiff(elevation) {
    let driver = gdal.drivers.get('GTiff')
    let outputFilePath = path.join(__dirname, 'data', 'output.tif')

    // Create a 1x1 raster dataset
    let dataset = driver.create(outputFilePath, 1, 1, 1, gdal.GDT_Float64)

    // Set geotransform (this is just a dummy example)
    dataset.geoTransform = [0, 1, 0, 0, 0, -1]

    // Set projection (EPSG:4326)
    dataset.srs = gdal.SpatialReference.fromEPSG(4326)

    // Write the elevation value to the raster band
    let band = dataset.bands.get(1)
    band.pixels.set(0, 0, elevation)

    // Flush and close the dataset
    dataset.flush()
    dataset.close()

    console.log(`GeoTIFF created: ${outputFilePath}`)
}

// Main function to fetch data and create a GeoTIFF
async function main() {
    let lat = 39.7392  // Example latitude (Denver, CO)
    let lon = -104.9903  // Example longitude (Denver, CO)

    console.log(`Fetching elevation data for (${lat}, ${lon})...`)
    let elevation = await fetchElevationData(lat, lon)

    if (elevation !== null) {
        console.log(`Elevation: ${elevation} meters`)
        createGeoTiff(elevation)
    }
}

// Run the main function
main()