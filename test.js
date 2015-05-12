var debug = require('debug')(__filename.slice(__dirname.length + 1));
var assert = require('assert');
var fs = require('fs');
var Promise = require('promise');

var crates = require('./crate-index');
var dist = require('./rust-dist');
var util = require('./crater-util');
var db = require('./crater-db');
var scheduler = require('./scheduler');
var reports = require('./reports');

var testDataDir = "./test";
var testDistDir = testDataDir + "/dist";
var testCrateIndexAddr = testDataDir + "/crates.io-index";

var tmpDir = "./testtmp";

var testConfig = {
  rustDistAddr: testDataDir + "/dist",
  crateIndexAddr: testDataDir + "/crates.io-index",
  dlRootAddr: testDataDir + "/versions",
  cacheDir: tmpDir + "/cache",
  dbName: "crater-test",
  dbCredentials: {
    username: "crater-test",
    password: "crater-test",
    host: "localhost",
    port: 5432
  }
};

var liveConfig = util.loadDefaultConfig();

function rmTempDir() {
  return util.runCmd("rm -Rf '" + tmpDir + "'");
}

function cleanTempDir() {
  return rmTempDir().then(function() {
    return util.runCmd("mkdir -p '" + tmpDir + "'");
  });
}

function cleanTempDb() {
  return db.connect(testConfig).then(function(dbctx) {
    debug("a");
    var p = db.depopulate(dbctx);
    var p = p.then(function() { db.disconnect(dbctx); });
    return p;
  });
}

function runBeforeEach(done) {
  cleanTempDir()
    .then(function() {
      return crates.updateCaches(testConfig);
    })
    .then(function() { done(); })
    .catch(function(e) { done(e); });
}

function runAfterEach(done) {
  rmTempDir()
    .then(function() { done(); })
    .catch(function(e) { done(e); });
}

function runBeforeEachDb(done) {
  cleanTempDir()
    .then(function() { return cleanTempDb(); })
    .then(function() { done(); })
    .catch(function(e) { done(e); });
}

suite("local crate-index tests", function() {

  beforeEach(runBeforeEach);
  afterEach(runAfterEach);

  test("load crates", function(done) {
    var p = crates.loadCrates(testConfig);
    p = p.then(function(crates) {
      assert(crates.length > 0);
      done();
    });
    p = p.catch(function(e) { done(e) });
  });

  test("get most recent revs", function(done) {
    var p = crates.loadCrates(testConfig);
    p.then(function(crateData) {
      return crates.getMostRecentRevs(crateData);
    }).then(function(recent) {
      assert(recent["toml"].vers == "0.1.20");
      assert(recent["obj-rs"].vers == "0.4.7");
      done();
    }).catch(function(e) { done(e); });
  });

  test("get dag", function(done) {
    var p = crates.loadCrates(testConfig);
    p.then(function(crateData) {
      return crates.getDag(crateData);
    }).then(function(crateData) {
      assert(crateData["piston"][0] == "pistoncore-input");
      done();
    }).catch(function(e) { done(e); });
  });

  test("get popularity map", function(done) {
    var p = crates.loadCrates(testConfig);
    p.then(function(crateData) {
      var pop = crates.getPopularityMap(crateData);
      assert(pop.time == 92);
      assert(pop.num == 66);
      assert(pop.piston == 1);
      done();
    }).catch(function(e) { done(e); });
  });

  // Test that concurrent access to the crate index doesn't break things because
  // of interleaved I/O.
  test("concurrent no clobber", function(done) {
    var responses = 0;
    for (var i = 0; i < 4; i++) {
      crates.loadCrates(testConfig).then(function(crateData) {
	assert(crateData.length == 8827);
	responses += 1;
	if (responses == 4) {
	  done();
	}
      }).catch(function(e) { done(e); });
    }
  });

});

suite("local rust-dist tests", function() {

  beforeEach(runBeforeEach);
  afterEach(runAfterEach);

  test("download dist index", function(done) {
    var p = dist.downloadIndex(testConfig);
    p = p.then(function(index) {
      assert(index.ds[0].children.fs[1].name == "channel-rust-beta");
      done();
    });
    p = p.catch(function(e) { done(e) });
  });

  test("get available toolchains", function(done) {
    var p = dist.downloadIndex(testConfig);
    p = p.then(function(index) {
      var toolchains = dist.getAvailableToolchainsFromIndex(index);
      assert(toolchains.nightly.indexOf("2015-02-20") != -1);
      assert(toolchains.beta.indexOf("2015-02-20") != -1);
      assert(toolchains.stable.indexOf("2015-02-20") == -1);
      done();
    });
    p = p.catch(function(e) { done(e) });
  });

  test("get available toolchains sorted", function(done) {
    var p = dist.downloadIndex(testConfig);
    p = p.then(function(index) {
      var toolchains = dist.getAvailableToolchainsFromIndex(index);
      assert(toolchains.nightly.indexOf("2015-02-20") != -1);
      assert(toolchains.beta.indexOf("2015-02-20") != -1);
      assert(toolchains.stable.indexOf("2015-02-20") == -1);
      done();
    });
    p = p.catch(function(e) { done(e) });
  });

  test("get available toolchains without separate download", function(done) {
    var p = dist.getAvailableToolchains(testConfig);
    p = p.then(function(toolchains) {
      assert(toolchains.nightly.indexOf("2015-02-20") != -1);
      assert(toolchains.beta.indexOf("2015-02-20") != -1);
      assert(toolchains.stable.indexOf("2015-02-20") == -1);
      done();
    });
    p = p.catch(function(e) { done(e) });
  });

  test("get installer url", function(done) {
    var toolchain = { channel: "beta", archiveDate: "2015-03-03" };
    dist.installerUrlForToolchain(toolchain, "x86_64-unknown-linux-gnu", testConfig)
      .then(function(url) {
	assert(url == testDistDir + "/2015-03-03/rust-1.0.0-alpha.2-x86_64-unknown-linux-gnu.tar.gz");
	done();
      }).catch(function(e) { done(e) });
  });
});

suite("local utility tests", function() {

  beforeEach(runBeforeEach);
  afterEach(runAfterEach);

  test("parse toolchain", function() {
    assert(util.parseToolchain(null) == null);
    assert(util.parseToolchain("nightly") == null);
    var actual = JSON.stringify(util.parseToolchain("nightly-2015-03-01"));
    var ex = JSON.stringify({ channel: "nightly", archiveDate: "2015-03-01" });
    assert(actual == ex);
    var actual = JSON.stringify(util.parseToolchain("beta-2015-03-01"));
    var ex = JSON.stringify({ channel: "beta", archiveDate: "2015-03-01" });
    assert(actual == ex);
    var actual = JSON.stringify(util.parseToolchain("stable-2015-03-01"));
    var ex = JSON.stringify({ channel: "stable", archiveDate: "2015-03-01" });
    assert(actual == ex);
  });

});

suite("database tests", function() {
  beforeEach(runBeforeEachDb);
  afterEach(runAfterEach);

  test("populate and depopulate", function(done) {
    db.connect(testConfig).then(function(dbctx) {
      var p = db.populate(dbctx);
      var p = p.then(function() { return db.depopulate(dbctx); });
      var p = p.then(function() { return db.disconnect(dbctx); });
      var p = p.then(function() { done(); });
      return p;
    }).catch(function(e) { done(e); });
  });

  test("add build result", function(done) {
    db.connect(testConfig).then(function(dbctx) {
      var actual = {
	toolchain: util.parseToolchain("nightly-2015-03-01"),
	crateName: "toml",
	crateVers: "1.0",
	status: "success",
	taskId: "foo"
      };
      var p = Promise.resolve();
      var p = p.then(function() { return db.addBuildResult(dbctx, actual); });
      var p = p.then(function() { return db.getBuildResult(dbctx, actual); });
      var p = p.then(function(br) { assert(JSON.stringify(br) == JSON.stringify(actual)); });
      var p = p.then(function() { return db.disconnect(dbctx); });
      var p = p.then(function() { done(); });
      return p;
    }).catch(function(e) { done(e); });
  });

  test("upsert build result", function(done) {
    db.connect(testConfig).then(function(dbctx) {
      var actual = {
	toolchain: util.parseToolchain("nightly-2015-03-01"),
	crateName: "toml",
	crateVers: "1.0",
	status: "success",
	taskId: "foo"
      };
      var p = Promise.resolve();
      // Call addBuildResult twice, an insert then an update
      var p = p.then(function() { return db.addBuildResult(dbctx, actual); });
      var p = p.then(function() { return db.addBuildResult(dbctx, actual); });
      var p = p.then(function() { return db.getBuildResult(dbctx, actual); });
      var p = p.then(function(br) { assert(JSON.stringify(br) == JSON.stringify(actual)); });
      var p = p.then(function() { return db.disconnect(dbctx); });
      var p = p.then(function() { done(); });
      return p;
    }).catch(function(e) { done(e); });
  });

  test("get null build result", function(done) {
    db.connect(testConfig).then(function(dbctx) {
      var req = {
	toolchain: util.parseToolchain("nightly-2015-03-01"),
	crateName: "toml",
	crateVers: "1.0"
      };
      var p = Promise.resolve();
      var p = p.then(function() { return db.getBuildResult(dbctx, req); });
      var p = p.then(function(br) { assert(br == null); });
      var p = p.then(function() { return db.disconnect(dbctx); });
      var p = p.then(function() { done(); });
      return p;
    }).catch(function(e) { done(e); });
  });

  test("get result pairs", function(done) {
    db.connect(testConfig).then(function(dbctx) {
      var oldResult1 = {
	toolchain: util.parseToolchain("beta-2015-03-01"),
	crateName: "num",
	crateVers: "1.0",
	status: "success",
	taskId: "t1"
      };
      var oldResult2 = {
	toolchain: util.parseToolchain("beta-2015-03-01"),
	crateName: "toml",
	crateVers: "1.1",
	status: "success",
	taskId: "t2"
      };
      var newResult1 = {
	toolchain: util.parseToolchain("nightly-2015-03-02"),
	crateName: "num",
	crateVers: "1.0",
	status: 'failure',
	taskId: "t3"
      };
      var newResult2 = {
	toolchain: util.parseToolchain("nightly-2015-03-02"),
	crateName: "toml",
	crateVers: "1.1",
	status: "success",
	taskId: "t2"
      };
      var fromToolchain = util.parseToolchain("beta-2015-03-01");
      var toToolchain = util.parseToolchain("nightly-2015-03-02");
      var p = Promise.resolve();
      var p = p.then(function() { return db.addBuildResult(dbctx, oldResult1); });
      var p = p.then(function() { return db.addBuildResult(dbctx, oldResult2); });
      var p = p.then(function() { return db.addBuildResult(dbctx, newResult1); });
      var p = p.then(function() { return db.addBuildResult(dbctx, newResult2); });
      var p = p.then(function() { return db.getResultPairs(dbctx, fromToolchain, toToolchain); });
      var p = p.then(function(results) {
	assert(results[0].crateName == "num");
	assert(results[0].crateVers == "1.0");
	assert(results[0].from.status == "success");
	assert(results[0].to.status == "failure");
	assert(results[1].crateName == "toml");
	assert(results[1].crateVers == "1.1");
	assert(results[1].from.status == "success");
	assert(results[1].to.status == "success");
      });
      var p = p.then(function() { return db.disconnect(dbctx); });
      var p = p.then(function() { done(); });
      return p;
    }).catch(function(e) { done(e); });
  });

  test("add custom toolchain", function(done) {
    db.connect(testConfig).then(function(dbctx) {
      var toolchain = util.parseToolchain("aaaaabbbbbaaaaabbbbbaaaaabbbbbaaaaabbbbb");
      var custom = {
	toolchain: toolchain,
	url: "http://foo",
	taskId: "myTask"
      };
      var p = Promise.resolve();
      var p = p.then(function() { return db.addCustomToolchain(dbctx, custom); });
      var p = p.then(function() { return db.getCustomToolchain(dbctx, toolchain); });
      var p = p.then(function(c) { assert(JSON.stringify(c) == JSON.stringify(custom)); });
      var p = p.then(function() { return db.disconnect(dbctx); });
      var p = p.then(function() { done(); });
      return p;
    }).catch(function(e) { done(e); });
  });

});

suite("scheduler tests", function() {

  beforeEach(runBeforeEach);
  afterEach(runAfterEach);

  test("schedule top crates", function(done) {
    var dbctx;
    db.connect(testConfig).then(function(d) {
      dbctx = d;
    }).then(function() {
      var options = { toolchain: { channel: "nightly", archiveDate: "2015-03-03" }, top: 2 };
      return scheduler.createSchedule(options, testConfig, dbctx);
    }).then(function(schedule) {
      return db.disconnect(dbctx).then(function() { return schedule; } );
    }).then(function(schedule) {
      assert(schedule[0].crateName == "winapi");
      assert(schedule[schedule.length - 1].crateName == "libc");
      done();
    }).catch(function(e) { done(e); }).done();
  });

  test("schedule most recent", function(done) {
    var dbctx;
    db.connect(testConfig).then(function(d) {
      dbctx = d;
    }).then(function() {
      var options = { toolchain: { channel: "nightly", archiveDate: "2015-03-03" }, top: 2, mostRecentOnly: true };
      return scheduler.createSchedule(options, testConfig, dbctx);
    }).then(function(schedule) {
      return db.disconnect(dbctx).then(function() { return schedule; } );
    }).then(function(schedule) {
      assert(schedule.length == 2);
      assert(schedule[0].crateName == "winapi");
      assert(schedule[1].crateName == "libc");
      done();
    }).catch(function(e) { done(e); }).done();
  });

  test("schedule skip existing results", function(done) {
    var toolchain = { channel: "nightly", archiveDate: "2015-03-03" };
    var dbctx;
    db.connect(testConfig).then(function(d) {
      dbctx = d;

      // Add a successful result, that we don't want rescheduled again
      var buildResult = {
	toolchain: toolchain,
	crateName: "libc",
	crateVers: "0.1.6",
	status: "success",
	taskId: "whatever"
      };
      return db.addBuildResult(dbctx, buildResult);
    }).then(function() {
      var options = {
	toolchain: toolchain,
	top: 2,
	mostRecentOnly: true,
	skipExisting: true
      };
      return scheduler.createSchedule(options, testConfig, dbctx);
    }).then(function(schedule) {
      return db.disconnect(dbctx).then(function() { return schedule; } );
    }).then(function(schedule) {
      assert(schedule.length == 1);
      assert(schedule[0].crateName == "winapi");
      done();
    }).catch(function(e) { done(e); }).done();
  });

});

suite("report tests", function() {

  beforeEach(runBeforeEach);
  afterEach(runAfterEach);

  test("current report", function(done) {
    reports.createCurrentReport("2015-03-03", testConfig).then(function(report) {
      assert(report.nightly == "2015-02-26");
      assert(report.beta == "2015-02-20");
      assert(report.stable == null);
      done();
    }).catch(function(e) { done(e); });
  });

  test("weekly report", function(done) {
    var oldResultWorking = {
      toolchain: util.parseToolchain("beta-2015-02-20"),
      crateName: "num",
      crateVers: "1.0",
      status: "success",
      taskId: "t"
    };
    var newResultWorking = {
      toolchain: util.parseToolchain("nightly-2015-02-26"),
      crateName: "num",
      crateVers: "1.0",
      status: "success",
      taskId: "t"
    };
    var oldResultNotWorking = {
      toolchain: util.parseToolchain("beta-2015-02-20"),
      crateName: "op",
      crateVers: "1.0",
      status: 'failure',
      taskId: "t"
    };
    var newResultNotWorking = {
      toolchain: util.parseToolchain("nightly-2015-02-26"),
      crateName: "op",
      crateVers: "1.0",
      status: 'failure',
      taskId: "t"
    };
    var oldResultRegressed = {
      toolchain: util.parseToolchain("beta-2015-02-20"),
      crateName: "plot",
      crateVers: "1.0",
      status: "success",
      taskId: "t"
    };
    var newResultRegressed = {
      toolchain: util.parseToolchain("nightly-2015-02-26"),
      crateName: "plot",
      crateVers: "1.0",
      status: 'failure',
      taskId: "t"
    };
    var oldResultFixed = {
      toolchain: util.parseToolchain("beta-2015-02-20"),
      crateName: "quux",
      crateVers: "1.0",
      status: 'failure',
      taskId: "t"
    };
    var newResultFixed = {
      toolchain: util.parseToolchain("nightly-2015-02-26"),
      crateName: "quux",
      crateVers: "1.0",
      status: "success",
      taskId: "t"
    };
    var dbctx;
    db.connect(testConfig).then(function(d) {
      dbctx = d;
    }).then(function() { return db.addBuildResult(dbctx, oldResultWorking);
    }).then(function() { return db.addBuildResult(dbctx, newResultWorking);
    }).then(function() { return db.addBuildResult(dbctx, oldResultNotWorking);
    }).then(function() { return db.addBuildResult(dbctx, newResultNotWorking);
    }).then(function() { return db.addBuildResult(dbctx, oldResultRegressed);
    }).then(function() { return db.addBuildResult(dbctx, newResultRegressed);
    }).then(function() { return db.addBuildResult(dbctx, oldResultFixed);
    }).then(function() { return db.addBuildResult(dbctx, newResultFixed);
    }).then(function() {
      return reports.createWeeklyReport("2015-03-03", dbctx, testConfig);
    }).then(function(report) {
      return db.disconnect(dbctx).then(function() { return report; } );
    }).then(function(report) {
      assert(report.date == "2015-03-03");

      assert(report.currentReport.nightly == "2015-02-26");
      assert(report.currentReport.beta == "2015-02-20");
      assert(report.currentReport.stable == null);

      assert(report.beta.statuses.length == 0);
      assert(report.nightly.statuses[0].status == "working");
      assert(report.nightly.statuses[1].status == "broken");
      assert(report.nightly.statuses[2].status == "regressed");
      assert(report.nightly.statuses[3].status == "fixed");

      assert(report.nightly.statusSummary.working == 1);
      assert(report.nightly.statusSummary.broken == 1);
      assert(report.nightly.statusSummary.regressed == 1);
      assert(report.nightly.statusSummary.fixed == 1);

      assert(report.nightly.regressions[0].crateName = "plot");

      done();
    }).catch(function(e) { done(e) });
  });

  test("weekly report prune regressed leaves", function(done) {
    var oldResultRegressed = {
      toolchain: util.parseToolchain("beta-2015-02-20"),
      crateName: "piston",
      crateVers: "0.0.7",
      status: "success",
      taskId: "t"
    };
    var newResultRegressed = {
      toolchain: util.parseToolchain("nightly-2015-02-26"),
      crateName: "piston",
      crateVers: "0.0.7",
      status: 'failure',
      taskId: "t"
    };
    var oldResultRegressedDep = {
      toolchain: util.parseToolchain("beta-2015-02-20"),
      crateName: "pistoncore-input",
      crateVers: "0.0.5",
      status: "success",
      taskId: "t"
    };
    var newResultRegressedDep = {
      toolchain: util.parseToolchain("nightly-2015-02-26"),
      crateName: "pistoncore-input",
      crateVers: "0.0.5",
      status: 'failure',
      taskId: "t"
    };
    var dbctx;
    db.connect(testConfig).then(function(d) {
      dbctx = d;
    }).then(function() { return db.addBuildResult(dbctx, oldResultRegressed);
    }).then(function() { return db.addBuildResult(dbctx, newResultRegressed);
    }).then(function() { return db.addBuildResult(dbctx, oldResultRegressedDep);
    }).then(function() { return db.addBuildResult(dbctx, newResultRegressedDep);
    }).then(function() {
      return reports.createWeeklyReport("2015-03-03", dbctx, testConfig);
    }).then(function(report) {
      return db.disconnect(dbctx).then(function() { return report; } );
    }).then(function(report) {

      // 'piston' is not a root regression
      assert(report.nightly.rootRegressions.length == 1);
      assert(report.nightly.rootRegressions[0].crateName == "pistoncore-input");

      done();
    }).catch(function(e) { done(e) });
  });

  test("weekly report sort by popularity", function(done) {
    var oldResultRegressed = {
      toolchain: util.parseToolchain("beta-2015-02-20"),
      crateName: "piston",
      crateVers: "0.0.7",
      status: "success",
      taskId: "t"
    };
    var newResultRegressed = {
      toolchain: util.parseToolchain("nightly-2015-02-26"),
      crateName: "piston",
      crateVers: "0.0.7",
      status: 'failure',
      taskId: "t"
    };
    var oldResultRegressedDep = {
      toolchain: util.parseToolchain("beta-2015-02-20"),
      crateName: "url",
      crateVers: "0.0.5",
      status: "success",
      taskId: "t"
    };
    var newResultRegressedDep = {
      toolchain: util.parseToolchain("nightly-2015-02-26"),
      crateName: "url",
      crateVers: "0.0.5",
      status: 'failure',
      taskId: "t"
    };
    var dbctx;
    db.connect(testConfig).then(function(d) {
      dbctx = d;
    }).then(function() { return db.addBuildResult(dbctx, oldResultRegressed);
    }).then(function() { return db.addBuildResult(dbctx, newResultRegressed);
    }).then(function() { return db.addBuildResult(dbctx, oldResultRegressedDep);
    }).then(function() { return db.addBuildResult(dbctx, newResultRegressedDep);
    }).then(function() {
      return reports.createWeeklyReport("2015-03-03", dbctx, testConfig);
    }).then(function(report) {
      return db.disconnect(dbctx).then(function() { return report; } );
    }).then(function(report) {

      assert(report.nightly.regressions[0].crateName == "url");
      assert(report.nightly.regressions[1].crateName == "piston");

      done();
    }).catch(function(e) { done(e) });
  });

});

suite("live network tests", function() {

  beforeEach(runBeforeEach);
  afterEach(runAfterEach);

  test("download dist index", function(done) {
    var p = dist.downloadIndex(liveConfig);
    p = p.then(function(index) {
      done()
    });
    p = p.catch(function(e) { done(e) });
  });

  test("load crates", function(done) {
    var p = crates.cloneIndex(liveConfig);
    p = p.then(function() { return crates.loadCrates(liveConfig); });
    p = p.then(function(crates) {
      assert(crates.length > 0);
      done();
    });
    p = p.catch(function(e) { done(e) });
  });

});

