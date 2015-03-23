Let's test Rust crates!

This is a collection of node.js tools for testing large numbers of
Rust crates against arbitrary builds of Rust in parallel.

It currently consistents of a variety of modules for accessing
services, scheduling builds, monitoring status, analysis and
reporting, as well as several command-line utilities for interacting
with the system.

**Note: currently Crater is unusable without a local installation and
  a number of credentials. Eventually it will be deployed somewhere
  with a more convenient interface.**

Crater has a number of service dependencies, that make it difficult to
set up:

* [TaskCluster] for coordinating builds, and specifically Mozilla's
  instance of TaskCluster. Requires credentials.
* [Pulse], Mozilla's AMQP service, used by TaskCluster. Requires
  credentials.
* [The crates.io index]. A git repo containing metadata about
  registered crate revisions for crates.io.
* The crates.io API. For downloading metadata
* The Rust distribution S3 bucket. For downloading crates and builds.
* A PostgreSQL database for storing results (Amazon RDS). Requires
  credentials.

[TaskCluster]: http://docs.taskcluster.net/
[Pulse]: https://pulse.mozilla.org/
[The crates.io index]: https://github.com/rust-lang/crates.io-index/

# Modules

* `crate-index.js` - Functions relating to crates.io and the crates.
* `rust-dist.js` - Access to Rust release channels.
* `crater-db.js` - Domain specific storage abstractions over a SQL
  database.
* `reports.js` - Report generation.
* `scheduler.js` - Logic for scheduling builds.
* `monitor.js` - Deamon that monitors the pulse queue for events.
* `schedule-tasks.js` - CLI tool for scheduling builds.
* `print-report.js` - CLI tool for creating reports.
* `crate-util.js` - Common stuff.
* `test.js` - Unit tests.

# CLI tools

Scheduling a test the 20 most popular crates againast a specific toolchain:

    $ nodejs schedule-tasks.js nightly-2015-03-01 --top 20 --most-recent-only

Running the result monitoring and storage service:

    $ nodejs monitor.js

monitor.js will store the results in a database for later analysis.

Running reports:

    $ nodejs print-report.js comparison nightly-2015-03-01 nightly-2015-03-02

# Credentials

The files "tc-credentials.json", "pulse-credentials.json", and "pg-credentials.json" must
be in the current directory.

tc-credentials.json looks like yon:

```
{
  "clientId": "...",
  "accessToken": "...",
  "certificate": { ... }
}
```

The values can be obtained from https://auth.taskcluster.net/.

pulse-credentials.json looks like yon:

```
{
  "username": "...",
  "password": "..."
}
```

The values can be obtained from https://pulse.mozilla.org.

## PostgreSQL setup

monitor.js and test.js needs a PostgreSQL user, which can be set up
with

    sudo -u postgres createuser $USER

You'll need a test database and a production database.

    sudo -u postgres createdb crater-test -O $USER
    sudo -u postgres createdb crater -O $USER

And create a password for the user

    psql -c "\password" -U $USER -d crater

The credentials need to be in `pg-credentials.js`:

```
{
  "username": "...",
  "password": "..."
}
```

# Testing

    $ npm test

You'll need to have a 'crater-test' database configured locally.    

# Future work

* Use task graphs that mirror the crate dependency structure.
* Custom builds
* Only create tasks for build_results we don't have yet, unless --all is passed
* REST service
* HTML frontend
* CLI <-> REST frontend
