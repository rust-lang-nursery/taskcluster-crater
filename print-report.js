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

  var dbCredentials = JSON.parse(fs.readFileSync(db.defaultDbCredentialsFile, "utf8"));

  if (reportSpec.type == "current") {
    var date = reportSpec.date;
    reports.createCurrentReport(date).then(function(report) {
      console.log("# Current Report");
      console.log();
      console.log("* current stable is " + report.stable);
      console.log("* current beta is " + report.beta);
      console.log("* current nightly is " + report.nightly);
    }).done();
  } else if (reportSpec.type == "weekly") {
    var date = reportSpec.date;
    db.connect(dbCredentials).then(function(dbctx) {
      var p = reports.createWeeklyReport(date, dbctx,
					 dist.defaultDistAddr,
					 crateIndex.defaultIndexAddr,
					 crateIndex.defaultCacheDir);
      return p.then(function(report) {
	console.log("# Weekly Report");
	console.log();
	console.log("Date: " + report.date);
	console.log();
	console.log("The most recent stable release is " + report.currentReport.stable + ".");
	console.log("The most recent beta release is " + report.currentReport.beta + ".");
	console.log("The most recent nightly release is " + report.currentReport.nightly + ".");
	console.log();
	console.log("There are currently " + report.betaRegressions.length +
		    " regressions from stable to beta.");
	console.log("There are currently " + report.nightlyRegressions.length +
		    " regressions from beta to nightly.");
	console.log();
	console.log("From stable to beta:");
	console.log("* " + report.betaStatuses.length + " crates tested: " +
		    report.betaStatusSummary.working + " working / " +
		    report.betaStatusSummary.notWorking + " not working / " +
		    report.betaStatusSummary.regressed + " regressed / " +
		    report.betaStatusSummary.fixed + " fixed.");
	console.log();
	console.log("From beta to nightly:");
	console.log("* " + report.nightlyStatuses.length + " crates tested: " +
		    report.nightlyStatusSummary.working + " working / " +
		    report.nightlyStatusSummary.notWorking + " not working / " +
		    report.nightlyStatusSummary.regressed + " regressed / " +
		    report.nightlyStatusSummary.fixed + " fixed.");
	console.log();
	console.log("## Beta non-root regressions, by popularity");
      }).then(function() {
	return db.disconnect(dbctx);
      });
    }).done();
  }
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
    }
  } else {
    return null;
  }
}

main();
