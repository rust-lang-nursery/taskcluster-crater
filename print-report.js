'use strict';

var debug = require('debug')(__filename.slice(__dirname.length + 1));
var reports = require('./reports');
var util = require('./crater-util');
var dist = require('./rust-dist');
var crateIndex = require('./crate-index');
var db = require('./crater-db');
var fs = require('fs');

function main() {
  var reportSpec = getReportSpecFromArgs();
  if (!reportSpec) {
    console.log("can't parse report spec");
    process.exit(1);
  }

  var config = util.loadDefaultConfig();
  crateIndex.updateCaches(config).then(function() {
    printReport(config, reportSpec);
  });
}

function printReport(config, reportSpec) {
  if (reportSpec.type == "current") {
    var date = reportSpec.date;
    reports.createCurrentReport(date, config).then(function(report) {
      console.log("# Current Report");
      console.log();
      console.log("* current stable is " + report.stable);
      console.log("* current beta is " + report.beta);
      console.log("* current nightly is " + report.nightly);
    }).done();
  } else if (reportSpec.type == "weekly") {
    var date = reportSpec.date;
    db.connect(config).then(function(dbctx) {
      var p = reports.createWeeklyReport(date, dbctx, config);
      return p.then(function(report) {
	console.log("# Weekly Report");
	console.log();
	console.log("Date: " + report.date);
	console.log();
	console.log("## Current releases");
	console.log();
	console.log("* The most recent stable release is " + report.currentReport.stable + ".");
	console.log("* The most recent beta release is " + report.currentReport.beta + ".");
	console.log("* The most recent nightly release is " + report.currentReport.nightly + ".");
	console.log();
	console.log("## Coverage");
	console.log();
	console.log("From stable to beta:");
	console.log("* " + report.beta.statuses.length + " crates tested: " +
		    report.beta.statusSummary.working + " working / " +
		    report.beta.statusSummary.notWorking + " not working / " +
		    report.beta.statusSummary.regressed + " regressed / " +
		    report.beta.statusSummary.fixed + " fixed.");
	console.log();
	console.log("From beta to nightly:");
	console.log("* " + report.nightly.statuses.length + " crates tested: " +
		    report.nightly.statusSummary.working + " working / " +
		    report.nightly.statusSummary.broken + " broken / " +
		    report.nightly.statusSummary.regressed + " regressed / " +
		    report.nightly.statusSummary.fixed + " fixed.");
	console.log();
	console.log("## Regressions");
	console.log();
	console.log("* There are currently " + report.beta.rootRegressions.length +
		    " root regressions from stable to beta.");
	console.log("* There are currently " + report.nightly.rootRegressions.length +
		    " root regressions from beta to nightly.");
	console.log("* There are currently " + report.beta.regressions.length +
		    " regressions from stable to beta.");
	console.log("* There are currently " + report.nightly.regressions.length +
		    " regressions from beta to nightly.");
	console.log();
	console.log("## Beta root regressions, sorted by popularity:");
	printCrateList(report.beta.rootRegressions);
	console.log("## Nightly root regressions, sorted by popularity:");
	printCrateList(report.nightly.rootRegressions);
	console.log("## Beta non-root regressions, sorted by popularity:");
	printCrateList(report.beta.regressions);
	console.log("## Nightly non-root regressions, sorted by popularity:");
	printCrateList(report.nightly.regressions);
	console.log("## Beta broken, sorted by popularity:");
	printCrateList(report.beta.broken);
	console.log("## Nightly broken, sorted by popularity:");
	printCrateList(report.nightly.broken);
	console.log("## Beta fixed, sorted by popularity:");
	printCrateList(report.beta.fixed);
	console.log("## Nightly fixed, sorted by popularity:");
	printCrateList(report.nightly.fixed);
      }).then(function() {
	return db.disconnect(dbctx);
      });
    }).done();
  } else if (reportSpec.type == "comparison") {
    var date = reportSpec.date;
    db.connect(config).then(function(dbctx) {
      var p = reports.createComparisonReport(reportSpec.fromToolchain, reportSpec.toToolchain,
					     dbctx, config);
      return p.then(function(report) {
	console.log("# Comparison report");
	console.log();
	console.log("* From: " + util.toolchainToString(report.fromToolchain));
	console.log("* To: " + util.toolchainToString(report.toToolchain));
	console.log();
	console.log("## Coverage");
	console.log();
	console.log("* " + report.statuses.length + " crates tested: " +
		    report.statusSummary.working + " working / " +
		    report.statusSummary.broken + " broken / " +
		    report.statusSummary.regressed + " regressed / " +
		    report.statusSummary.fixed + " fixed.");
	console.log();
	console.log("## Regressions");
	console.log();
	console.log("* There are " + report.rootRegressions.length + " root regressions");
	console.log("* There are " + report.regressions.length + " regressions");
	console.log();
	console.log("## Root regressions, sorted by popularity:");
	printCrateList(report.rootRegressions);
	console.log("## Non-root regressions, sorted by popularity:");
	printCrateList(report.nonRootRegressions);
	console.log("## Broken, sorted by popularity:");
	printCrateList(report.broken);
	console.log("## Fixed, sorted by popularity:");
	printCrateList(report.fixed);
	console.log("## Working, sorted by popularity:");
	printCrateList(report.working);
      }).then(function() {
	return db.disconnect(dbctx);
      });
    }).done();
  } else if (reportSpec.type == "popularity") {
    reports.createPopularityReport(config).then(function(report) {
      console.log("# Popularity report");
      console.log("");
      report.forEach(function(r) {
	console.log("* " + r.pop + " [" + r.crateName + "](" + r.registryUrl + ")");
      });
    });
  } else if (reportSpec.type == "toolchain") {
    db.connect(config).then(function(dbctx) {
      return reports.createToolchainReport(reportSpec.toolchain, dbctx, config).then(function(report) {
	console.log("# Toolchain report for " + util.toolchainToString(report.toolchain));
	console.log("");
	console.log("* " + report.successes.length + " successes / " + report.failures.length + " failures");
	console.log("");
	console.log("## Failures");
	console.log("");
	report.failures.forEach(function(r) {
	  var s = "* [" + r.crateName + "-" + r.crateVers + "](" + r.inspectorLink + ")";
	  console.log(s);
	});
	console.log("");
	console.log("## Successes");
	console.log("");
	report.successes.forEach(function(r) {
	  var s = "* [" + r.crateName + "-" + r.crateVers + "](" + r.inspectorLink + ")";
	  console.log(s);
	});
	console.log("");

	return db.disconnect(dbctx);
      });
    }).done();
  } else {
    console.log("unknown report type");
  }
}

function printCrateList(statuses) {
  console.log();
  statuses.forEach(function(reg) {
    var fromLink = reg.from.inspectorLink;
    var toLink = reg.to.inspectorLink;
    var s = "* [" + reg.crateName + "-" + reg.crateVers + "](" + reg.registryUrl + ") " +
      "([before](" + fromLink + ")) " +
      "([after](" + toLink + "))";
    console.log(s);
  });
  console.log();
}

function getReportSpecFromArgs() {
  if (process.argv[2] == "current") {
    return {
      type: "current",
      date: process.argv[3] || util.rustDate(new Date(Date.now()))
    };
  } else if (process.argv[2] == "weekly") {
    return {
      type: "weekly",
      date: process.argv[3] || util.rustDate(new Date(Date.now()))
    };
  } else if (process.argv[2] == "comparison") {
    if (!process.argv[3] || !process.argv[4]) {
      return null;
    }
    return {
      type: "comparison",
      fromToolchain: util.parseToolchain(process.argv[3]),
      toToolchain: util.parseToolchain(process.argv[4])
    };
  } else if (process.argv[2] == "popularity") {
    return {
      type: "popularity"
    };
  } else if (process.argv[2] == "toolchain") {
    return {
      type: "toolchain",
      toolchain: util.parseToolchain(process.argv[3])
    };
  } else {
    return null;
  }
}

main();
