'use strict';

var debug = require('debug')(__filename.slice(__dirname.length + 1));
var Promise = require('promise');
var exec = require('child_process').exec;

function runCmd(cmd) {
  return new Promise(function(resolve, reject) {
    exec(cmd, function(err, sout, serr) {
      if (err) {
        debug('Failed to run %s', cmd);
        reject(err);
      }
      resolve({stdout: sout, stderr: serr});
    });
  });
}

