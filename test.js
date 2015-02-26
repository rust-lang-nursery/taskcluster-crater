var debug = require('debug')(__filename.slice(__dirname.length + 1));
var dist = require('./rust-dist');
var assert = require('assert');

suite("local", function() {

  test("fetch index", function(done) {
    var p = dist.downloadIndex("./test");
    p.then(function(index) {
      assert(index.ds[0].children.fs[1].name == "channel-rust-beta");
      done();
    });
    p.catch(function(e) { done(e) });
  });

  test("get available toolchains", function(done) {
    var p = dist.downloadIndex("./test");
    p.then(function(index) {
      var toolchains = dist.getAvailableToolchains(index);
      assert(toolchains.nightly.indexOf("2015-02-20") != -1);
      assert(toolchains.beta.indexOf("2015-02-20") != -1);
      assert(toolchains.stable.indexOf("2015-02-20") == -1);
      done();
    });
    p.catch(function(e) { done(e) });
  });

});

suite("live", function() {

  test("fetch index", function(done) {
    var p = dist.downloadIndex();
    p.then(function(j) {
      done()
    });
    p.catch(function(e) { done(e) });
  });

});
