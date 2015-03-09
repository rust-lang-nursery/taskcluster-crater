'use strict';

var util = require('./crater-util');
var crates = require('./crate-index');

function createScheduleForAllCratesForToolchain(toolchain, indexAddr, cacheDir) {
  var p = crates.loadCrates(indexAddr, cacheDir)
    .then(function(crates) {
    });

}

function scheduleBuilds(schedule) {
}

exports.createScheduleForAllCratesForToolchain = createScheduleForAllCratesForToolchain
exports.scheduleBuilds = scheduleBuilds
