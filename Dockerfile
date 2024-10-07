# Use an official Node.js runtime as a parent image
FROM node:16

FROM node:16

# Set the working directory
WORKDIR /app

# Install Miniconda
RUN apt-get update && apt-get install -y wget && \
    wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh && \
    bash Miniconda3-latest-Linux-x86_64.sh -b -p /opt/conda && \
    rm Miniconda3-latest-Linux-x86_64.sh

# Set the PATH for Conda
ENV PATH /opt/conda/bin:$PATH

# Copy the environment.yml file and create the environment
COPY environment.yml ./
RUN conda env create -f environment.yml

# Activate the environment by modifying .bashrc
RUN echo "source activate gdal_env" > ~/.bashrc

# Set the PATH to include the activated environment
ENV PATH /opt/conda/envs/gdal_env/bin:$PATH
ENV PROJ_LIB /opt/conda/envs/gdal_env/share/proj


# Install GDAL and any other dependencies
RUN conda install -c conda-forge gdal



# Copy your application code
COPY . .

RUN npm install

# Create downloads directory
RUN mkdir -p downloads

# Default command
CMD ["npm", "start"]