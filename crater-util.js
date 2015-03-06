'use strict';

var Promise = require('promise');
var _fs = require('graceful-fs'); // Need to parse many files at once
var fs = {
  readFile: Promise.denodeify(_fs.readFile),
};
var exec = require('child_process').exec;
var http = require('http');
var https = require('https');

/**
 * Parses a string toolchain identifier into an object { channel: string, date: string }
 */
function parseToolchain(toolchainName) {
  if (toolchainName == null) { return null; }

  var ret_channel;
  var ret_date;
  ["nightly", "beta", "stable"].forEach(function(channel) {
    var prefix = channel + "-";
    var ix = toolchainName.indexOf(prefix);
    if (ix != -1) {
      ret_channel = channel;
      ret_date = toolchainName.slice(prefix.length);
    }
  });

  if (ret_channel) {
    return {
      channel: ret_channel,
      date: ret_date,
    };    
  } else {
    return null;
  }
}

function downloadToMem(addr) {
  if (addr.lastIndexOf("https", 0) === 0) {
    return new Promise(function(resolve, reject) {
      https.get(addr, function(res) {
	var data = '';

	res.on('error', function(e) { reject(e); });
	res.on('data', function(d) { data += d; });
	res.on('end', function() {
	  resolve(data);
	});
      });
    });
  } else if (addr.lastIndexOf("http", 0) === 0) {
    return new Promise(function(resolve, reject) {
      http.get(addr, function(res) {
	var data = '';

	res.on('error', function(e) { reject(e); });
	res.on('data', function(d) { data += d; });
	res.on('end', function() {
	  resolve(data);
	});
      });
    });
  } else {
    return Promise.denodeify(fs.readFile)(addr, 'utf-8');
  }
}

function runCmd(command, options) {
  return new Promise(function(resolve, reject) {
    exec(command, options, function(err, sout, serr) {
      if (err) {
        reject(err);
      }
      resolve({stdout: sout, stderr: serr});
    });
  });
}

exports.parseToolchain = parseToolchain;
exports.downloadToMem = downloadToMem;
exports.runCmd = runCmd;
