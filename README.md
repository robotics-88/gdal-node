# GeoTIFF Processing Script

This Node.js script is designed to download, process, and manage GeoTIFF files. The script automates the downloading, merging, cropping, and reprojecting of GeoTIFF files based on specified geographic bounding boxes.

## Prerequisites

Before using this script, make sure you have gdal installed:
[GDAL](https://gdal.org/) (Geospatial Data Abstraction Library)

## Usage

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