# Notes

Additional crate data, including add date, can be dl'd from e.g. https://crates.io/api/v1/crates/toml/0.1.0

An example of the paylod we need to create

```
{
  "image": "ubuntu:13.10",
  "command": [
    "/bin/bash",
    "-c",
    "apt-get update && apt-get install curl -y && (curl -sf https://raw.githubusercontent.com/brson/taskcluster-crater/master/run-crater-task.sh | sh)"
  ],
  "env": {
    "CRATER_RUST_INSTALLER": "https://static.rust-lang.org/dist/rust-nightly-x86_64-unknown-linux-gnu.tar.gz",
    "CRATER_CRATE_FILE": "https://crates.io/api/v1/crates/toml/0.1.18/download"
  },
  "maxRunTime": 600
}
```

# taskcluster

13:16 <@jonasfj> brson, we don't have docs for setting up taskcluster... it's not something that you easily duplication (many moving parts involved, AMIs, S3 buckets, azure tables, azure queues, 2-3 heroku projects at 
                 minimum, DNS)
13:16 <@jonasfj> I think there is going to be some focus on setting up staging envs next quarter as the currently deployment is going into production...
13:18 <@jonasfj> what are you looking to do? You're most well come tome play around our TC deployment... that partly what it's for...  we'll lock it more down in the future (using scopes) but for now it's pretty open if you 
                 have an @mozilla,com email.
13:20 <@jonasfj> s/duplication/do/ (wow, how did I write that...)
13:24 < brson> jonasfj: I am working on regressino testing for rust, and I'm ready to start figuring out how to schedule builds
13:25 <@jonasfj> hmm... lightsofapollo ^do we have story for scheduled tasks yet? I know we talked about it -- and I've seen chatter on IRC about this for gecko, but I'm not sure were the bootstrap lives...
13:26 <@jonasfj> I suspect it's just matter of adding something in the place that handles the github hooks... but jlal knows this integration stuff...
13:27 < brson> i don't know that i need github hooks, but i have some custom logic that wants to produce lots of builds
13:27 < brson> perhaps as a batch job every 24 hours
13:27 < brson> i don't know how to get started
13:27 <@jonasfj> oh...
13:28 <@jonasfj> brson, oh, so it's not running on TC yet?
13:29 <@jonasfj> basically we have end-points that can accept tasks or entire task-graphs... so if you create a heroku node or something that submits your jobs periodically you've solved the integration issue... (I don't 
                 think we have generic story for integration yet)
13:29 <@jonasfj> for running on TC... just make it run in docker.... such that input for "docker run" is image name, env vars and a simple command
13:30 <@jonasfj> then you can try it using our task create or (taskcluster-cli tools)
13:30 <@jonasfj> if you haven't, try out: https://tools.taskcluster.net/task-creator/
13:31 <@jonasfj> (remember click login, and use an @mozilla.com email, and click authorse button)
13:31 < brson> jonasfj: ok, I will try to create tasks with task-creator. once i've done that and understand how tasks work, what do i use to start scripting those tasks?
13:32 <@jonasfj> you can create tasks using the API: http://docs.taskcluster.net/queue/api-docs/#createTask
13:32 <@jonasfj> or task graphs (if you have dependencies) using http://docs.taskcluster.net/scheduler/api-docs/#createTaskGraph
13:32 <@jonasfj> all of this is supported by taskcluster-client: https://github.com/taskcluster/taskcluster-client
13:33 <@jonasfj> note, docs for the task.payload property is present here: http://docs.taskcluster.net/docker-worker/
13:33 < brson> jonasfj: great, thank you. is there any risk of me breaking things by submitting tasks?
13:34 <@jonasfj> brson, not really.... I'll buy you a beer if you break things by accident... :)

15:38 <@jonasfj> brson, you can declare artifafacts to be exported...
15:39 <@jonasfj> the log should already be exported as the public/logs/terminal.log artfiact
15:39 <@jonasfj> (note: artifacts starting with public/ are public and GETing them requires no credentials)
15:40 <@jonasfj> the easiest way to export artifacts... is to just declare the you want the contents of a  folder uploaded:
15:40 < brson> jonasfj: ok. seems like when i use taskcluster-client to schedule a task i'll probably get a taskid back i can store
15:40 <@jonasfj> task.payload.  "artifacts": {
15:40 <@jonasfj>     "public/test-logs": {
15:40 <@jonasfj>       "type": "directory",
15:40 <@jonasfj>       "path": "/home/tester/git_checkout/test-logs",
15:40 <@jonasfj>       "expires": "2016-02-28T03:37:46.430Z"
15:40 <@jonasfj>     }
15:40 <@jonasfj>   }
15:40 <@jonasfj> brson, yes...
15:40 < brson> ooh, thanks
15:40 <@jonasfj> brson, you can also do smart things :)
15:41 <@jonasfj> like listen on pulse with a custom route...
15:41 <@lightsofapollo> brson: from what I can see you probably have everything you need by default unless you need to rely on exit codes other then 0/1 ?
15:41 <@jonasfj> listening for task-completed for example:
15:41 <@jonasfj> http://docs.taskcluster.net/queue/exchanges/#taskCompleted


Get credentials at https://auth.taskcluster.net/

10:47 <@lightsofapollo> brson: nice... If you want stuff to move faster try using b2gtest or gaia worker type
10:48 < brson> lightsofapollo: because they already have workers running?
10:48 <@lightsofapollo> brson: yeah
10:48 <@lightsofapollo> we only really use cli for internal testing so usually nothing is running 

12:17 <@jonasfj> brson, did a quick a example illustrating use of custom routes, as opposed to storing the taskIds: https://gist.github.com/jonasfj/c7648158a561eb95c426
12:17 <@jonasfj> in case you're interested. Basically we allow you add custom routing keys to tasks...
12:17 <@jonasfj> which will be used when we publish messages about the task.
12:18 <@jonasfj> so you just listen for your messages on task-completed exchange with a routingkey that matches your custom one.
12:19 <@jonasfj> (right now nothing is locked down, everybody gets '*' scope, but custom routing keys are scopes so in future you can make an exclusive claim to one)


13:13 <@jonasfj> brson, reposting from when it off yester day..
13:13 <@jonasfj> <jonasfj> brson, for the record (as you're nolonger around) no... task.extra is not available in pulse messages (pulse messages documented here: http://docs.taskcluster.net/queue/exchanges/)
13:13 <@jonasfj> <jonasfj> brson, but you can load the task definition from the queue, using queue.getTask(taskId) and then read the extra part back from there...
13:13 <@jonasfj> <jonasfj> (we include as little as possible in the pulse messages to keep pulse fast)
13:13 <@jonasfj> <jonasfj> as a hack one  can insert an extra key in the custom routing key... but this is very limited.. and has character restrictings on "."; it's mostly useful if you're injecting a revision number.
13:13 <@jonasfj> <jonasfj> if you're looking at injecting repository + revision task.extra is a better place to store it... or task.tags (but that strictly strings)

dl https://crates.io/api/v1/crates/toml/0.1.0 to get metadata

See details about the cratertest worker type at http://aws-provisioner.taskcluster.net/

# Weekly Report

Date: 2015/03/09

The most recent stable release is XXX.
The most recent beta release is XXX.
The most recent nightly release is XXX.

There are currently X root regressions from stable to beta.
There are currently X root regressions from beta to nightly.

There are currently X regressions from stable to beta.
There are currently X regressions from beta to nightly.

From stable to beta:
* X crates tested: X working / X not working / X regressed / X fixed
* X crates not tested: X old / X exception / X no-data

From beta to nightly:
* X crates tested: X working / X not working / X regressed / X fixed
* X crates not tested: X old / X exception / X no-data

## Beta root regressions, by popularity:

* [toml-0.1.18](link)

## Nightly root regressions, by popularity:

* [toml-0.1.18](link)

## Beta non-root regressions, by popularity:

* [toml-0.1.18](link)

## Nightly non-root regressions, by popularity:

* [toml-0.1.18](link)

# Comparison Report

Like weekly but for two arbitrary toolchains.

# Score Board

Show the top X packages in order and their build status, for all channels

# Single-toolchain report

* Root breakage, by popularity

# Next Steps

* store custom builds on s3
* build crates against custom rust
* sort reports by crate popularity
* add scoreboard report

# info about worker types

12:19 < jonasfj> brson, cratertest is currently an r3.xlarge configurated with capacity = 5, which means it'll run up to 5 tasks in parallel... Reducing capacity would give you more ram...You can also move to r3.2xlarge :)
12:21 < jonasfj> as long as you moving within the r3 series I think it'll work.. c3 series is probably good too... but c4 might require some worker-level changes to how we mount disks...
12:21 < jonasfj> r3.largeI2I15.25I1 x 32
12:21 < jonasfj> r3.xlargeI4I30.5I1 x 80
12:21 < jonasfj> r3.2xlargeI8I61I1 x 160
12:21 < jonasfj> r3.4xlargeI16I122I1 x 320
12:21 < jonasfj> r3.8xlarge
12:21 < jonasfj> 32
12:21 < jonasfj> 244
12:21 < jonasfj> 2 x 320
12:22 < jonasfj> ahh, that did work well...
12:22 < jonasfj> my point was moving to r3.2xlarge and reducing capacity to 2 should give you 30G ram per container
12:23 < jonasfj> (we currently don't enforce fair sharing between containers)
12:26 < jonasfj> all of this can be done on aws-provisioner.taskcluster.net
12:28 < jonasfj> brson, I created rustbuild workertype (better name later); it's an r3.2xlarge (60G ram 8 cores) capacity one so will only run one container at the time...
12:28 < jonasfj> (also limited to no more than one instance... but you can change that if you want more... small limits are good when testing.
12:29 < jonasfj> anyways, I recreated your tasks for testing without the route (so it won't interfere with your listener):
12:29 < jonasfj> brson, http://docs.taskcluster.net/tools/task-inspector/#oezansp3QYmx3HQfRCjXPA
12:29 < jonasfj> ahh, submitted it with wrong workerType, my bad :)
12:29 -!- kang [kang@moz-t24d28.ca.comcast.net] has quit [Quit: WeeChat 1.1.1]
12:32 < jonasfj> brson, meant: http://docs.taskcluster.net/tools/task-inspector/#tISmmRsyRBewU_tEIsewww
12:32 < jonasfj> it'll probably start running soon, then we'll see if it 60g is enough ram
12:35 < jonasfj> note, we often use different workertypes for tests and builds. Builds easily saturates CPU and ram, so running multiple builds in parallel is usually pointless..
12:37 < jonasfj> tests on the other hand are often slow... not running in parallel... They are more linear time "intensive", than cpu intensive... so running them in parallel pays off..

# info about docker

13:25 < jonasfj> it's pretty trivial... and fast I always test locally...
13:25 < jonasfj> not in our config... but we could have missed something...
13:26 < jonasfj> docker run -ti --rm -e ENV_VAR_FROM_TASK=VALUE ubuntu:13.10 <commands from task>
13:26 < jonasfj> -ti is for interactive terminal output
13:26 < garndt> wonder how bad my virtualbox vm will die if I try it
13:27 < jonasfj> --rm deletes the container when you disconnect...

# REST

14:02 < brson> besides not being able to build rust, i've got the major functionality i need scaped together, but it's just a bunch of modules and cli tools. now i want to put it behind a HTTP REST interface. what's the easy 
               way to do that in node?
14:04 < jonasfj> what do you mean? do you want to setup to github hook... or offer a REST API for people to hit? Who is the consumer...
14:08 < brson> jonasfj: I want the functionality of my tool to be exposed as a REST API so I can add a web frontend to it
14:11 -!- bhearsum [bhearsum@moz-n6cgoa.dsl.bell.ca] has quit [Quit: mooooonday]
14:11 <@lightsofapollo> brson: hapi / express are decent node frameworks
14:11 <@lightsofapollo> http frameworks
14:12  * lightsofapollo would have loved to see this as a rust only thing ... someday

# a working rust build task

https://gist.github.com/jonasfj/91526a796c9f1cdc5c87
http://docs.taskcluster.net/tools/task-inspector/#IDs5uUXuS9SGuqvYfaCQ9w/0

# getting live logs

http://docs.taskcluster.net/tools/task-inspector/#xW41f4pVTtm854sp_uX1nw/0

18:47 < brson> while i've got your attention, what url will the uploaded artifacts be available at when they do upload?
18:49 < garndt> https://queue.taskcluster.net/v1/task/<task_id>/runs/<run id>/artifacts/<path in task definition>
18:50 < garndt> usually the path in the task definition is something like "public/some/path/some_file" or similar

# niko's commits

after:
242ed0b7c0f6a21096f2cc3e1ad1bdb176d02545

https://tools.taskcluster.net/task-inspector/#y3yL15CwTe-Nl-0q9Kp_Dw/
https://queue.taskcluster.net/v1/task/y3yL15CwTe-Nl-0q9Kp_Dw/runs/0/artifacts/public/rustc-dev-x86_64-unknown-linux-gnu.tar.gz

before:
e03bbded2da5332f0628a169559051959076950e
https://tools.taskcluster.net/task-inspector/#N44APbE1Tiq0Yxe7MVN6sQ/
https://queue.taskcluster.net/v1/task/N44APbE1Tiq0Yxe7MVN6sQ/runs/0/artifacts/public/rustc-dev-x86_64-unknown-linux-gnu.tar.gz
