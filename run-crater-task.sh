#!/bin/sh

set -u -e

main() {
    rust_installer="${CRATER_RUST_INSTALLER-}"
    crate_file="${CRATER_CRATE_FILE-}"

    if [ -z "$rust_installer" ]; then
	echo "CRATER_RUST_INSTALLER not defined"
	exit 1
    fi

    if [ -z "$crate_file" ]; then
	echo "CRATER_CRATE_FILE not defined"
	exit 1
    fi

    echo "Installing system packages"
    apt-get update
    apt-get install build-essential -y

    echo "Installing Rust from $rust_installer"
    curl -f "$rust_installer" -o installer.tar.gz
    mkdir ./rust-install
    tar xzf installer.tar.gz -C ./rust-install --strip-components=1
    ./rust-install/install.sh
    rustc --version
    cargo --version

    echo "Downloading cratefrom $crate_file"
    curl -fL "$crate_file" -o crate.tar.gz
    mkdir ./crate
    tar xzf crate.tar.gz -C ./crate --strip-components=1
    (cd ./crate && cargo build)
    (cd ./crate && cargo test)
}

main "$@"

