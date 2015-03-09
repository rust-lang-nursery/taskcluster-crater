'use strict';

var debug = require('debug')(__filename.slice(__dirname.length + 1));
var util = require('./crater-util');
var crateIndex = require('./crate-index');
var Promise = require('promise');
var async = require('async');

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
  var p = new Promise(function(resolve, reject) {
    var map = function(crate, cb) {
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
    };
    async.mapLimit(crates, 100, map, function(err, succ) {
      if (err) { reject(err); }
      else { resolve(succ); }
    });
  });
  // Filter out the nulls
  p = p.then(function(crates) {
    var remaining = crates.filter(function(crate) { return crate != null; });
    var final_length = remaining.length
    debug("filtered out " + (original_length - final_length) + " old crates");
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

function scheduleBuilds(schedule) {
}

exports.createScheduleForAllCratesForToolchain = createScheduleForAllCratesForToolchain
exports.scheduleBuilds = scheduleBuilds
