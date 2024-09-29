# Use an official Node.js runtime as a parent image
FROM node:16

# Set the working directory inside the container
WORKDIR /app

# Copy the package.json and package-lock.json into the working directory
COPY package*.json ./

# Install any needed dependencies
RUN npm install

# Install GDAL for geospatial data processing
RUN apt-get update && apt-get install -y \
    gdal-bin \
    python3-gdal \
    && rm -rf /var/lib/apt/lists/*

# Copy the rest of the application files
COPY . .

# Make sure the downloads directory exists
RUN mkdir -p downloads

# Expose a port if needed (you can skip this if not using any network ports)
# EXPOSE 3000

# Define the command to run the app
CMD ["npm", "start"]
