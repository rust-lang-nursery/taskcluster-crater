#!/bin/sh

set -u -e

say() {
    echo
    echo "# $1"
    echo
}

main() {
    local task_type="${CRATER_TASK_TYPE-}"
    if [ -z "$task_type" ]; then
	say "CRATER_TASK_TYPE not defined"
	exit 1
    fi

    if [ "$task_type" = "crate-build" ]; then
	local rust_installer="${CRATER_RUST_INSTALLER-}"
        local std_installer="${CRATER_STD_INSTALLER-}"
	local cargo_installer="${CRATER_CARGO_INSTALLER-}"
	local crate_file="${CRATER_CRATE_FILE-}"

	if [ -z "$rust_installer" ]; then
	    say "CRATER_RUST_INSTALLER not defined"
	    exit 1
	fi

	if [ -z "$crate_file" ]; then
	    say "CRATER_CRATE_FILE not defined"
	    exit 1
	fi

	say "Installing Rust from $rust_installer"
	curl --retry 5 -Lf "$rust_installer" -o installer.tar.gz
	mkdir ./rust-install
	tar xzf installer.tar.gz -C ./rust-install --strip-components=1
	./rust-install/install.sh

	if [ -n "$std_installer" ]; then
	    say "Installing std from $std_installer"
	    curl --retry 5 -Lf "$std_installer" -o std-installer.tar.gz
	    mkdir ./std-install
	    tar xzf std-installer.tar.gz -C ./std-install --strip-components=1
	    ./std-install/install.sh
	fi

	if [ -n "$cargo_installer" ]; then
	    say "Installing Cargo from $cargo_installer"
	    curl --retry 5 -Lf "$cargo_installer" -o cargo-installer.tar.gz
	    mkdir ./cargo-install
	    tar xzf cargo-installer.tar.gz -C ./cargo-install --strip-components=1
	    ./cargo-install/install.sh
	fi

	say "Printing toolchain versions"

	rustc --version
	cargo --version

	say "Downloading crate from $crate_file"
	curl --retry 5 -fL "$crate_file" -o crate.tar.gz
	mkdir ./crate
	tar xzf crate.tar.gz -C ./crate --strip-components=1

	say "Replacing path dependencies in Cargo.toml"
	if [ -e ./crate/Cargo.toml ]; then
	    # Replaces any line beginning with 'path' with an empty line, if that line
	    # occurs inside a [dependencies.*] section
	    sed -i '/\[dependencies.*\]/,/\[[^db].*\]/ s/^\w*path.*//' ./crate/Cargo.toml
	    sed -i '/\[dev-dependencies.*\]/,/\[[^db].*\]/ s/^\w*path.*//' ./crate/Cargo.toml
	    sed -i '/\[build-dependencies.*\]/,/\[[^db].*\]/ s/^\w*path.*//' ./crate/Cargo.toml
	    # Remove any 'path = "...",' text from inside {   }, with trailing comma
	    sed -i '/\[dependencies.*\]/,/\[[^db].*\]/ s/path *= *\"[^ ]*" *,//' ./crate/Cargo.toml
	    sed -i '/\[dev-dependencies.*\]/,/\[[^db].*\]/ s/path *= *\"[^ ]*" *,//' ./crate/Cargo.toml
	    sed -i '/\[build-dependencies.*\]/,/\[[^db].*\]/ s/path *= *\"[^ ]*" *,//' ./crate/Cargo.toml
	    # Same, but w/ leading trailing comma
	    sed -i '/\[dependencies.*\]/,/\[[^db].*\]/ s/, *path *= *\"[^ ]*"//' ./crate/Cargo.toml
	    sed -i '/\[dev-dependencies.*\]/,/\[[^db].*\]/ s/, *path *= *\"[^ ]*"//' ./crate/Cargo.toml
	    sed -i '/\[build-dependencies.*\]/,/\[[^db].*\]/ s/, *path *= *\"[^ ]*"//' ./crate/Cargo.toml
	else
	    say "Cargo.toml does not exist!"
	fi

	say "Fetching dependencies"
	local count=0
	local max=5
	local sleep_time=1
	for i in 1 2 4 8 16; do
	    set +e
	    (cd ./crate && cargo fetch)
	    set -e
	    if [ $? = 0 ]; then
		break
	    fi
	    say "Cargo fetch failed. Trying again in $i s."
	    sleep "$i"
	done
	if [ $? != 0 ]; then
	    say "Cargo fetch failed completely!"
	    exit 1
	fi

	say "Building crate"
	(cd ./crate && cargo build)

	# FIXME would like to test
	#(cd ./crate && cargo test)
    elif [ "$task_type" = "custom-build" ]; then
	local git_repo="${CRATER_TOOLCHAIN_GIT_REPO-}"
	local commit_sha="${CRATER_TOOLCHAIN_GIT_SHA-}"

	if [ -z "$git_repo" ]; then
	    say "CRATER_TOOLCHAIN_GIT_REPO not defined"
	    exit 1
	fi

	if [ -z "$commit_sha" ]; then
	    say "CRATER_TOOLCHAIN_GIT_SHA not defined"
	    exit 1
	fi

	say "Cloning git repo"
	git clone "$git_repo" rust && (cd rust && git reset "$commit_sha" --hard)

	say "Configuring"
	(cd rust && ./configure --build=x86_64-unknown-linux-gnu --host=x86_64-unknown-linux-gnu --target=x86_64-unknown-linux-gnu)

	say "Building"
	(cd rust && make -j2 && make dist)

	say "Renaming installer"
	mv rust/dist/rustc-*-x86_64-unknown-linux-gnu.tar.gz \
           rust/dist/rustc-dev-x86_64-unknown-linux-gnu.tar.gz
	mv rust/dist/rust-std-*-x86_64-unknown-linux-gnu.tar.gz \
           rust/dist/rust-std-dev-x86_64-unknown-linux-gnu.tar.gz

    else
	say "Unknown task type"
	exit 1
    fi
}

main "$@"

