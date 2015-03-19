Let's test Rust crates!

Scheduling a test of all crates againast a specific toolchain:

    nodejs schedule-tasks.js nightly-2015-03-01

Running the result monitoring and storage service:

    nodejs monitor.js

monitor.js will store the results in a database for later analysis.

# Credentials

schedule-tasks.js expects a file called tc-credentials.json to be in the cwd which looks like

```
{
  "clientId": "...",
  "accessToken": "...",
  "certificate": { ... }
}
```

The values can be obtained from https://auth.taskcluster.net/

monitor.js expects a file called pulse-credentials.json to be in the cwd which looks like

```
{
  "username": "...",
  "password": "..."
}
```

The values can be obtained from https://pulse.mozilla.org.

# PostgreSQL setup

monitor.js and test.js needs a PostgreSQL user, which can be set up
with

    sudo -u postgres createuser $USER

You'll need a test database and a production database.

    sudo -u postgres createdb crater-test -O $USER
    sudo -u postgres createdb crater -O $USER

And create a password for the user

    psql -c "\password" -U $USER -d crater

The credentials need to be in pg-credentials.js.

```
{
  "username": "...",
  "password": "..."
}
```

# Future work

* Use task graphs that mirror the crate dependency structure.
* Custom builds
* Only create tasks for build_results we don't have yet, unless --all is passed
