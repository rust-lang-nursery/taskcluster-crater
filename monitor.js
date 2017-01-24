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
      prefetch: 50, // fetch 50 messages at a time
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

      // Using a single db connection, don't clobber it with concurrency
      util.serial(function() {
	  return new Promise(function(resolve, reject) {
	    recordResultForTask(dbctx, tcQueue, taskId, state, m);
	    resolve(null);
	  }).catch(function(e) { reject(e); })
      })

    });

    pulseListener.resume().then(function() {
      debug("listening");
    });
  }).catch(function(e) { console.log(e); });
}

function recordResultForTask(dbctx, tcQueue, taskId, state, m) {
  // Get the task from TC
  debug("requesting task for " + taskId);
  var task = tcQueue.task(taskId);
  task.then(function(task) {
    debug("task: " + JSON.stringify(task));
    var extra = task.extra.crater;

    if (extra.taskType == "crate-build") {

      var toolchain = extra.toolchain;
      var crateName = extra.crateName;
      var crateVers = extra.crateVers;

      assert(toolchain);
      assert(crateName);
      assert(crateVers);

      var status = "unknown";
      if (state == "completed") {
	status = "success";
      } else if (state == "failed") {
	status = "failure";
      } else if (state == "exception") {
	status = "exception";
      } else /*if (state == "pending" || state == "running")*/ {
	status = "unknown";
      }
      
      var buildResult = {
	toolchain: toolchain,
	crateName: crateName,
	crateVers: crateVers,
	status: status,
	taskId: taskId
      };
      console.log("adding build result: " + JSON.stringify(buildResult));
      return db.addBuildResult(dbctx, buildResult);
    } else if (extra.taskType == "custom-build") {
      if (state == "completed") {
	debug("custom build success")
	var run = m.payload.status.runs.length - 1;
	var toolchain = util.parseToolchain(extra.toolchainGitSha);
	var url = "https://queue.taskcluster.net/v1/task/" + taskId +
	  "/runs/" + run + "/artifacts/public/rustc-dev-x86_64-unknown-linux-gnu.tar.gz";
	var custom = {
	  toolchain: toolchain,
	  url: url,
	  taskId: taskId
	};
	console.log("adding custom toolchain: " + JSON.stringify(custom));
	return db.addCustomToolchain(dbctx, custom);
      } else if (state == "failure" || state == "exception") {
	console.log("custom toolchain build failed: " + taskId);
      }
    } else {
      console.log("unknown task type " + extra.taskType);
      return Promise.resolve();
    }
  }).catch(function(e) { console.log("error: " + e) });
}

main();
