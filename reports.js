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
function createWeeklyReport(date, dbCredentials, rustDistAddr, indexAddr, cacheDir) {
  return createCurrentReport(date, rustDistAddr).then(function(current) {
    return db.connect(dbCredentials).then(function(dbctx) {
      return {
	current: current,
	dbctx: dbctx
      };
    });
  }).then(function(state) {
    var stableToolchain = { channel: "stable", archiveDate: state.current.stable };
    var betaToolchain = { channel: "beta", archiveDate: state.current.beta };
    var nightlyToolchain = { channel: "nightly", archiveDate: state.current.nightly };
    var betaRegressions = calculateRegressions(state.dbctx, stableToolchain, betaToolchain);
    var nightlyRegressions = calculateRegressions(state.dbctx, betaToolchain, nightlyToolchain);
    var betaRootRegressions = pruneDependentRegressions(betaRegressions, indexAddr, cacheDir);
    var nightlyRootRegressions = pruneDependentRegressions(nightlyRegressions, indexAddr, cacheDir);

    return {
      date: date,
      current: state.current,
      betaRegressions: betaRegressions,
      nightlyRegressions: nightlyRegressions,
      betaRootRegressions: betaRootRegressions,
      nightlyRootRegressions: nightlyRootRegressions
    };
  });
}

function calculateRegressions(dbctx, fromToolchain, toToolchain) {
  
}

function pruneDependentRegressions(regressions, indexAddr, cacheDir) {
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
