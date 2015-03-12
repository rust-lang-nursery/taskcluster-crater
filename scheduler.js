'use strict';

var debug = require('debug')(__filename.slice(__dirname.length + 1));
var util = require('./crater-util');
var crateIndex = require('./crate-index');
var Promise = require('promise');
var async = require('async');
var slugid = require('slugid');
var tc = require('taskcluster-client');
var assert = require('assert');
var dist = require('./rust-dist');

function createScheduleForAllCratesForToolchain(toolchain, dlRootAddr, indexAddr, cacheDir) {
  var p = crateIndex.loadCrates(indexAddr, cacheDir)
  p = p.then(function(crates) {
    debug("loaded " + crates.length + " crates");
    return filterOutOld(crates, dlRootAddr, cacheDir);
  });
  p = p.then(function(crates) {
    return createScheduleForCratesForToolchain(crates, toolchain, indexAddr, cacheDir);
  });    
  return p;
}

function filterOutOld(crates, dlRootAddr, cacheDir) {
  var original_length = crates.length;

  // Convert any old crates to nulls
  var p = Promise.denodeify(async.mapLimit)(crates, 100, function(crate, cb) {
    var name = crate.name;
    var vers = crate.vers;
    var p = crateIndex.getVersionMetadata(name, vers, dlRootAddr, cacheDir);
    p = p.then(function(data) {
      var date = new Date(data.version.created_at);
      var earlyDate = new Date("2015-02-01");
      if (date < earlyDate) {
	cb(null, null);
      } else {
	cb(null, crate);
      }
    });
    p = p.catch(function(e) {
      // If we can't get the date then assume we should test this one
      cb(null, crate);
    });
    p.done();
  });

  // Filter out the nulls
  p = p.then(function(crates) {
    var remaining = crates.filter(function(crate) { return crate != null; });
    var final_length = remaining.length
    debug("filtered out " + (original_length - final_length) + " old crates");
    debug("remaining crates " + final_length);
    return remaining;
  });
  return p;
}

function createScheduleForCratesForToolchain(crates, toolchain, indexAddr, cacheDir) {
  // Convert to scheduler commands
  var tasks = [];
  crates.forEach(function(crate) {
    var task = {
      channel: toolchain.channel,
      archiveDate: toolchain.date,
      crateName: crate.name,
      crateVers: crate.vers
    }
    tasks.push(task);
  });
  return tasks;
}

function scheduleBuilds(schedule, dlRootAddr, rustDistAddr, tcCredentials) {
  assert(dlRootAddr != null);
  assert(rustDistAddr != null);
  assert(tcCredentials != null);

  // FIXME: For testing, just schedule five builds instead of thousands
  //if (schedule.length > 5) {
  //  schedule = schedule.slice(0, 5)
  //}

  var queue = new tc.Queue({
    credentials: tcCredentials
  });

  var total = schedule.length;
  var i = 1;

  return Promise.denodeify(async.mapLimit)(schedule, 100, function(schedule, cb) {
    createTaskDescriptor(schedule, dlRootAddr, rustDistAddr).then(function(taskDesc) {
      debug("createTask payload: " + JSON.stringify(taskDesc));

      var taskId = slugid.v4();

      debug("creating task " + i + " of " + total + " for " + schedule.crateName + "-" + schedule.crateVers);
      i = i + 1;

      queue.createTask(taskId, taskDesc)
	.catch(function(e) {
	  // TODO: How to handle a single failure here?
	  console.log("error creating task for " + JSON.stringify(schedule));
	  console.log("error is " + e);
	  cb(e, null);
	}).then(function(result) {
	  console.log("createTask returned status: ", result.status);
	  console.log("inspector link: https://tools.taskcluster.net/task-inspector/#" + taskId);
	  cb(null, result);
	});
    }).done();
  });

  return p;
}

function createTaskDescriptor(schedule, dlRootAddr, rustDistAddr) {
  debug("creating task descriptor for " + JSON.stringify(schedule));

  var channel = schedule.channel;
  var archiveDate = schedule.archiveDate;
  var crateName = schedule.crateName;
  var crateVers = schedule.crateVers;

  assert(channel != null);
  assert(archiveDate != null);
  assert(crateName != null);
  assert(crateVers != null);

  var p = installerUrlForToolchain(schedule, rustDistAddr)
  return p.then(function(rustInstallerUrl) {
    var deadlineInMinutes = 60;
    var crateUrl = dlRootAddr + "/" + crateName + "/" + crateVers + "/download";

    var taskName = channel + "-" + archiveDate + "-vs-" + crateName + "-" + crateVers;

    var createTime = new Date(Date.now());
    var deadlineTime = new Date(createTime.getTime() + deadlineInMinutes * 60000);

    // Using b2gtest because they have active works available
    var workerType = "b2gtest";

    var env = {
      "CRATER_RUST_INSTALLER": rustInstallerUrl,
      "CRATER_CRATE_FILE": crateUrl
    };
    var cmd = "apt-get update && apt-get install curl -y && (curl -sf https://raw.githubusercontent.com/brson/taskcluster-crater/master/run-crater-task.sh | sh)";

    var task = {
      "provisionerId": "aws-provisioner",
      "workerType": workerType,
      "created": createTime.toISOString(),
      "deadline": deadlineTime.toISOString(),
      "routes": [
	"crater.#"
      ],
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
	"source": "http://github.com/brson/taskcluster-crater"
      },
      "extra": {
	"crater": {
	  "channel": channel,
	  "archiveDate": archiveDate,
	  "crateName": crateName,
	  "crateVers": crateVers
	}
      }
    };
    return task;
  });
}

function installerUrlForToolchain(toolchain, rustDistAddr) {
  return dist.installerUrlForToolchain(toolchain, "x86_64-unknown-linux-gnu", rustDistAddr);
}


exports.createScheduleForAllCratesForToolchain = createScheduleForAllCratesForToolchain
exports.scheduleBuilds = scheduleBuilds
