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
var util = require('./crater-util');

var defaultPulseCredentialsFile = "./pulse-credentials.json";
var defaultTcCredentialsFile = "./tc-credentials.json";

function main() {
  var config = util.loadDefaultConfig();
  var pulseCredentials = config.pulseCredentials;
  var tcCredentials = config.tcCredentials;

  db.connect(config).then(function(dbctx) {

    var tcQueue = new tc.Queue({ credentials: tcCredentials });

    var pulseListener = new tc.PulseListener({
      credentials: pulseCredentials,
      queueName: "crater-monitor" // create a durable queue
    });

    var queueEvents = new tc.QueueEvents();

    pulseListener.bind(queueEvents.taskDefined("route.crater.#"));
    pulseListener.bind(queueEvents.taskPending("route.crater.#"));
    pulseListener.bind(queueEvents.taskRunning("route.crater.#"));
    pulseListener.bind(queueEvents.artifactCreated("route.crater.#"));
    pulseListener.bind(queueEvents.taskCompleted("route.crater.#"));
    pulseListener.bind(queueEvents.taskFailed("route.crater.#"));
    pulseListener.bind(queueEvents.taskException("route.crater.#"));

    pulseListener.on('message', function(m) {
      debug("msg: " + JSON.stringify(m));

      var taskId = m.payload.status.taskId;
      var state = m.payload.status.state;

      assert(taskId);
      assert(state);

      if (state == "completed" || state == "failed") {
	var success = state == "completed";
	recordResultForTask(dbctx, tcQueue, taskId, success);
      }

    });

    pulseListener.resume().then(function() {
      debug("listening");
    });
  }).catch(function(e) { console.log(e); });
}

function recordResultForTask(dbctx, tcQueue, taskId, success) {
  // Get the task from TC
  debug("requesting task for " + taskId);
  var task = tcQueue.getTask(taskId);
  task.then(function(task) {
    debug("task: " + JSON.stringify(task));
    var extra = task.extra.crater;

    var channel = extra.channel;
    var archiveDate = extra.archiveDate;
    var crateName = extra.crateName;
    var crateVers = extra.crateVers;

    assert(channel);
    assert(archiveDate);
    assert(crateName);
    assert(crateVers);

    var buildResult = {
      channel: channel,
      archiveDate: archiveDate,
      crateName: crateName,
      crateVers: crateVers,
      success: success,
      taskId: taskId
    };
    debug("adding build result: " + JSON.stringify(buildResult));
    return db.addBuildResult(dbctx, buildResult);
  }).catch(function(e) { console.log(e) });
}

main();
