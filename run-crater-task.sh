#!/bin/sh

set -u -e

main() {
    local task_type="${CRATER_TASK_TYPE-}"
    if [ -z "$task_type" ]; then
	echo "CRATER_TASK_TYPE not defined"
	exit 1
    fi

    if [ "$task_type" = "crate-build" ]; then
	local rust_installer="${CRATER_RUST_INSTALLER-}"
	local crate_file="${CRATER_CRATE_FILE-}"

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

	echo "Downloading crate from $crate_file"
	curl -fL "$crate_file" -o crate.tar.gz
	mkdir ./crate
	tar xzf crate.tar.gz -C ./crate --strip-components=1

	echo "Replacing path dependencies in Cargo.toml"
	if [ -e ./crate/Cargo.toml ]; then
	    sed -i /^\w*path/d ./crate/Cargo.toml
	else
	    echo "Cargo.toml does not exist!"
	fi

	echo "Building and testing"
	(cd ./crate && cargo build)
	(cd ./crate && cargo test)
    elif [ "$task_type" = "custom-build" ]; then
	local git_repo="${CRATER_TOOLCHAIN_GIT_REPO-}"
	local commit_sha="${CRATER_TOOLCHAIN_GIT_SHA-}"

	if [ -z "$git_repo" ]; then
	    echo "CRATER_TOOLCHAIN_GIT_REPO not defined"
	    exit 1
	fi

	if [ -z "$commit_sha" ]; then
	    echo "CRATER_TOOLCHAIN_GIT_REPO not defined"
	    exit 1
	fi

	echo "Installing system packages"
	apt-get update
	apt-get install build-essential -y
	apt-get install git file python2.7 -y

	echo "Cloning git repo"
	git clone "$git_repo" rust && (cd rust && git reset "$commit_sha" --hard)

	echo "Configuring"
	(cd rust && ./configure)

	echo "Building"
	(cd rust && make -j && make dist)

    else
	echo "unknown task type"
	exit 1
    fi
}

main "$@"

