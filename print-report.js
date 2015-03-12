'use strict';

var debug = require('debug')(__filename.slice(__dirname.length + 1));
var reports = require('./reports');
var util = require('./crater-util');

function main() {
  var reportSpec = getReportSpecFromArgs();
  if (!reportSpec) {
    console.log("can't parse report spec");
    process.exit(1);
  }

  if (reportSpec.type == "current") {
    var date = util.rustDate(new Date(Date.now()));
    reports.createCurrentReport(date).then(function(report) {
      console.log("# Current Report");
      console.log();
      console.log("* current nightly is " + report.nightly);
      console.log("* current beta is " + report.beta);
      console.log("* current stable is " + report.stable);
    }).done();
  }
}

function getReportSpecFromArgs() {
  if (process.argv[2] == "current") {
    return {
      type: "current"
    };
  } else {
    return null;
  }
}

main();
