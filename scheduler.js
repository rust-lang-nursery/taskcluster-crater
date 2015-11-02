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
var db = require('./crater-db');

var customBuildMaxRunTimeInSeconds = 240 * 60;
var crateBuildMaxRunTimeInSeconds = 5 * 60;

/**
 * Create a schedule of tasks for execution by `scheduleBuilds`.
 */
function createSchedule(schedOpts, config, dbctx) {
  return crateIndex.loadCrates(config).then(function(crates) {
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
    if (schedOpts.skipExisting) {
      return removeCratesWithCompleteResults(crates, dbctx, schedOpts.toolchain);
    } else {
      return crates;
    }
  }).then(function(crates) {
    return createScheduleForCratesForToolchain(crates, schedOpts.toolchain);
  });
}

function removeCratesWithCompleteResults(crates, dbctx, toolchain) {
  // Look up every crate's results and throw out the build request
  // if it exists, by first setting it to null then filtering it out.
  // (async doesn't have 'filterLimit').
  return Promise.denodeify(async.mapLimit)(crates, 1, function(crate, cb) {
    var buildResultKey = {
      toolchain: toolchain,
      crateName: crate.name,
      crateVers: crate.vers
    };
    db.getBuildResult(dbctx, buildResultKey).then(function(buildResult) {
      if (buildResult) {
	if (buildResult.status == "success" || buildResult.status == "failure") {
	  // Already have a result, map this crate to null
	  debug("existing result for " + crate.name + "-" + crate.vers);
	  cb(null, null);
	} else {
	  // Have a result, but not a usable one. Possibly an exception
	  debug("bad existing result for " + crate.name + "-" + crate.vers);
	  cb(null, crate);
	}
      } else {
	debug("no existing result for " + crate.name + "-" + crate.vers);
	cb(null, crate);
      }
    }).catch(function(e) {
      cb(e, null);
    });
  }).then(function(crates) {
    return crates.filter(function(crate) {
      if (crate) { return true; } else { return false; }
    });
  });
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

function scheduleBuilds(dbctx, schedule, config) {
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
    createTaskDescriptorForCrateBuild(dbctx, schedule, config).then(function(taskDesc) {
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
    }).catch(function(e) {
      cb(e, null);
    }).done();
  })

  return p;
}

function createTaskDescriptorForCrateBuild(dbctx, schedule, config) {
  var dlRootAddr = config.dlRootAddr;

  debug("creating task descriptor for " + JSON.stringify(schedule));

  var crateName = schedule.crateName;
  var crateVers = schedule.crateVers;

  assert(crateName != null);
  assert(crateVers != null);

  var p = installerUrlsForToolchain(dbctx, schedule.toolchain, config)
  return p.then(function(installerUrls) {
    var crateUrl = dlRootAddr + "/" + crateName + "/" + crateVers + "/download";
    var taskName = util.toolchainToString(schedule.toolchain) + "-vs-" + crateName + "-" + crateVers;

    var env = {
      "CRATER_RUST_INSTALLER": installerUrls.rustInstallerUrl,
      "CRATER_CRATE_FILE": crateUrl
    };

    if (installerUrls.stdInstallerUrl) {
      env["CRATER_STD_INSTALLER"] = installerUrls.stdInstallerUrl;
    }
    if (installerUrls.cargoInstallerUrl) {
      env["CRATER_CARGO_INSTALLER"] = installerUrls.cargoInstallerUrl;
    }

    var extra = {
      "toolchain": schedule.toolchain,
      "crateName": crateName,
      "crateVers": crateVers
    };

    return createTaskDescriptor(taskName, env, extra,
				"crate-build", crateBuildMaxRunTimeInSeconds, "cratertest",
				{ }, 120 /* deadline in minutes */);
  });
}

// FIXME Too many arguments
function createTaskDescriptor(taskName, env, extra, taskType, maxRunTime, workerType, artifacts, deadlineInMinutes) {

  var createTime = new Date(Date.now());
  var deadlineTime = new Date(createTime.getTime() + deadlineInMinutes * 60000);

  var cmd = "cd /home && curl -sfL https://raw.githubusercontent.com/brson/taskcluster-crater/master/run-crater-task.sh -o ./run.sh && sh ./run.sh";

  env.CRATER_TASK_TYPE = taskType;
  extra.taskType = taskType;

  var task = {
    "provisionerId": "aws-provisioner-v1",
    "workerType": workerType,
    "created": createTime.toISOString(),
    "deadline": deadlineTime.toISOString(),
    "retries": 5,
    "routes": [
      "crater.#"
    ],
    "payload": {
      "image": "brson/crater:2",
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

function installerUrlsForToolchain(dbctx, toolchain, config) {
  if (toolchain.channel) {
    return dist.installerUrlForToolchain(toolchain, "x86_64-unknown-linux-gnu", config)
      .then(function(url) {
	return {
	  rustInstallerUrl: url,
          stdInstallerUrl: null,
	  cargoInstallerUrl: null
	};
      });
  } else {
    debug(toolchain);
    assert(toolchain.customSha);
    return db.getCustomToolchain(dbctx, toolchain).then(function(custom) {
      stdUrl = custom.url.replace("rustc-", "rust-std");
      return {
	rustInstallerUrl: custom.url,
        stdInstallerUrl: stdUrl,
	cargoInstallerUrl: "https://static.rust-lang.org/cargo-dist/cargo-nightly-x86_64-unknown-linux-gnu.tar.gz"
      };
    });
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

  var expiry = new Date(Date.now());
  expiry.setDate(expiry.getDate() + 60);

  // Upload the installer
  var artifacts = {
    "public/rustc-dev-x86_64-unknown-linux-gnu.tar.gz": {
      type: "file",
      path: "/home/rust/dist/rustc-dev-x86_64-unknown-linux-gnu.tar.gz",
      expires: expiry
    },
    "public/rust-std-dev-x86_64-unknown-linux-gnu.tar.gz": {
      type: "file",
      path: "/home/rust/dist/rust-std-dev-x86_64-unknown-linux-gnu.tar.gz",
      expires: expiry
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
