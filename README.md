# GeoTIFF Processing Script

This Node.js script is designed to download, process, and manage GeoTIFF files. The script automates the downloading, merging, cropping, and reprojecting of GeoTIFF files based on specified geographic bounding boxes.

## Prerequisites

Before using this script, make sure you have gdal installed:
[GDAL](https://gdal.org/) (Geospatial Data Abstraction Library)

## Usage
Make sure you are using node version 16

You can pass in a space separated list of points in the order long lat long lat ...

The script will create the API url and the bounding box dynamically

There are some example arguments at the bottom of this README

You can also go into Hello Decco, select or create a burnUnit and then from the Pilot Tab click on

**Generate Elevation Map**

Check the console in the dev tools and the arguments will be generated to copy and paste.  

Then run:

``` bash
npm start -- < paste arguments here >
```

The program will

Download the specified GeoTIFF files.
Process the files by merging and cropping them as needed
Clean up the downloaded files after processing.

## What's Next

1. Talk about where we want to handle this as well as where in the workflow this would happen.


3 result start script:
```bash
npm start -- -71.32028102874757 41.49938503474929 -71.32028102874757 41.51143878722848 -71.29290103912355 41.51143878722848 -71.29290103912355 41.49938503474929 
```

6 result start script:
```bash
npm start -- -94.76806640625001 29.39216194937415 -94.93972778320312 29.419882024551534 -94.84016418457033 29.24754217580329
```

