'use strict';

var debug = require('debug')(__filename.slice(__dirname.length + 1));
var Promise = require('promise');
var _fs = require('graceful-fs'); // Need to parse many files at once
var fs = {
  existsSync: _fs.existsSync,
  readFile: Promise.denodeify(_fs.readFile),
  writeFile: Promise.denodeify(_fs.writeFile),
};
var walk = require('walkdir');
var path = require('path');
var semver = require('semver');
var util = require('./crater-util');

var defaultIndexAddr = "https://github.com/rust-lang/crates.io-index"
var defaultCacheDir = "./cache"

var localIndexName = "crate-index"
var crateCacheName = "crate-cache"
var sourceCacheName = "source-cache"
var versionCacheName = "version-cache"

/**
 * Ensure that the crate-index repository is either present or created
 */
function cloneIndex(indexAddr, cacheDir) {
  indexAddr = indexAddr || defaultIndexAddr;
  cacheDir = cacheDir || defaultCacheDir;

  var localIndex = path.join(cacheDir, localIndexName);

  var p; 
  if (fs.existsSync(localIndex)) {
    p = util.runCmd('git pull origin master', {cwd: localIndex});
  } else {
    p = util.runCmd('mkdir -p ' + localIndex);
    p = util.runCmd('git clone ' + indexAddr + ' ' + localIndex);
  }

  p = p.then(function(x) {
    debug('Repository exists');
  });

  return p
}

/**
 * Find all files in the repository which are not git files.
 */
function findFiles(directory) {
  return new Promise(function(resolve, reject) {
    var filesFound = [];
    var dir = path.resolve(directory); 
    var dirLength = dir.length + 1; // Avoid the unnecessary .
    var emitter = walk(directory); 

    // Store files
    emitter.on('file', function(_filename, stat) {
      var filename = path.resolve(_filename);
      filename = filename.slice(dirLength);
      // Ignore gitfiles and top level files (e.g. config.json)
      if (!/^[.]git\//.test(filename) && filename.indexOf(path.sep) !== -1) {
        filesFound.push(filename); 
      }
    });

    // Handle errors
    emitter.on('error', function(err) {
      reject(err);
    });

    // Fails are found files which could not be stat'd
    emitter.on('fail', function(fail) {
      debug('Failed to read a file! %s', fail);
    });

    // Resolve when all files are read
    emitter.on('end', function() {
      resolve(filesFound);
    });
  });
};

/**
 * Read all versions of a given descriptor file and parse them into
 * JSON
 */
function readFile(dir, filename) {
  return fs.readFile(path.join(dir, filename), 'utf-8').then(function(filedata) {
    var files = filedata.split('\n');
    return files.filter(function(f) { return !!f }).map(function(f) {
      return JSON.parse(f);
    });
  });
}

/**
 * Classify nuggets into those which are leafnodes on a dependency tree
 * and those which are dependencies
 */
function classifyNuggets(nuggets) {
  var result = {
    nodeps: [],
    hasdeps: [],
  };
  nuggets.forEach(function(nugget) {
    if (nugget.deps.length === 0) {
      result.nodeps.push(nugget);
    } else {
      result.hasdeps.push(nugget);
    }
  });
  return result;
}

/**
 * Find all nuggets with broken dependencies... ignore them
 * Broken dependencies are considered to be those package which
 * do not have all of their dependencies met by 'stable' packages
 */
function removeBrokenDeps(nuggets) {
  var result = {
    nodeps: nuggets.nodeps,
    hasdeps: [],
    broken: [],
  };

  
  // Let's make a mapping between name and versions
  var vermap = {};
  nuggets.hasdeps.forEach(function(nugget) {
    if (!vermap[nugget.name]) {
      vermap[nugget.name] = [nugget.vers];
    } else {
      vermap[nugget.name].push(nugget.vers)
    }
  });
  nuggets.nodeps.forEach(function(nugget) {
    if (!vermap[nugget.name]) {
      vermap[nugget.name] = [nugget.vers];
    } else {
      vermap[nugget.name].push(nugget.vers)
    }
  });

  nuggets.hasdeps.forEach(function(nugget) {
    var isValid = true;
    // Well, let's see if *any* package satisifies the dep
    nugget.deps.forEach(function(dep) {
      var satisfies = false;
      if (vermap[dep.name]) {
        vermap[dep.name].forEach(function(depver) {
          if (!satisfies && semver.satisfies(depver, dep.req)) {
            satisfies = true;
          }
        });
      }

      if (!satisfies) {
        isValid = false;
        debug(nugget.name + " dep " + dep.name + " " + dep.req + " not satisfied");
      }
    });


    if (isValid) {
      result.hasdeps.push(nugget);
    } else {
      result.broken.push(nugget);
    }
  });

  return result;


}

/**
 * Load the crate index from the remote address.
 */
function loadCrates(indexAddr, cacheDir) {
  indexAddr = indexAddr || defaultIndexAddr;
  cacheDir = cacheDir || defaultCacheDir;

  var localIndex = path.join(cacheDir, localIndexName);

  var p = cloneIndex(indexAddr, cacheDir);

  p = p.then(function() {
    debug('repos asserted');
    return findFiles(localIndex)
  });

  p = p.then(function(filenames) {
    debug('files found');
    return Promise.all(filenames.map(function(filename) {
      return readFile(localIndex, filename);
    }));
  });

  p = p.then(function(res) {
    debug('files read');
    var flat = [];
    res.forEach(function(r) {
      Array.prototype.push.apply(flat, r);
    });
    var classified = classifyNuggets(flat);
    var withoutBrokenDeps = removeBrokenDeps(classified);
    return withoutBrokenDeps;
  });

  p = p.then(function(files) {
    debug('classified nuggets: %d with valid dependencies, %d with broken and %d without',
          files.hasdeps.length, files.broken.length, files.nodeps.length);
    return files;
  });

  return p;
}

/**
 * Gets the 'dl' field from config.json in the index.
 */
function getDlRootAddrFromIndex(cacheDir) {
  cacheDir = cacheDir || defaultCacheDir;

  var localIndex = path.join(cacheDir, localIndexName);

  return fs.readFile(path.join(localIndex, "config.json"), 'utf-8').then(function(filedata) {
    return JSON.parse(filedata);
  }).then(function(data) {
    return data.dl;
  });
}

/**
 * Downloads the version metadata from crates.io and returns it.
 */
function getVersionMetadata(crateName, crateVers, dlRootAddr, cacheDir) {
  cacheDir = cacheDir || defaultCacheDir;

  var versionCache = path.join(cacheDir, versionCacheName);

  var url = dlRootAddr + "/" + crateName + "/" + crateVers;
  var cacheDir = versionCache + "/" + crateName;
  var cacheFile = cacheDir + "/" + crateVers;

  if (fs.existsSync(cacheFile)) {
    return fs.readFile(cacheFile, 'utf-8').then(function(filedata) {
      return JSON.parse(filedata);
    });
  } else {
    var json = null;
    var p = util.runCmd('mkdir -p ' + cacheDir);
    p = p.then(function() { return util.downloadToMem(url); });
    p = p.then(function(data) {
      json = JSON.parse(data);
      return json;
    });
    p = p.then(function(json) {
      return fs.writeFile(cacheFile, JSON.stringify(json));
    });
    p = p.then(function() { return json; });
    return p;
  }
}

function getCrateFile(crateName, crateVers, dlRootAddr, cacheDir) {
  cacheDir = cacheDir || defaultCacheDir;
  assert(false); // TODO
}

function getCrateSource(crateName, crateVers, dlRootAddr, cacheDir) {
  cacheDir = cacheDir || defaultCacheDir;
  assert(false); // TODO
}

exports.defaultIndexAddr = defaultIndexAddr;
exports.cloneIndex = cloneIndex;
exports.loadCrates = loadCrates;
exports.getDlRootAddrFromIndex = getDlRootAddrFromIndex;
exports.getCrateFile = getCrateFile;
exports.getCrateSource = getCrateSource;
exports.getVersionMetadata = getVersionMetadata;
