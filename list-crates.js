'use strict';

var debug = require('debug')(__filename.slice(__dirname.length + 1));
var Promise = require('promise');
var exec = require('child_process').exec;
var _fs = require('fs');
var fs = {
  existsSync: _fs.existsSync,
  readFile: Promise.denodeify(_fs.readFile),
  writeFile: Promise.denodeify(_fs.writeFile),
}
var walk = require('walkdir');
var path = require('path');

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

/**
 * Ensure that the crate-index repository is either present or created
 */
function assertRepo(gitBranch) {
  var p; 
  if (fs.existsSync('crate-index')) {
    p = runCmd('git pull origin ' + (gitBranch||'master'), {cwd: './crate-index'}); 
  } else {
    p = runCmd('git clone https://github.com/rust-lang/crates.io-index crate-index');
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
 * Filter out known-unstable packages.  For now, this is just to remove
 * files which have something in their features dict.
 */
function removeUnstable(nuggets) {
  return nuggets.filter(function(nugget) {
    if (Object.keys(nugget).length !== 0) {
      return true;
    }
    return false;
  });
}

/**
 * Classify nuggets into those which are leafnodes on a dependency tree
 * and those which are dependencies
 */
function classifyNuggets(nuggets) {
  var result = {
    notdep: [],
    dep: [],
  };
  nuggets.forEach(function(nugget) {
    if (nugget.deps.length === 0) {
      result.notdep.push(nugget);
    } else {
      result.dep.push(nugget);
    }
  });
  return result;
}

var p = assertRepo();

p = p.then(function() {
  debug('repos asserted');
  return findFiles('./crate-index')
});

p = p.then(function(filenames) {
  debug('files found');
  return Promise.all(filenames.map(function(filename) {
    return readFile('./crate-index', filename);
  }));
});

p = p.then(function(res) {
  debug('files read');
  var flat = [];
  res.forEach(function(r) {
    Array.prototype.push.apply(flat, r);
  });
  return removeUnstable(flat);
});

p = p.then(function(nuggets) {
  debug('removed unstable nuggets');
  return classifyNuggets(nuggets);
});

p = p.then(function(files) {
  debug('classified nuggets');
  fs.writeFile('out', JSON.stringify(files, null, 2)).done();
  return files;
});

p.done()
