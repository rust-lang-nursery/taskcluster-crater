'use strict';

var debug = require('debug')(__filename.slice(__dirname.length + 1));
var util = require('./crater-util');
var crateIndex = require('./crate-index');
var Promise = require('promise');
var db = require('crater-db');
var assert = require('assert');

/**
 * Returns a promise of the data for a 'weekly report'.
 */
function createWeeklyReport(date, dbCredentials) {
  return db.connect(dbCredentials).then(function(dbctx) {
    assert(false);
  });
}

exports.createWeeklyReport = createWeeklyReport
