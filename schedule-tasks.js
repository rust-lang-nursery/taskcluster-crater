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
  var toolchain = util.parseToolchain(process.argv[2])
  if (!toolchain) {
    console.log("can't parse toolchain");
    process.exit(1);
  }

  debug("scheduling for toolchain %s", JSON.stringify(toolchain));

  var config = util.loadDefaultConfig();

  crateIndex.cloneIndex(config)
    .then(function() {
      return scheduler.createScheduleForAllCratesForToolchain(toolchain, config);
    })
    .then(function(schedule) {
      return scheduler.scheduleBuilds(schedule, config);
    })
    .then(function(tasks) {
      console.log("created " + tasks.length + " tasks");
    })
    .done();
}

main();
