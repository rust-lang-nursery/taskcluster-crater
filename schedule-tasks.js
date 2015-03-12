'use strict';

var debug = require('debug')(__filename.slice(__dirname.length + 1));
var fs = require('fs');
var util = require('./crater-util');
var tc = require('taskcluster-client');
var Promise = require('promise');
var slugid = require('slugid');
var scheduler = require('./scheduler');
var crateIndex = require('./crate-index');

var defaultTcCredentialsFile = "./tc-credentials.json";

var rustDistAddr = "http://static-rust-lang-org.s3-us-west-1.amazonaws.com/dist/";

function main() {
  var toolchain = util.parseToolchain(process.argv[2])
  if (!toolchain) {
    console.log("can't parse toolchain");
    process.exit(1);
  }

  debug("scheduling for toolchain %s", JSON.stringify(toolchain));

  var tcCredentials = loadTcCredentials(defaultTcCredentialsFile);

  debug("credentials: %s", JSON.stringify(tcCredentials));

  crateIndex.cloneIndex()
    .then(function() { return crateIndex.getDlRootAddrFromIndex(); })
    .then(function(dlRootAddr) {
      var p = scheduler.createScheduleForAllCratesForToolchain(toolchain, dlRootAddr);
      return p.then(function(schedule) {
	return {
	  dlRootAddr: dlRootAddr,
	  schedule: schedule
	};
      });
    })
    .then(function(scheduleAndRootAddr) {
      var schedule = scheduleAndRootAddr.schedule;
      var dlRootAddr = scheduleAndRootAddr.dlRootAddr;
      return scheduler.scheduleBuilds(schedule, dlRootAddr, rustDistAddr, tcCredentials);
    })
    .then(function(tasks) {
      console.log("created " + tasks.length + " tasks");
    })
    .done();
}

function loadTcCredentials(credentialsFile) {
  return JSON.parse(fs.readFileSync(credentialsFile, "utf8"));
}

main();
