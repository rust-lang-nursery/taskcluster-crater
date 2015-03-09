var debug = require('debug')(__filename.slice(__dirname.length + 1));
var assert = require('assert');
var fs = require('fs');
var Promise = require('promise');

var crates = require('./crate-index');
var dist = require('./rust-dist');
var util = require('./crater-util');
var db = require('./crater-db');
var scheduler = require('./scheduler');

var testDataDir = "./test";
var testCrateIndexAddr = testDataDir + "/crates.io-index";
var testDlRootAddrForVersions = testDataDir + "/versions";

var tmpDir = "./testtmp";
var tmpCacheDir = tmpDir + "/cache";

var testDbName = "crater-test";
var testDbCredentials = JSON.parse(fs.readFileSync(db.defaultDbCredentialsFile, "utf8"));

function rmTempDir() {
  return util.runCmd("rm -Rf '" + tmpDir + "'");
}

function cleanTempDir() {
  return rmTempDir().then(function() {
    return util.runCmd("mkdir -p '" + tmpDir + "'");
  });
}

function cleanTempDb() {
  return db.connect(testDbCredentials, testDbName).then(function(dbctx) {
    debug("a");
    var p = db.depopulate(dbctx);
    var p = p.then(function() { db.disconnect(dbctx); });
    return p;
  });
}

function runBeforeEach(done) {
  cleanTempDir()
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

suite("local rust-dist tests", function() {

  beforeEach(runBeforeEach);
  afterEach(runAfterEach);

  test("download dist index", function(done) {
    var p = dist.downloadIndex(testDataDir);
    p = p.then(function(index) {
      assert(index.ds[0].children.fs[1].name == "channel-rust-beta");
      done();
    });
    p = p.catch(function(e) { done(e) });
  });

  test("get available toolchains", function(done) {
    var p = dist.downloadIndex("./test");
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
    var p = dist.getAvailableToolchains(testDataDir);
    p = p.then(function(toolchains) {
      assert(toolchains.nightly.indexOf("2015-02-20") != -1);
      assert(toolchains.beta.indexOf("2015-02-20") != -1);
      assert(toolchains.stable.indexOf("2015-02-20") == -1);
      done();
    });
    p = p.catch(function(e) { done(e) });
  });
});

suite("local crate-index tests", function() {

  beforeEach(runBeforeEach);
  afterEach(runAfterEach);

  test("load crates", function(done) {
    var p = crates.loadCrates(testCrateIndexAddr, tmpCacheDir);
    p = p.then(function(crates) {
      assert(crates.length > 0);
      done();
    });
    p = p.catch(function(e) { done(e) });
  });

  test("get dl addr from index", function(done) {
    var p = crates.cloneIndex(testCrateIndexAddr, tmpCacheDir);
    p = p.then(function() {
      return crates.getDlRootAddrFromIndex(tmpCacheDir);
    });
    p = p.then(function(addr) {
      assert(addr == "https://crates.io/api/v1/crates");
      done();
    });
    p = p.catch(function(e) { done(e) });
  });

  test("get version metadata", function(done) {
    var p = crates.getVersionMetadata("toml", "0.1.18", testDlRootAddrForVersions, tmpCacheDir);
    p = p.then(function(meta) {
      assert(meta.version.created_at == "2015-02-25T22:53:39Z");
      done();
    });
    p = p.catch(function(e) { done(e) });
  });

  test("get cached version metadata", function(done) {
    var p = crates.getVersionMetadata("toml", "0.1.18", testDlRootAddrForVersions, tmpCacheDir);
    p = p.then(function(meta) {
      assert(meta.version.created_at == "2015-02-25T22:53:39Z");
    });
    p = p.then(function() {
      return crates.getVersionMetadata("toml", "0.1.18", testDlRootAddrForVersions, tmpCacheDir);
    });
    p = p.then(function(meta) {
      assert(meta.version.created_at == "2015-02-25T22:53:39Z");
      done();
    });
    p = p.catch(function(e) { done(e) });
  });

});

suite("local rust-dist tests", function() {

  beforeEach(runBeforeEach);
  afterEach(runAfterEach);

  test("download dist index", function(done) {
    var p = dist.downloadIndex(testDataDir);
    p = p.then(function(index) {
      assert(index.ds[0].children.fs[1].name == "channel-rust-beta");
      done();
    });
    p = p.catch(function(e) { done(e) });
  });

  test("get available toolchains", function(done) {
    var p = dist.downloadIndex("./test");
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
    var p = dist.getAvailableToolchains(testDataDir);
    p = p.then(function(toolchains) {
      assert(toolchains.nightly.indexOf("2015-02-20") != -1);
      assert(toolchains.beta.indexOf("2015-02-20") != -1);
      assert(toolchains.stable.indexOf("2015-02-20") == -1);
      done();
    });
    p = p.catch(function(e) { done(e) });
  });
});

suite("local utility tests", function() {

  beforeEach(runBeforeEach);
  afterEach(runAfterEach);

  test("parse toolchain", function() {
    assert(util.parseToolchain(null) == null);
    assert(util.parseToolchain("nightly") == null);
    var actual = JSON.stringify(util.parseToolchain("nightly-2015-03-01"));
    var ex = JSON.stringify({ channel: "nightly", date: "2015-03-01" });
    assert(actual == ex);
    var actual = JSON.stringify(util.parseToolchain("beta-2015-03-01"));
    var ex = JSON.stringify({ channel: "beta", date: "2015-03-01" });
    assert(actual == ex);
    var actual = JSON.stringify(util.parseToolchain("stable-2015-03-01"));
    var ex = JSON.stringify({ channel: "stable", date: "2015-03-01" });
    assert(actual == ex);
  });

});

suite("database tests", function() {
  beforeEach(runBeforeEachDb);
  afterEach(runAfterEach);

  test("populate and depopulate", function(done) {
    db.connect(testDbCredentials, testDbName).then(function(dbctx) {
      var p = db.populate(dbctx);
      var p = p.then(function() { return db.depopulate(dbctx); });
      var p = p.then(function() { return db.disconnect(dbctx); });
      var p = p.then(function() { done(); });
      return p;
    }).catch(function(e) { done(e); });
  });

  test("add build result", function(done) {
    db.connect(testDbCredentials, testDbName).then(function(dbctx) {
      var actual = {
	channel: "nightly",
	archiveDate: "2015-03-01",
	crateName: "toml",
	crateVers: "1.0",
	success: true
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
    db.connect(testDbCredentials, testDbName).then(function(dbctx) {
      var actual = {
	channel: "nightly",
	archiveDate: "2015-03-01",
	crateName: "toml",
	crateVers: "1.0",
	success: true
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
    db.connect(testDbCredentials, testDbName).then(function(dbctx) {
      var req = {
	channel: "nightly",
	archiveDate: "2015-03-01",
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

});

suite("scheduler tests", function() {

  beforeEach(runBeforeEach);
  afterEach(runAfterEach);

  test("schedule all crates", function(done) {
    var tc = { channel: "nightly", date: "2015-03-03" };
    var p = scheduler.createScheduleForAllCratesForToolchain(tc, testDlRootAddrForVersions, testCrateIndexAddr, tmpCacheDir);
    p = p.then(function(schedule) {
      var errors = false;
      schedule.forEach(function(build) {
	// In test/versions/toml/0.1.7 this has an old created_at date
	if (build.crateName == "toml" && build.crateVers == "0.1.7") {
	  errors = true;
	}
      });
      if (errors) {
	done("error");
      } else {
	done();
      }
    });
    p.done();
  });
});

suite("live network tests", function() {

  beforeEach(runBeforeEach);
  afterEach(runAfterEach);

  test("download dist index", function(done) {
    var p = dist.downloadIndex();
    p = p.then(function(index) {
      done()
    });
    p = p.catch(function(e) { done(e) });
  });

  test("load crates", function(done) {
    var p = crates.loadCrates();
    p = p.then(function(crates) {
      assert(crates.length > 0);
      done();
    });
    p = p.catch(function(e) { done(e) });
  });

  test("get version metadata", function(done) {
    var p = crates.cloneIndex();
    p = p.then(function() { return crates.getDlRootAddrFromIndex(); });
    p = p.then(function(addr) { return crates.getVersionMetadata("toml", "0.1.18", addr); });
    p = p.then(function(meta) {
      assert(meta.version.created_at == "2015-02-25T22:53:39Z");
      done();
    });
    p = p.catch(function(e) { done(e) });
  });

});

