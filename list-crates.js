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
var semver = require('semver');

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
  var onlyStable = removeUnstable(flat);
  var classified = classifyNuggets(onlyStable);
  var withoutBrokenDeps = removeBrokenDeps(classified);
  return withoutBrokenDeps;
});

p = p.then(function(files) {
  debug('classified nuggets: %d with valid dependencies, %d with broken and %d without',
    files.hasdeps.length, files.broken.length, files.nodeps.length);
  fs.writeFile('out', JSON.stringify(files, null, 2)).done();
  return files;
});

p.done()
