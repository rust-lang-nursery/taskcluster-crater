'use strict';

var debug = require('debug')(__filename.slice(__dirname.length + 1));
var util = require('./crater-util');
var crateIndex = require('./crate-index');
var Promise = require('promise');
var db = require('./crater-db');
var assert = require('assert');
var dist = require('./rust-dist');

/**
 * Returns a promise of the data for a 'weekly report'.
 */
function createWeeklyReport(date, dbctx, rustDistAddr, indexAddr, cacheDir) {
  return createCurrentReport(date, rustDistAddr).then(function(currentReport) {
    return {
      currentReport: currentReport
    };
  }).then(function(state) {
    var stableToolchain = { channel: "stable", archiveDate: state.currentReport.stable };
    var betaToolchain = { channel: "beta", archiveDate: state.currentReport.beta };
    var nightlyToolchain = { channel: "nightly", archiveDate: state.currentReport.nightly };

    var betaStatuses = calculateStatuses(dbctx, stableToolchain, betaToolchain);
    var nightlyStatuses = calculateStatuses(dbctx, betaToolchain, nightlyToolchain);

    return Promise.all([betaStatuses, nightlyStatuses]).then(function(statuses) {
      return {
	currentReport: state.currentReport,
	betaStatuses: statuses[0],
	nightlyStatuses: statuses[1]
      };
    });
  }).then(function(state) {

    var betaRegressions = calculateRegressions(state.betaStatuses);
    var nightlyRegressions = calculateRegressions(state.nightlyStatuses);
    var betaRootRegressions = pruneDependentRegressions(betaRegressions, indexAddr, cacheDir);
    var nightlyRootRegressions = pruneDependentRegressions(nightlyRegressions, indexAddr, cacheDir);

    return {
      date: date,
      currentReport: state.currentReport,
      betaStatuses: state.betaStatuses,
      nightlyStatuses: state.nightlyStatuses,
      betaRegressions: betaRegressions,
      nightlyRegressions: nightlyRegressions,
      betaRootRegressions: betaRootRegressions,
      nightlyRootRegressions: nightlyRootRegressions
    };
  });
}

/**
 * Returns promise of array of `{ crateName, crateVers, status }`,
 * where `status` is either 'working', 'not-working', 'regressed',
 * 'fixed'.
 */ 
function calculateStatuses(dbctx, fromToolchain, toToolchain) {

  if (fromToolchain.archiveDate == null || toToolchain.archiveDate == null) {
    return new Promise(function(resolve, reject) { resolve([]); });
  }

  return db.getResultPairs(dbctx, fromToolchain, toToolchain).then(function(buildResults) {
    debug(JSON.stringify(buildResults));
    return buildResults.map(function(buildResult) {
      var status = null;
      if (buildResult.from.success && buildResult.to.success) {
	status = "working";
      } else if (!buildResult.from.success && !buildResult.to.success) {
	status = "not-working";
      } else if (buildResult.from.success && !buildResult.to.success) {
	status = "regressed";
      } else {
	assert(!buildResult.from.success && buildResult.to.success);
	status = "fixed";
      }

      return {
	crateName: buildResult.crateName,
	crateVers: buildResult.crateVers,
	status: status
      };
    });
  });
}

function calculateRegressions(dbctx, fromToolchain, toToolchain) {
  return null;
}

function pruneDependentRegressions(regressions, indexAddr, cacheDir) {
  return null;
}

/**
 * Returns a promise of a report on the current nightly/beta/stable revisions.
 */
function createCurrentReport(date, rustDistAddr) {
  return dist.getAvailableToolchains(rustDistAddr).then(function(toolchains) {
    var currentNightlyDate = null;
    toolchains.nightly.forEach(function(toolchainDate) {
      if (toolchainDate <= date) {
	currentNightlyDate = toolchainDate;
      }
    });
    var currentBetaDate = null;
    toolchains.beta.forEach(function(toolchainDate) {
      if (toolchainDate <= date) {
	currentBetaDate = toolchainDate;
      }
    });
    var currentStableDate = null;
    toolchains.stable.forEach(function(toolchainDate) {
      if (toolchainDate <= date) {
	currentStableDate = toolchainDate;
      }
    });

    return {
      nightly: currentNightlyDate,
      beta: currentBetaDate,
      stable: currentStableDate
    };

  });
}

exports.createWeeklyReport = createWeeklyReport
exports.createCurrentReport = createCurrentReport
