# GeoTIFF Processing Script

This Node.js script is designed to download, process, and manage GeoTIFF files. The script automates the downloading, merging, cropping, and reprojecting of GeoTIFF files based on specified geographic bounding boxes.

## Prerequisites

Before using this script, make sure you have gdal installed:
[GDAL](https://gdal.org/) (Geospatial Data Abstraction Library)

## Usage
Make sure you are using node version 16

Update the bbox (bounding box) and apiUrl variables in the script to match the geographic area and datasets you want to work with.

``` bash
npm start
```

The program will

Download the specified GeoTIFF files.
Process the files by merging, cropping, and reprojecting them as needed.
Clean up the downloaded files after processing.

## What's Next

1. Dynamically generate the API url based on the the polygon submitted by user
  -- There is a limit of 23 coordinate pairs which for user generated BurnUnits would likely not be a problem,
  however for KML file generated BurnUnits, would be.  I reccommend we use a bounding box for the polygon being submitted.
  That would also do away with the need to have an additional bounding box for cropping. 

2. Fool proof it for merging together multiple .tifs that cover different areas.  I have some processing in place, but I don't trust 
it yet and it is very untested.

3. Talk about where we want to handle this as well as where in the workflow this would happen.


6 result URL string: 
https://tnmaccess.nationalmap.gov/api/v1/products?polygon=-94.76806640625001%2029.39216194937415,-94.93972778320312%2029.419882024551534,-94.84016418457033%2029.24754217580329&datasets=Digital%20Elevation%20Model%20%28DEM%29%201%20meter&prodFormats=GeoTIFF&outputFormat=JSON

6 result start script:
```bash
npm start -- -94.76806640625001 29.39216194937415 -94.93972778320312 29.419882024551534 -94.84016418457033 29.24754217580329
```
31 results URL string: https://tnmaccess.nationalmap.gov/api/v1/products?polygon=-95.14160156250001%2029.812181049342897,-95.31051635742189%2029.14867472262138,-94.84016418457033%2029.24754217580329&datasets=Digital%20Elevation%20Model%20%28DEM%29%201%20meter&prodFormats=GeoTIFF&outputFormat=JSON