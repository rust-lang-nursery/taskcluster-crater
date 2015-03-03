'use strict';

var debug = require('debug')(__filename.slice(__dirname.length + 1));
var fs = require('fs');
var util = require('./crater-util');
var tc = require('taskcluster-client');
var Promise = require('promise');
var slugid = require('slugid');
var defaultCredentialsFile = "./credentials.json";

function main() {
  var toolchain = util.parseToolchain(process.argv[2])
  if (toolchain == null) {
    console.log("can't parse toolchain");
    process.exit(1);
  }

  debug("scheduling for toolchain %s", JSON.stringify(toolchain));

  var credentials = loadCredentials(defaultCredentialsFile);

  debug("credentials: %s", JSON.stringify(credentials));

  scheduleTasks(toolchain, credentials);
}

function loadCredentials(credentialsFile) {
  return JSON.parse(fs.readFileSync(credentialsFile, "utf8"));
}

function scheduleTasks(toolchain, credentials) {
  var queue = new tc.Queue({
    credentials: credentials
  });

  // Get the task descriptors for calling taskcluster's createTask
  var payloads = getTaskPayloads(toolchain);
  payloads.forEach(function (payload) {
    debug("payload: " + JSON.stringify(payload));

    var taskId = slugid.v4();

    debug("using taskId " + taskId);

    var p = queue.createTask(taskId, payload);

    var p = p.catch(function (e) {
      debug("error creating task: " + e);
    });
    var p = p.then(function (result) {
      debug("createTask finished");
      debug("createTask returned status: ", result.status);
    });
  });
}

function getTaskPayloads(toolchain) {
  // TODO

  var crate = "toml-0.1.18";
  var deadlineInMinutes = 60;
  var rustInstallerUrl = "http://static-rust-lang-org.s3-us-west-1.amazonaws.com/dist/rust-nightly-x86_64-unknown-linux-gnu.tar.gz";
  var crateUrl = "https://crates.io/api/v1/crates/toml/0.1.18/download";

  var taskName = "nightly-2015-03-01-vs-toml-0.1.18";

  var createTime = new Date(Date.now());
  var deadlineTime = new Date(createTime.getTime() + deadlineInMinutes * 60000);

  // Using b2gtest because they have active works available
  var workerType = "b2gtest";

  var env = {
    "CRATER_RUST_INSTALLER": rustInstallerUrl,
    "CRATER_CRATE_FILE": crateUrl
  };
  var cmd = "apt-get update && apt-get install curl -y && (curl -sf https://raw.githubusercontent.com/brson/taskcluster-crater/master/run-crater-task.sh | sh)";

  var payload = {
    "provisionerId": "aws-provisioner",
    "workerType": workerType,
    "created": createTime.toISOString(),
    "deadline": deadlineTime.toISOString(),
    "payload": {
      "image": "ubuntu:13.10",
      "command": [ "/bin/bash", "-c", cmd ],
      "env": env,
      "maxRunTime": 600
    },
    "metadata": {
      "name": "Crater task " + taskName,
      "description": "Testing Rust crates for Rust language regressions",
      "owner": "banderson@mozilla.com",
      "source": "http://github.com/jhford/taskcluster-crater"
    }
  };
  return [payload];
}

main();
