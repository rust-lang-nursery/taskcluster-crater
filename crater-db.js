/*
 * Stores and retrieves results from test runs.
 */

'use strict';

var debug = require('debug')(__filename.slice(__dirname.length + 1));
var Promise = require('promise');
var pg = require('pg');
var util = require('./crater-util');

var defaultDbCredentialsFile = "./pg-credentials.json";
var defaultDbName = "crater";

/**
 * Connects to a PostgreSQL DB and returns a promise of an opaque type
 * accepted as context to other functions here.
 */
function connect(credentials, dbname) {
  dbname = dbname || defaultDbName

  var dbctx = new Promise(function(resolve, reject) {
    var client = new pg.Client({
      user: credentials.username,
      password: credentials.password,
      database: dbname
    });

    client.connect(function(err) {
      if (!err) {
	resolve({ client: client });
      } else {
	reject(err);
      }
    });
  });
  return dbctx.then(function(dbctx) {
    var p = populate(dbctx);
    var p = p.then(function() { return dbctx; });
    return p;
  });
}

function disconnect(dbctx) {
  dbctx.client.end();
  return Promise.resolve();
}

/**
 * Creates the tables of a database return a promise of nothing. Taks
 * a promise of a database context created by `connect`.
 */
function populate(dbctx) {
  var q = "create table if not exists \
           build_results ( \
           channel text, archive_date text, \
           crate_name text, crate_vers text, \
           success boolean, \
           primary key ( \
           channel, archive_date, crate_name, crate_vers ) ) \
           ";
  return new Promise(function (resolve, reject) {
    dbctx.client.query(q, function(e, r) {
      if (e) { reject(e); }
      else { resolve(r); }
    });
  });
}

/**
 * Destroys the tables.
 */
function depopulate(dbctx) {
  var q = "drop table if exists build_results";
  debug(q);
  return new Promise(function (resolve, reject) {
    dbctx.client.query(q, function(e, r) {
      if (e) { reject(e); }
      else { resolve(r); }
    });
  });
}

/**
 * Adds a build result and returns a promise of nothing. buildResult should
 * look like `{ channel: ..., archiveDate: ..., crateName: ..., crateVers: ..., success: ... }`.
 */
function addBuildResult(dbctx, buildResult) {
  return new Promise(function (resolve, reject) {
    var f = function(e, r) {
      dbctx.client.query('commit', function(err, res) {
	if (e) { reject(e); }
	else { resolve(); }
      });
    };

    dbctx.client.query('begin', function(err, res) {
      var p = getBuildResult(dbctx, buildResult);
      p.then(function(r) {
	if (r == null) {
	  var q = "insert into build_results values ($1, $2, $3, $4, $5)";
	  debug(q);
	  dbctx.client.query(q, [buildResult.channel,
				 buildResult.archiveDate,
				 buildResult.crateName,
				 buildResult.crateVers,
				 buildResult.success],
			     f);
	} else {
	  var q = "update build_results set success = $5 where \
                   channel = $1 and archive_date = $2 and crate_name = $3 and crate_vers = $4";
	  debug(q);
	  dbctx.client.query(q, [buildResult.channel,
				 buildResult.archiveDate,
				 buildResult.crateName,
				 buildResult.crateVers,
				 buildResult.success],
			     f);
	}
      });
    });

  });
}

/**
 * Adds a build result and returns a promise of a build
 * result. buildResultKey should look like `{ channel: ..., archiveDate: ...,
 * crateName: ..., crateVers: ... }`.
 *
 * Returns a promised null if there is no build result for the key.
 */
function getBuildResult(dbctx, buildResultKey) {
  var q = "select * from build_results where \
           channel = $1 and archive_date = $2 and crate_name = $3 and crate_vers = $4";
  debug(q);
  return new Promise(function (resolve, reject) {
    var f = function(e, r) {
      if (e) { reject(e); }
      else {
	if (r.rows.length > 0) {
	  var row = r.rows[0];
	  resolve({
	    channel: row.channel,
	    archiveDate: row.archive_date,
	    crateName: row.crate_name,
	    crateVers: row.crate_vers,
	    success: row.success
	  });
	} else {
	  resolve(null);
	}
      }
    };

    dbctx.client.query(q, [buildResultKey.channel,
			   buildResultKey.archiveDate,
			   buildResultKey.crateName,
			   buildResultKey.crateVers],
		       f);
  });
}

exports.connect = connect;
exports.disconnect = disconnect;
exports.populate = populate;
exports.depopulate = depopulate;
exports.addBuildResult = addBuildResult;
exports.getBuildResult = getBuildResult;
exports.defaultDbCredentialsFile = defaultDbCredentialsFile;
exports.defaultDbName = defaultDbName;
