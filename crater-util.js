'use strict';

var Promise = require('promise');
var _fs = require('graceful-fs'); // Need to parse many files at once
var fs = {
  readFile: Promise.denodeify(_fs.readFile),
  readFileSync: _fs.readFileSync
};
var exec = require('child_process').exec;
var http = require('http');
var https = require('https');
var assert = require('assert');
var async = require('async');

var defaultRustDistAddr = "http://static-rust-lang-org.s3-us-west-1.amazonaws.com/dist";
var defaultCrateIndexAddr = "https://github.com/rust-lang/crates.io-index";
var defaultCacheDir = "./cache";
var defaultDlRootAddr = "https://crates.io/api/v1/crates";
var defaultDbCredentialsFile = "./pg-credentials.json";
var defaultPulseCredentialsFile = "./pulse-credentials.json";
var defaultTcCredentialsFile = "./tc-credentials.json";
var defaultDbName = "crater";

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
      archiveDate: ret_date,
    };    
  } else {
    // It must be a 40-character sha
    if (toolchainName.length == 40) {
      return {
	customSha: toolchainName
      }
    }
    return null;
  }
}

function toolchainToString(toolchain) {
  assert((toolchain.channel && toolchain.archiveDate) || toolchain.customSha);
  if (!toolchain.customSha) {
    return toolchain.channel + "-" + toolchain.archiveDate;
  } else {
    return toolchain.customSha;
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

function rustDate(date) {
  var year = date.getUTCFullYear().toString();
  var month = (date.getMonth() + 1).toString();
  if (month.length == 1) {
    month = "0" + month;
  }
  var day = date.getDate().toString();
  if (day.length == 1) {
    day = "0" + day;
  }

  return year + "-" + month + "-" + day;
}

function loadDefaultConfig() {
  return {
    dbName: defaultDbName,
    rustDistAddr: defaultRustDistAddr,
    crateIndexAddr: defaultCrateIndexAddr,
    cacheDir: defaultCacheDir,
    dbCredentials: loadCredentials(defaultDbCredentialsFile),
    pulseCredentials: loadCredentials(defaultPulseCredentialsFile),
    tcCredentials: loadCredentials(defaultTcCredentialsFile)
  };
}

function loadCredentials(credentialsFile) {
  return JSON.parse(fs.readFileSync(credentialsFile, "utf8"));
}

function workDispatcher(task, cb) {
  task(cb);
}

// A queue used to serialize access to the on-disk git repo and caches,
// to avoid corruption.
var actionQueue = async.queue(workDispatcher, 1);

/**
 * Takes a function that returns a promise and ensures that no other serial promises execute
 * until is resolved. Returns a promise of that resolved value.
 */
function serial(f) {
  return new Promise(function(resolve, reject) {
    actionQueue.push(function(dispatcherCb) {
      f().then(function(r) {
	dispatcherCb();
	resolve(r);
      }).catch(function(e) {
	dispatcherCb();
	reject(e);
      });
    });
  });
}

exports.parseToolchain = parseToolchain;
exports.toolchainToString = toolchainToString;
exports.downloadToMem = downloadToMem;
exports.runCmd = runCmd;
exports.rustDate = rustDate;
exports.loadDefaultConfig = loadDefaultConfig;
exports.defaultDbCredentialsFile = defaultDbCredentialsFile;
exports.defaultPulseCredentialsFile = defaultPulseCredentialsFile;
exports.defaultTcCredentialsFile = defaultTcCredentialsFile;
exports.serial = serial;
