'use strict';

var debug = require('debug')(__filename.slice(__dirname.length + 1));
var Promise = require('promise');
var http = require('http');
var fs = require('fs');
var assert = require('assert');

var defaultDistAddr = "http://static-rust-lang-org.s3-website-us-west-1.amazonaws.com/dist";

/**
 * Download the JSON index and return a promised JSON object. If
 * `distAddr` is null the default remote address is used.
 */
function downloadIndex(distAddr) {
  if (distAddr == null) {
    distAddr = defaultDistAddr;
  }

  var index = distAddr + "/index.json";

  if (index.lastIndexOf("http", 0) === 0) {
    return new Promise(function(resolve, reject) {
      http.get(index, function(res) {
	var data = '';

	res.on('error', function(e) { reject(e); });
	res.on('data', function(d) { data += d; });
	res.on('end', function() {
	  var json = JSON.parse(data);
	  resolve(json);
	});
      });
    });
  } else {
    var p = Promise.denodeify(fs.readFile)(index, 'utf-8');

    p = p.then(function(data) {
      return JSON.parse(data);
    });

    return p;
  }
}

/**
 * Converts the object returned by `downloadIndex` to a more concise form:
 *
 *     { nightly: [dates], beta: [dates], stable: [dates] }
 */
function getAvailableToolchains(index) {
  // The index is kinda hacky and has an extra level of directory indirection.
  // Peel it off here.
  assert(index.ds.length == 1);
  var index = index.ds[0].children;
  var dirs = index.ds;

  var nightly = [];
  var beta = [];
  var stable = [];

  for (var i = 0; i < dirs.length; i++) {
    var dir = dirs[i];
    var name = dir.name;
    var files = dir.children.fs;
    for (var j = 0; j < files.length; j++) {
      var file = files[j];
      if (file.name == "channel-rust-nightly") {
	nightly.push(name);
      } else if (file.name == "channel-rust-beta") {
	beta.push(name);
      } else if (file.name == "channel-rust-stable") {
	stable.push(name);
      }
    }
  }

  nightly.sort();
  beta.sort();
  stable.sort();

  var toolchains = {
    nightly: nightly,
    beta: beta,
    stable: stable
  };

  return toolchains;
}

exports.defaultDistAddr = defaultDistAddr;
exports.downloadIndex = downloadIndex;
exports.getAvailableToolchains = getAvailableToolchains;
