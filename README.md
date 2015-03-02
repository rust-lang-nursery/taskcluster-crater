Let's test rust crates!

# Notes

Additional crate data, including add date, can be dl'd from e.g. https://crates.io/api/v1/crates/toml/0.1.0

An example of the paylod we need to create

```
{
  "image": "ubuntu:13.10",
  "command": [
    "/bin/bash",
    "-c",
    "apt-get update && apt-get install curl -y && (curl -sf https://raw.githubusercontent.com/brson/taskcluster-crater/master/run-crater-task.sh | sh)"
  ],
  "env": {
    "CRATER_RUST_INSTALLER": "https://static.rust-lang.org/dist/rust-nightly-x86_64-unknown-linux-gnu.tar.gz",
    "CRATER_CRATE_FILE": "https://crates.io/api/v1/crates/toml/0.1.18/download"
  },
  "maxRunTime": 600
}
```
