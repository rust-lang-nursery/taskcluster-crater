'use strict';

var debug = require('debug')(__filename.slice(__dirname.length + 1));
var util = require('./crater-util');
var crateIndex = require('./crate-index');
var Promise = require('promise');
var db = require('./crater-db');
var assert = require('assert');
var dist = require('./rust-dist');

function createComparisonReport(fromToolchain, toToolchain, dbctx, config) {
  var statuses = calculateStatuses(dbctx, fromToolchain, toToolchain);
  return statuses.then(function(statuses) {
    return sortByPopularity(statuses, config);
  }).then(function(statuses) {
    var statusSummary = calculateStatusSummary(statuses);
    var regressions = extractWithStatus(statuses, "regressed");
    var rootRegressions = pruneDependentRegressions(regressions, config);
    return rootRegressions.then(function(rootRegressions) {
      var nonRootRegressions = pruneRootRegressions(regressions, rootRegressions);

      var working = extractWithStatus(statuses, "working");
      var broken = extractWithStatus(statuses, "broken");
      var fixed = extractWithStatus(statuses, "fixed");

      return {
	fromToolchain: fromToolchain,
	toToolchain: toToolchain,
	statuses: statuses,
	statusSummary: statusSummary,
	regressions: regressions,
	rootRegressions: rootRegressions,
	nonRootRegressions: nonRootRegressions,
	working: working,
	broken: broken,
	fixed: fixed
      };
    });
  });
}

/**
 * Returns a promise of the data for a 'weekly report'.
 */
function createWeeklyReport(date, dbctx, config) {
  return createCurrentReport(date, config).then(function(currentReport) {
    var stableToolchain = { channel: "stable", archiveDate: currentReport.stable };
    var betaToolchain = { channel: "beta", archiveDate: currentReport.beta };
    var nightlyToolchain = { channel: "nightly", archiveDate: currentReport.nightly };

    var betaReport = createComparisonReport(stableToolchain, betaToolchain, dbctx, config);
    return betaReport.then(function(betaReport) {
      var nightlyReport = createComparisonReport(betaToolchain, nightlyToolchain, dbctx, config);
      return nightlyReport.then(function(nightlyReport) {
	return {
	  date: date,
	  currentReport: currentReport,
	  betaStatuses: betaReport.statuses,
	  nightlyStatuses: nightlyReport.statuses,
	  betaStatusSummary: betaReport.statusSummary,
	  nightlyStatusSummary: nightlyReport.statusSummary,
	  betaRegressions: betaReport.regressions,
	  nightlyRegressions: nightlyReport.regressions,
	  betaRootRegressions: betaReport.rootRegressions,
	  nightlyRootRegressions: nightlyReport.rootRegressions,
	  betaNonRootRegressions: betaReport.nonRootRegressions,
	  nightlyNonRootRegressions: nightlyReport.nonRootRegressions
	};
      });
    });
  });
}

/**
 * Returns promise of array of `{ crateName, crateVers, status }`,
 * where `status` is either 'working', 'broken', 'regressed',
 * 'fixed'.
 */ 
function calculateStatuses(dbctx, fromToolchain, toToolchain) {

  if (fromToolchain.archiveDate == null || toToolchain.archiveDate == null) {
    return new Promise(function(resolve, reject) { resolve([]); });
  }

  return db.getResultPairs(dbctx, fromToolchain, toToolchain).then(function(buildResults) {
    return buildResults.map(function(buildResult) {
      var status = null;
      if (buildResult.from.success && buildResult.to.success) {
	status = "working";
      } else if (!buildResult.from.success && !buildResult.to.success) {
	status = "broken";
      } else if (buildResult.from.success && !buildResult.to.success) {
	status = "regressed";
      } else {
	assert(!buildResult.from.success && buildResult.to.success);
	status = "fixed";
      }

      var inspectorRoot = "https://tools.taskcluster.net/task-inspector/#";

      // Just modify the intermediate result
      buildResult.status = status;
      buildResult.from.inspectorLink = inspectorRoot + buildResult.from.taskId;
      buildResult.to.inspectorLink = inspectorRoot + buildResult.to.taskId;
      buildResult.registryUrl = makeRegistryUrl(buildResult.crateName);

      return buildResult;
    });
  });
}

function sortByPopularity(statuses, config) {
  return crateIndex.loadCrates(config).then(function(crates) {
    var popMap = crateIndex.getPopularityMap(crates);

    var sorted = statuses.slice();
    sorted.sort(function(a, b) {
      var aPop = popMap[a.crateName];
      var bPop = popMap[b.crateName];
      if (aPop == bPop) { return 0; }
      if (aPop < bPop) { return 1; }
      if (aPop > bPop) { return -1; }
    });

    return sorted;
  });
}

function calculateStatusSummary(statuses) {
  var working = 0;
  var broken = 0;
  var regressed = 0;
  var fixed = 0;
  statuses.forEach(function(status) {
    if (status.status == "working") {
      working += 1;
    } else if (status.status == "broken") {
      broken += 1;
    } else if (status.status == "regressed") {
      regressed += 1;
    } else {
      assert(status.status == "fixed");
      fixed += 1;
    }
  });

  return {
    working: working,
    broken: broken,
    regressed: regressed,
    fixed: fixed
  };
}

function extractWithStatus(statuses, needed) {
  var result = [];
  statuses.forEach(function(status) {
    if (status.status == needed) {
      result.push(status);
    }
  });
  return result;
}

function pruneDependentRegressions(regressions, config) {
  var regressionMap = {};
  regressions.forEach(function(r) {
    regressionMap[r.crateName] = r;
  });

  return crateIndex.loadCrates(config).then(function(crates) {
    var dag = crateIndex.getDag(crates);
    var independent = [];
    regressions.forEach(function(reg) {
      var isIndependent = true;
      var depStack = dag[reg.crateName];
      if (depStack == null) {
	// No info about this crate? Happens in the test suite.
	debug("no deps for " + reg.crateName);
      }
      while (depStack && depStack.length != 0 && isIndependent) {

	var nextDep = depStack.pop();
	if (regressionMap[nextDep]) {
	  debug(reg.crateName + " depends on regressed " + nextDep);
	  isIndependent = false;
	}

	if (dag[nextDep]) {
	  depStack.concat(dag[nextDep]);
	}
      }
      if (isIndependent) {
	debug(reg.crateName + " is an independent regression");
	independent.push(reg);
      }
    });
    return independent;
  });
}

function pruneRootRegressions(regs, rootRegs) {
  var rootRegMap = {};
  rootRegs.forEach(function(r) {
    rootRegMap[r.crateName] = r;
  });

  var dependent = []
  regs.forEach(function(reg) {
    if (!rootRegMap[reg.crateName]) {
      dependent.push(reg);
    }
  });

  return dependent;
}

/**
 * Returns a promise of a report on the current nightly/beta/stable revisions.
 */
function createCurrentReport(date, config) {
  return dist.getAvailableToolchains(config).then(function(toolchains) {
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

function createPopularityReport(config) {
  return crateIndex.loadCrates(config).then(function(crates) {
    var popMap = crateIndex.getPopularityMap(crates);

    return crates.map(function(crate) {
      return {
	crateName: crate.name,
	url: makeRegistryUrl(crate.name),
	pop: popMap[crate.name]
      };
    });
  }).then(function(crates) {
    var map = {}
    return crates.filter(function(crate) {
      if (map[crate.crateName]) {
	return false;
      } else {
	map[crate.crateName] = crate;
	return true;
      }
    });
  }).then(function(crates) {
    return sortByPopularity(crates, config);
  });
}

function makeRegistryUrl(name) {
  return "https://crates.io/crates/" + name;
}

exports.createWeeklyReport = createWeeklyReport;
exports.createCurrentReport = createCurrentReport;
exports.createComparisonReport = createComparisonReport;
exports.createPopularityReport = createPopularityReport;

