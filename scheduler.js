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

var customBuildMaxRunTimeInSeconds = 240 * 60;
var crateBuildMaxRunTimeInSeconds = 30 * 60;

/**
 * Create a schedule of tasks for execution by `scheduleBuilds`.
 */
function createSchedule(schedOpts, config) {
  return crateIndex.loadCrates(config).then(function(crates) {
    return filterOutOld(crates, config);
  }).then(function(crates) {
    if (schedOpts.crateName) {
      return retainMatchingNames(crates, schedOpts.crateName);
    } else {
      return crates;
    }
  }).then(function(crates) {
    if (schedOpts.top) {
      return retainTop(crates, schedOpts.top);
    } else {
      return crates;
    }
  }).then(function(crates) {
    if (schedOpts.mostRecentOnly) {
      return retainMostRecent(crates);
    } else {
      return crates;
    }
  }).then(function(crates) {
    return createScheduleForCratesForToolchain(crates, schedOpts.toolchain);
  });
}

function filterOutOld(crates, config) {
  var original_length = crates.length;

  // Convert any old crates to nulls
  var p = Promise.denodeify(async.mapLimit)(crates, 100, function(crate, cb) {
    var name = crate.name;
    var vers = crate.vers;
    var p = crateIndex.getVersionMetadata(name, vers, config);
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

function retainTop(crates, count) {
  var popMap = crateIndex.getPopularityMap(crates);
  var sorted = crates.slice();
  sorted.sort(function(a, b) {
    var aPop = popMap[a.name];
    var bPop = popMap[b.name];
    if (aPop == bPop) { return 0; }
    if (aPop < bPop) { return 1; }
    if (aPop > bPop) { return -1; }
  });

  // We want the to *count* unique crate names, but to keep
  // all revisions.
  var finalSorted = [];
  var seenCrateNames = {};
  for (var i = 0; i < sorted.length; i++) {
    var crate = sorted[i];
    seenCrateNames[crate.name] = 0;
    if (Object.keys(seenCrateNames).length > count) {
      break;
    }

    finalSorted.push(crate);
  }

  return finalSorted;
}

function retainMostRecent(crates, count) {
  var mostRecent = crateIndex.getMostRecentRevs(crates);

  var result = [];

  crates.forEach(function(crate) {
    var recent = mostRecent[crate.name];
    if (crate.vers == recent.vers) {
      result.push(crate);
    }
  });

  return result;
}

function retainMatchingNames(crates, name) {
  var result = [];

  crates.forEach(function(crate) {
    if (crate.name == name) {
      result.push(crate);
    }
  });

  return result;
}

function createScheduleForCratesForToolchain(crates, toolchain) {
  // Convert to scheduler commands
  var tasks = [];
  crates.forEach(function(crate) {
    var task = {
      toolchain: toolchain,
      crateName: crate.name,
      crateVers: crate.vers
    }
    tasks.push(task);
  });
  return tasks;
}

function scheduleBuilds(schedule, config) {
  var tcCredentials = config.tcCredentials;

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
    createTaskDescriptorForCrateBuild(schedule, config).then(function(taskDesc) {
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
	  console.log("created task for " + JSON.stringify(schedule));
	  console.log("inspector link: https://tools.taskcluster.net/task-inspector/#" + taskId);
	  cb(null, result);
	});
    }).done();
  });

  return p;
}

function createTaskDescriptorForCrateBuild(schedule, config) {
  var dlRootAddr = config.dlRootAddr;

  debug("creating task descriptor for " + JSON.stringify(schedule));

  var crateName = schedule.crateName;
  var crateVers = schedule.crateVers;

  assert(crateName != null);
  assert(crateVers != null);

  var p = installerUrlForToolchain(schedule.toolchain, config)
  return p.then(function(rustInstallerUrl) {
    var crateUrl = dlRootAddr + "/" + crateName + "/" + crateVers + "/download";
    var taskName = util.toolchainToString(schedule.toolchain) + "-vs-" + crateName + "-" + crateVers;

    var env = {
      "CRATER_RUST_INSTALLER": rustInstallerUrl,
      "CRATER_CRATE_FILE": crateUrl
    };

    var extra = {
      "toolchain": schedule.toolchain,
      "crateName": crateName,
      "crateVers": crateVers
    };

    return createTaskDescriptor(taskName, env, extra,
				"crate-build", crateBuildMaxRunTimeInSeconds, "cratertest",
				{ }, 60 /* deadline in minutes */);
  });
}

// FIXME Too many arguments
function createTaskDescriptor(taskName, env, extra, taskType, maxRunTime, workerType, artifacts, deadlineInMinutes) {

  var createTime = new Date(Date.now());
  var deadlineTime = new Date(createTime.getTime() + deadlineInMinutes * 60000);

  var cmd = "cd /home && apt-get update && apt-get install curl -y && (curl -sf https://raw.githubusercontent.com/brson/taskcluster-crater/master/run-crater-task.sh | sh)";

  env.CRATER_TASK_TYPE = taskType;
  extra.taskType = taskType;

  var task = {
    "provisionerId": "aws-provisioner",
    "workerType": workerType,
    "created": createTime.toISOString(),
    "deadline": deadlineTime.toISOString(),
    "retries": 5,
    "routes": [
      "crater.#"
    ],
    "payload": {
      "image": "ubuntu:14.10",
      "command": [ "/bin/bash", "-c", cmd ],
      "env": env,
      "maxRunTime": maxRunTime,
      "artifacts": artifacts
    },
    "metadata": {
      "name": "Crater task " + taskName,
      "description": "Testing Rust crates for Rust language regressions",
      "owner": "banderson@mozilla.com",
      "source": "http://github.com/brson/taskcluster-crater"
    },
    "extra": {
      "crater": extra
    }
  };
  return task;
}

function installerUrlForToolchain(toolchain, config) {
  if (toolchain.channel) {
    return dist.installerUrlForToolchain(toolchain, "x86_64-unknown-linux-gnu", config);
  } else {
    assert(false);
  }
}

/**
 * Schedules a build and upload of a custom build. Fails if `uniqueName`
 * has already been taken.
 */
function scheduleCustomBuild(options, config) {
  var gitRepo = options.gitRepo;
  var commitSha = options.commitSha;

  if (commitSha.length != 40) {
    return Promise.reject("bogus sha");
  }

  var tcCredentials = config.tcCredentials;

  var queue = new tc.Queue({ credentials: tcCredentials });
  var taskId = slugid.v4();
  var taskDesc = createTaskDescriptorForCustomBuild(gitRepo, commitSha);
  return queue.createTask(taskId, taskDesc).then(function(result) {
    console.log("created task for " + gitRepo);
    console.log("inspector link: https://tools.taskcluster.net/task-inspector/#" + taskId);
    return result;
  });
}

function createTaskDescriptorForCustomBuild(gitRepo, commitSha) {

  var taskName = "build-" + commitSha;

  var env = {
    "CRATER_TOOLCHAIN_GIT_REPO": gitRepo,
    "CRATER_TOOLCHAIN_GIT_SHA": commitSha,
  };

  var extra = {
    toolchainGitRepo: gitRepo,
    toolchainGitSha: commitSha
  };

  var twoMonths = 60 /*s*/ * (24 * 60) /*m*/ * (30 * 2) /*d*/;

  // Upload the installer
  var artifacts = {
    installer: {
      type: "file",
      path: "./rust/dist/rustc-" + commitSha + "-x86_64-unknown-linux-gnu.tar.gz",
      expires: new Date((new Date(Date.now())) + twoMonths)
    }
  };

  var deadlineInMinutes = 60 * 24; // Rust can take a long time to build successfully

  return createTaskDescriptor(taskName, env, extra,
			      "custom-build", customBuildMaxRunTimeInSeconds, "rustbuild",
			      artifacts, deadlineInMinutes);
}

exports.createSchedule = createSchedule;
exports.scheduleBuilds = scheduleBuilds;
exports.scheduleCustomBuild = scheduleCustomBuild;
