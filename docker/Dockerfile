FROM ubuntu:16.04
MAINTAINER Brian Anderson <banderson@mozilla.com>

RUN apt-get update

# Baseline tools
RUN apt-get install -y build-essential \
     git file python2.7 \
     perl curl git libc6-dev-i386 gcc-multilib g++-multilib llvm llvm-dev
RUN apt-get build-dep -y clang llvm

# Package compatibility

# Servo
RUN apt-get install -y libz-dev \
    freeglut3-dev \
    libfreetype6-dev libgl1-mesa-dri libglib2.0-dev xorg-dev \
    gperf g++ cmake python-virtualenv \
    libssl-dev libbz2-dev libosmesa6-dev libxmu6 libxmu-dev

# sdl2
RUN apt-get install -y libsdl2-dev

# rustqlite
RUN apt-get install -y libsqlite3-dev

# netlib-provider
RUN apt-get install -y gfortran

# gdk-sys
RUN apt-get install -y libgtk-3-dev
