# Crater - The Rust crate tester

This is a tool for testing builds of the Rust compiler against massive
numbers of Rust crates.

It is in a very rough state and the official deployment is
presently accessible by invitation only.

# Getting started

Clone the repo and cd to the 'rs' directory.

```sh
$ git clone https://github.com/brson/taskcluster-crater
$ cd taskcluster-crater/rs
```

In this directory create crater-cli-config.json. It looks like this:

```json
{
    "server_url": "https://TODO",
    "username": "your_username",
    "auth_token": "your_token"
}
```

Get your credentials from brson.

Test your configuration:

```sh
$ cargo run --bin crater-cli self-test
```

If it says 'self-test succeeded' you've authenticated. Now you can
cause some havok.

There are three steps to running crater:

1. Build two custom toolchains (optional).
2. Build crates against two toolchains.
3. Run a 'comparison' report.

## Step 1 - build two custom toolchains

Skip this step if you are just testing a compiler from an official
release channel.

To test a revision of the compiler that has not yet been merged into
master you will need to upload the branch to GitHub, then ask crater
to build it for you. You will need two commit shas: the most recent
commit on master that you are working off of, and the 'merge-base'
with upstream master (the most recent commit your branch shares with
master). Record these somewhere; you'll need them later.  In the
remaining examples these will be refered to as `$SHA1` and `$SHA2`,
and the repo address as `$REPO`.

Build the toolchains:

```sh
$ cargo run --bin crater-cli custom-build $REPO $SHA1
$ cargo run --bin crater-cli custom-build $REPO $SHA2
```

These will launch the builds, which will take an hour or two to
complete. Each of the above commands will print an 'inspector link', a
link to the TaskCluster page for that build. Check back on these links
periodically until they are both finished. It will take 1-2 hours.

Once these builds are done you can start testing crates.

Note: if you are just testing official builds then identify the
toolchains using multirust-style 'toolchain specs',
e.g. 'nightly-2015-06-06'. Always test compilers from the archives and
not straight from the release channel (e.g. 'nightly') since the
release channel compilers change regularly and the results won't make
sense down the road if we do historical analysis.

# Step 2 - build lots of crates

As before, we're going to ask Crater to run some builds, then wait
a few hours while those builds complete.

```sh
$ cargo run --bin crater-cli crate-build $SHA1
$ cargo run --bin crater-cli crate-build $SHA2
```

Both of these commands will print a ton of inspector links. You'll
probably just want to ignore them since they are not worth monitoring
individually. Instead, just wait two hours, then proceed to step 3.

You might also watch the [status page for the TaskCluster AWS
provisioner][prov], waiting for the number of builds on the 'crater'
workers to drop back to zero before proceeding to step 3.

[prov]: https://tools.taskcluster.net/aws-provisioner/

# Step 3 - run the report

Now you can ask for a 'comparison' report:

```sh
$ cargo run --bin crater-cli report comparison $SHA1 $SHA2
```

It will report statuses for some number of crates. Knowing whether the
report is 'done' and the crates have built correctly is not simple -
generally, if I see the number of known statuses is in the right
ballpark and the number of unknown statuses is minimal (maybe 30-40)
then I consider the coverage sufficient.

If the numbers look wrong then either the builds are not finished,
something went wrong internally to the cobbled-together distributed
system that is Crater, or you've issued one of the commands
incorrectly.

If the numbers are weird then you might ask for a report on a single
toolchain at a time, which can tell you if you got the commands for
one or the other incorrect:

```sh
$ cargo run --bin crater-cli report toolchain $SHA1
```

OK, that's all I can tell you for now. Good luck. Sorry it's so rough.

# Older docs

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
  "password": "...",
  "host": "...",
  "port": 5432
}
```

# Testing

    $ npm test

You'll need to have a 'crater-test' database configured locally,
for user 'crater-test' with password 'crater-test'.

# Creating the docker image

```
$ docker build -t brson/crater:1 .
$ docker push brson/crater
```

# Future work

* Use task graphs that mirror the crate dependency structure.
* Custom builds
* Only create tasks for build_results we don't have yet, unless --all is passed
* REST service
* HTML frontend
* CLI <-> REST frontend
* Use customized docker containers to avoid huge dls
* Fix urls in pop report
* Crate DAGs with stability coloring
* Add analysis of feature usage

