'use strict';

var debug = require('debug')(__filename.slice(__dirname.length + 1));
var Promise = require('promise');
var http = require('http');
var fs = require('fs');
var assert = require('assert');
var util = require('./crater-util');

var defaultDistAddr = "http://static-rust-lang-org.s3-website-us-west-1.amazonaws.com/dist";

/**
 * Download the JSON index and return a promised JSON object. If
 * `distAddr` is null the default remote address is used.
 */
function downloadIndex(distAddr) {
  distAddr = distAddr || defaultDistAddr;

  var index = distAddr + "/index.json";

  return util.downloadToMem(index).then(function(data) {
    return JSON.parse(data);
  });
}

/**
 * Converts the object returned by `downloadIndex` to a more concise form:
 *
 *     { nightly: [dates], beta: [dates], stable: [dates] }
 *
 * Each is sorted from most recent to oldest.
 */
function getAvailableToolchainsFromIndex(index) {
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

/**
 * Downloads the Rust channel index and pulls out the available toolchains
 * into an object with the shape:
 *
 *     { nightly: [dates], beta: [dates], stable: [dates] }
 *
 * Each is sorted from most recent to oldest.
 * Returns a promise.
 */
function getAvailableToolchains(distAddr) {
  var p = downloadIndex(distAddr);
  p = p.then(function(index) {
    return getAvailableToolchainsFromIndex(index);
  });
  return p;
}

function installerUrlForToolchain(toolchain, triple, rustDistAddr) {
  rustDistAddr = rustDistAddr || defaultDistAddr;

  var manifest = rustDistAddr + "/" + toolchain.archiveDate + "/channel-rust-" + toolchain.channel;

  return util.downloadToMem(manifest).then(function(data) {
    var lines = data.match(/^.*([\n\r]+|$)/gm);
    var res = null;
    lines.forEach(function(line) {
      if (line.indexOf(triple) != -1) {
	res = line.trim();
      }
    });

    if (res) {
      var url = rustDistAddr + "/" + toolchain.archiveDate + "/" + res;
      return url;
    } else {
      return Promise.reject("no installer found for triple " + triple);
    }
  });
}

exports.defaultDistAddr = defaultDistAddr;
exports.downloadIndex = downloadIndex;
exports.getAvailableToolchainsFromIndex = getAvailableToolchainsFromIndex;
exports.getAvailableToolchains = getAvailableToolchains;
exports.installerUrlForToolchain = installerUrlForToolchain;
