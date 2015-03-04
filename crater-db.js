/*
 * Stores and retrieves results from test runs.
 */

'use strict';

var debug = require('debug')(__filename.slice(__dirname.length + 1));
var Promise = require('promise');
var pg = require('pg');
var exec = require('child_process').exec;

var defaultDbCredentialsFile = "./pg-credentials.json";
var defaultDbName = "crater";

/**
 * Connects to a PostgreSQL DB and returns a promise of an opaque type
 * accepted as context to other functions here.
 */
function connect(credentials, dbname) {
  dbname = dbname || defaultDbName

  return new Promise(function(resolve, reject) {
    var client = new pg.Client({
      user: credentials.username,
      password: credentials.password,
      database: dbname
    });

    client.connect(function(err) {
      if (!err) {
	resolve({
	  client: client
	});
      } else {
	reject(err);
      }
    });
  });
}

function disconnect(dbctx) {
  return dbctx.then(function(dbctx) {
    dbctx.client.end();
    return Promise.resolve();
  });
}

/**
 * Creates the tables of a database return a promise of nothing. Taks
 * a promise of a database context created by `connect`.
 */
function populate(dbctx) {
  return dbctx.then(function(dbctx) {
    var q = "CREATE TABLE IF NOT EXISTS build_results ( \
             channel VARCHAR(100), date VARCHAR(100), crate VARCHAR(100), vers VARCHAR(100))";
    return new Promise(function (resolve, reject) {
      dbctx.client.query(q, function(e, r) {
	if (e) { reject(e); }
	else { resolve(r); }
      });
    });
  });
}

/**
 * Destroys the tables.
 */
function depopulate(dbctx) {
  return dbctx.then(function(dbctx) {
    var q = "DROP TABLE IF EXISTS build_results";
    return new Promise(function (resolve, reject) {
      dbctx.client.query(q, function(e, r) {
	if (e) { reject(e); }
	else { resolve(r); }
      });
    });
  });
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

exports.connect = connect
exports.disconnect = disconnect
exports.populate = populate
exports.depopulate = depopulate
exports.defaultDbCredentialsFile = defaultDbCredentialsFile
exports.defaultDbName = defaultDbName
