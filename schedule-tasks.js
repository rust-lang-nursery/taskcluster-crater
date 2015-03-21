'use strict';

var debug = require('debug')(__filename.slice(__dirname.length + 1));
var fs = require('fs');
var util = require('./crater-util');
var tc = require('taskcluster-client');
var Promise = require('promise');
var slugid = require('slugid');
var scheduler = require('./scheduler');
var crateIndex = require('./crate-index');

function main() {
  var options = parseOptionsFromArgs();
  if (!options) {
    console.log("can't parse options");
    process.exit(1);
  }

  debug("scheduling for toolchain %s", JSON.stringify(options));

  var config = util.loadDefaultConfig();

  if (options.type == "crate-build") {
    Promise.resolve().then(function() {
      return scheduler.createSchedule(options, config);
    }).then(function(schedule) {
      return scheduler.scheduleBuilds(schedule, config);
    }).then(function(tasks) {
      console.log("created " + tasks.length + " tasks");
    }).done();
  } else {
    Promise.resolve().then(function() {
      return scheduler.scheduleCustomBuild(options, config);
    }).done();
  }
}

function parseOptionsFromArgs() {
  var type = process.argv[2];
  if (type == "crate-build") {
    var toolchain = util.parseToolchain(process.argv[3])
    var top = null;
    var mostRecentOnly = false;
    for (var i = 4; i < process.argv.length; i++) {
      if (process.argv[i] == "--top") {
	top = parseInt(process.argv[i + 1]);
      }
      if (process.argv[i] == "--most-recent-only") {
	mostRecentOnly = true;
      }
    }

    return {
      type: "crate-build",
      toolchain: toolchain,
      top: top,
      mostRecentOnly: mostRecentOnly
    };
  } else if (type == "custom-build") {
    var gitRepo = process.argv[3];
    var commitSha = process.argv[4];
    if (!gitRepo || !commitSha) {
      return null;
    }

    return {
      type: "custom-build",
      gitRepo: gitRepo,
      commitSha: commitSha
    };
  }
}

main();
