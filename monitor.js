/*
 * Monitors TaskCluster messages and stores Crater results for later analysis.
 */

'use strict';

var debug = require('debug')(__filename.slice(__dirname.length + 1));
var Promise = require('promise');
var tc = require('taskcluster-client');
var fs = require('fs');
var db = require('./crater-db');
var assert = require('assert');

var defaultPulseCredentialsFile = "./pulse-credentials.json";

function main() {
  var dbCredentials = loadDbCredentials(db.defaultDbCredentialsFile);

  db.connect(dbCredentials).then(function(dbctx) {

    var queueEvents = new tc.QueueEvents();

    var pulseCredentials = loadPulseCredentials(defaultPulseCredentialsFile);

    var listener = new tc.PulseListener({
      credentials: pulseCredentials
    });

    listener.bind(queueEvents.taskDefined("route.crater.#"));
    listener.bind(queueEvents.taskPending("route.crater.#"));
    listener.bind(queueEvents.taskRunning("route.crater.#"));
    listener.bind(queueEvents.artifactCreated("route.crater.#"));
    listener.bind(queueEvents.taskCompleted("route.crater.#"));
    listener.bind(queueEvents.taskFailed("route.crater.#"));
    listener.bind(queueEvents.taskException("route.crater.#"));

    listener.on('message', function(m) {
      debug("msg: " + JSON.stringify(m));
    });

    listener.resume().then(function() {
      debug("listening");
    });
  }).catch(function(e) { assert(false); });
}

function loadDbCredentials(credentialsFile) {
  return JSON.parse(fs.readFileSync(credentialsFile, "utf8"));
}

function loadPulseCredentials(credentialsFile) {
  return JSON.parse(fs.readFileSync(credentialsFile, "utf8"));
}

main();
