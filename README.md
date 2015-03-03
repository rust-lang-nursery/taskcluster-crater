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
