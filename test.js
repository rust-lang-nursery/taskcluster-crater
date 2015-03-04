var debug = require('debug')(__filename.slice(__dirname.length + 1));
var assert = require('assert');
var spawn = require('child_process').spawn;
var fs = require('fs');

var crates = require('./crate-index');
var dist = require('./rust-dist');
var util = require('./crater-util');
var db = require('./crater-db');

var testDataDir = "./test";
var testCrateIndexAddr = testDataDir + "/crates.io-index";

var tmpDir = "./testtmp";
var testLocalCrateIndex = tmpDir + "/crate-index";

var testDbName = "crater-test";
var testDbCredentials = JSON.parse(fs.readFileSync(db.defaultDbCredentialsFile, "utf8"));

function rmTempDir(cb) {
  var child = spawn("rm", ["-Rf", tmpDir]);
  child.on('close', function(code) {
    assert(code == 0);
    cb();
  });
}

function cleanTempDir(cb) {
  rmTempDir(function() {
    var child = spawn("mkdir", ["-p", tmpDir]);
    child.on('close', function(code) {
      assert(code == 0);
      cb();
    });
  });
}

function cleanTempDb(cb) {
  var dbctx = db.connect(testDbCredentials, testDbName);
  var p = db.depopulate(dbctx);
  var p = p.then(function() { db.disconnect(dbctx); cb(); });
  var p = p.catch(function(e) { assert(false); });
}

suite("local rust-dist tests", function() {

  beforeEach(function(done) {
    cleanTempDir(function() {
      cleanTempDb(function() {
	done();
      });
    });
  });

  afterEach(function(done) {
    rmTempDir(function() { done(); });
  });

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

  beforeEach(function(done) {
    cleanTempDir(function() { done(); });
  });

  afterEach(function(done) {
    rmTempDir(function() { done(); });
  });

  test("load crates", function(done) {
    var p = crates.loadCrates(testCrateIndexAddr, testLocalCrateIndex);
    p = p.then(function(crates) {
      assert(crates.nodeps.length > 0);
      assert(crates.hasdeps.length > 0);
      done();
    });
    p = p.catch(function(e) { done(e) });
  });

});

suite("local rust-dist tests", function() {

  beforeEach(function(done) {
    cleanTempDir(function() { done(); });
  });

  afterEach(function(done) {
    rmTempDir(function() { done(); });
  });

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

  beforeEach(function(done) {
    cleanTempDir(function() { done(); });
  });

  afterEach(function(done) {
    rmTempDir(function() { done(); });
  });

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
  beforeEach(function(done) {
    cleanTempDir(function() { done(); });
  });

  afterEach(function(done) {
    rmTempDir(function() { done(); });
    
  });

  test("populate and depopulate", function(done) {
    var dbctx = db.connect(testDbCredentials, testDbName);
    var p = db.populate(dbctx);
    var p = p.then(db.depopulate(dbctx));
    var p = p.then(function() { db.disconnect(dbctx); done(); });
    var p = p.catch(function(e) { done(e); });
  });
});

suite("live network tests", function() {

  beforeEach(function(done) {
    cleanTempDir(function() { done(); });
  });

  afterEach(function(done) {
    rmTempDir(function() { done(); });
  });

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
      assert(crates.nodeps.length > 0);
      assert(crates.hasdeps.length > 0);
      done();
    });
    p = p.catch(function(e) { done(e) });
  });

});

