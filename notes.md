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
