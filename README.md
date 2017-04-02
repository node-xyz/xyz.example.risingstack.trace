# Integrate node-xyz With RisingStack Trace

In this article, we will discuss how [node-xyz](https://github.com/node-xyz) can be integrated to work with [RisingStack Trace](https://trace.risingstack.com/).

### What is node-xyz?

node-xyz is microservice microframework for node. It is a _low level_ , _minimal_, yet **comprehensive** toolkit that can be used to easily develop and deploy microservices. node-xyz consists of two main components:
  - [`xyz-core`](https://github.com/node-xyz/xyz-core): which is the microframework that we will be using to write our services.
  - [`xyz-cli`](https://github.com/node-xyz/xyz-cli) which is the command line tool that we will be using to deploy our services. `xyz-cli` can be configured to work with Trace very easily.

This tutorial is using `xyz-core v.0.4` and `xyz-cli v0.4.1`. Since node-xyz is being heavily developed at the time, there is the possibility of minor changes in the future.

## Writing the microservices

In this tutorial, we will not focus heavily on the details of microservices since it can get pretty complicated and dependent on your application domain. Instead, we will create mock tasks with different types (CPU and IO tasks) that represent real tasks and deploy them as our microservices.

We will create 2 service types:

  - a **Front** service: This node will receive HTTP requests, translates them to internal messages and dispatches the messages.
  - a **Worker** service: which exposes the two tasks explained above.
  - a **Client** service: this node will represent **internal clients** that might need to use `Worker`'s services.

The services will be deployed to port 4000, 6000 and 5000 respectively.

We will also launch a series of _attacks_ to our **Front** node to represent **external** clients.

I will explain some of the details of `xyz-core` in this tutorial, but I highly recommend reading xyz's [Getting Started](https://node-xyz.github.io/documentations/getting-started/) document to get more familiar before going any further.

Let's start writing the microservices:

#### Worker Service

```javascript
const XYZ = require('xyz-core')
const fs = require('fs')

// create a new microservice
let worker = new XYZ({
  selfConf: {
    name: 'worker.ms',

    // rename this if you want to deploy on a VPS
    host: '127.0.0.1',

    transport: [{type: 'HTTP', port: 6000}],

    // all nodes will connect to seed node which is Front service
    seed: ['127.0.0.1:4000'],

    // always good to see some logs!
    logLevel: 'verbose'
  }
})

// a cpu task
worker.register('/task/cpu', (payload, response) => {
  let num = 1
  for (let i = 1; i < 100; i++) {
    num = num * i
  }
  response.jsonify(num)
})

// an IO task
worker.register('/task/io', (payload, response) => {
  const MAX = 1000
  for (let i = 0; i <= MAX; i++) {
    fs.writeFile('./trash.txt', String(i), function (_i, err) {
      if (err) throw err
      else {
        if (_i === MAX) {
          response.jsonify('written')
        }
      }
    }.bind(null, i))
  }
})
```

> Even for this small example, it's worth mentioning that placing an IO intensive and a CPU intensive thask in one process is not a good idea. Nonetheless, the aim of this tutorial isn't to teach you about microservices. It's about xyz and Trace

### Client Service

This node is a bit simpler since we will not `.register` any service. Instead, we will use `.call()` to send messages to `Worker`'s tasks.

```javascript
const XYZ = require('xyz-core')

let ms = new XYZ({
  selfConf: {
    name: 'client.ms',

    transport: [{type: 'HTTP', port: 5000}],

    host: '127.0.0.1'
  }
})

setInterval(() => {
  ms.call({
    servicePath: 'task/cpu'
  }, (err, body) => {
    console.log(`task/cpu response: ${err} ${body}`)
  })
}, 100)

setInterval(() => {
  ms.call({
    servicePath: 'task/io'
  }, (err, body) => {
    console.log(`task/io response: ${err} ${body}`)
  })
}, 500)
```

Note that:

  - For simplicity, all messages are empty and don't have any payload.
  - No need to say, the path of ther service, like `/task/io`, is its **identifier** and should be used by a caller to reach to correct callee.
  - As you might've seen, none of the nodes are informed about the `IP:PORT` of one another. They use a seed node to join the system. This procedure is a part of xyz's Ping mechanism which helps services discover and explore each other.

At this point, we can have a small test. We have created two services, namely `client.ms@127.0.0.1:5000` and `worker.ms@127.0.0.1:6000` and we can run them both to see them working. For now, we will not use `xyz-cli` and run them with `node` command.

Start with:

```bash
$ node client.js
```

You will see iterative logs that indicate `task/cpu` and `task/io` are not found. This is fine since we haven't launched `worker.ms` yet!

Next, in a new terminal:

```bash
node worker.js
```

After a few seconds you will see:

```bash
// worker.js log
[2017-4-2 16:33:6][worker.ms@127.0.0.1:6000] info :: JOIN PING ACCEPTED. response : {"services":{"":{}},"nodes":["127.0.0.1:5000"],"transportServers":{"5000":["CALL","PING"]}}
[2017-4-2 16:33:6][worker.ms@127.0.0.1:6000] info :: A new node {127.0.0.1:5000} added to systemConf
[2017-4-2 16:33:6][worker.ms@127.0.0.1:6000] info :: SR :: System Configuration changed new values: {"nodes":["127.0.0.1:6000","127.0.0.1:5000"]}

// client.js log
[2017-4-2 16:33:6][client.ms@127.0.0.1:5000] info :: A new node {127.0.0.1:6000} added to systemConf
[2017-4-2 16:33:6][client.ms@127.0.0.1:5000] info :: SR :: System Configuration changed new values: {"nodes":["127.0.0.1:5000","127.0.0.1:6000"]}
```

Which indicates that the two services are now synced. Rest of the logs should show things like:

```bash
// client.js log
task/io response: null written
task/cpu response: null 9.33262154439441e+155
task/cpu response: null 9.33262154439441e+155
task/cpu response: null 9.33262154439441e+155
task/cpu response: null 9.33262154439441e+155
task/cpu response: null 9.33262154439441e+155
```

Let's write the last service, Front

## Front Service

A front service should usually accept requests from external clients and translate them into internal messages. This process can be quite complicated depending on the business logic of the entire system. Yet again, we will use just a simple form of translation for simplicity. In the front service, an [Express](https://expressjs.com/) server will accept only post requests with `/service?service_path=SERVICE_PATH` url. It will also send responses to the external clients since all messages are HTTP and we simply can do that (note that this wouldn't have been **easily** possible with [UDP](https://node-xyz.github.io/documentations/advance/server-route/) or Async messaging). Let's see the code:


```javascript
const express = require('express')
const XYZ = require('xyz-core')

const app = express()
const EXPRES_PORT = 4001

// setup xyz
const front = new XYZ({
  selfConf: {
    name: 'front.ms',

    host: '127.0.0.1',

    // all nodes will connect to seed node which is Client service
    seed: ['127.0.0.1:5000']

    transport: [{type: 'HTTP', port: 4000}],

    logLevel: 'verbose'
  }
})

// setup express app
app.post('/service', function (req, res) {
  front.call({
    servicePath: req.query['service_path']
  }, (err, body) => {
    res.json({err: err, body: body})
  })
})

// note that xyz HTTP transport is listening on port 4000
// and express on port 4001
app.listen(EXPRES_PORT, function () {
  // use xyz's logger
  front.logger.info(`EXPRESS :: Front app listening on port ${EXPRES_PORT}!`)
})
```

If you run `$ node front.js`, and send a request to it like:

```bash
$ curl -X POST  -i "http://localhost:4001/service?service_path=task/io"
```

You will get

```bash
HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
Content-Length: 31
ETag: W/"1f-5BgiCd8igfyPhK/4unDH1iI+hM0"
Date: Sun, 02 Apr 2017 12:38:17 GMT
Connection: keep-alive

{"err":"Not Found","body":null}%     
```

Which is totally fine since `front` hasn't connected to other nodes using its seed node. If fact, you can see how `front` has responded locally to the message:

```bash
front.js log
[2017-4-2 17:8:17][front.ms@127.0.0.1:4000] warn :: Sending a message to /task/io from first find strategy failed (Local Response)
```

Which is logged after Front fails to execute

```javascript
front.call({
  servicePath: req.query['service_path']}, () => {...})
```


Notes about all three kinds of services:
  - Internal messages are sent via `Client` instance while external message are gone through `Front`
  - Note that all nodes use their `selfConf.host` as their global identifier, so be sure to replace that with a valid static and remote IP if you are testing this code in a VPS.
  - All nodes will have a `selfConf.seed` instead of having `systemConf.nodes` to sync and discover other services. This is because we want to deploy more instances of each service later.
  - While Sync message passing is fine for external clients, usually it is preferable to use an Async messaging for internal messages. In this tutorial, we will use HTTP Sync message for all communications for simplicity. xyz provides [some Async messaging mechanisms](https://github.com/node-xyz/xyz.rsmq.single.bootstrap/tree/master) that you can use.

## Wrapping it up with xyz-cli

You can now run the three nodes individually and test them. They should work just fine. But we want to do it easier, that is why we will use `xyz-cli`. You can install this module globally using:

```bash
$npm install -g xyz-cli
```

One of the commands in xyz-cli is `dev`. This command will run a bunch of microservices according to a config json file. This config file is pretty simple and self-explanatory:

Create a file named `xyz.json`:

```json
{
  "nodes": [
    {
      "path": "./front.js",
      "port": 4000,
      "stdio": "file"
    },
    {
      "path": "./client.js",
      "port": 5000,
      "stdio": "file"
    },
    {
      "path": "./worker.js",
      "port": 6000,
      "stdio": "file"
    }
  ]
}
```

Notes:

  - CLI will override ports of you provide them. In this case, we are giving them with the same values that they had in `selfConf.transport.0.port`. You can [read this page to learn more about how xyz overrides configurations](https://node-xyz.github.io/documentations/advance/configuration) such as ports.
  - each object in `nodes[]` accepts more options, but we are not filling them now for simplicity.
  - `stdio` indicates the destination of each process's `stdout` and `stderr`. By default, it's `console` which is not good now because the logs of all nodes will be printed in one terminal. If you use `file` value for this key, like now, a new folder named `log` will be created and each process' log will be written to a separate file. This is much more reasonable.

with this file in the root of all of your files (since our services are simple now we use a flat file structure):

```
/project-dir
  - client.js
  - worker.js
  - front.js
  - xyz.json
  // and probably:
  - node_modules
  - package.json
  - /log
    - front@127.0.0.1:4000.log
    - client@127.0.0.1:5000.log
    - worker@127.0.0.1:6000.log
```

you can run:

```bash
xyz dev -c xyz.json
```

After this, a list of all nodes should be printed:

```
process front.ms@127.0.0.1:4000 successfully lunched. writing output to file [--xyz-transport.0.port 4000 --xyz-cli.enable true --xyz-cli.stdio file ]
creating logfile ./log/front.ms@127.0.0.1:4000.log
process client.ms@127.0.0.1:5000 successfully lunched. writing output to file [--xyz-transport.0.port 5000 --xyz-cli.enable true --xyz-cli.stdio file ]
creating logfile ./log/client.ms@127.0.0.1:5000.log
process worker.ms@127.0.0.1:6000 successfully lunched. writing output to file [--xyz-transport.0.port 6000 --xyz-cli.enable true --xyz-cli.stdio file ]
creating logfile ./log/worker.ms@127.0.0.1:6000.log
┌───────┬──────────────────────────┬──────────────────────────────────────────────────────────────────────────────────┐
│ Index │ Identifier               │ command line arguments                                                           │
├───────┼──────────────────────────┼──────────────────────────────────────────────────────────────────────────────────┤
│ 0     │ front.ms@127.0.0.1:4000  │ --xyz-transport.0.port 4000 --xyz-cli.enable true --xyz-cli.stdio file │
├───────┼──────────────────────────┼──────────────────────────────────────────────────────────────────────────────────┤
│ 1     │ client.ms@127.0.0.1:5000 │ --xyz-transport.0.port 5000 --xyz-cli.enable true --xyz-cli.stdio file │
├───────┼──────────────────────────┼──────────────────────────────────────────────────────────────────────────────────┤
│ 2     │ worker.ms@127.0.0.1:6000 │ --xyz-transport.0.port 6000 --xyz-cli.enable true --xyz-cli.stdio file │
└───────┴──────────────────────────┴──────────────────────────────────────────────────────────────────────────────────┘

```

xyz-cli is an interactive command line tool, meaning that you can keep entering commands to [get more info and do more stuff, like killing a node, creating a new one](https://github.com/node-xyz/xyz-cli#kill-identifier) and... You can further investigate your nodes with commands such as `top:`

![](https://github.com/node-xyz/xyz.example.risingstack.trace/blob/master/media/top.png?raw=true)

the message rates given make sense because the `front` node is basically idle at the moment, and the `client` is sending messages to `worker` (~13msg/sec).

> Wondering what `Ping Interval` is? See [this page](https://node-xyz.github.io/documentations/advance/ping-mechanisms).

>You might notice that all nodes, regardless of their `stdio` status, will start writing their outputs to file/terminal **only after they have been initialized**. This is a clean approach, yet it kinda makes it hard to catch exceptions at runtime, like things as simple as a typo. You can always add a `-e` to `xyz dev` command if you sense that something is wrong. This flag will cause all nodes to output their logs to the current terminal **during initialization phase**, which is very critical. So if any of them have an exception, you'll see it.

We can talk for another hour about xyz-core and xyz-cli, but as you might recall from the title of this article, this wasn't our main goal!. Let's keep things simple like this and switch this project to be monitored by Trace.

> PS. In case you _actually_ want to read for another twenty minutes about xyz you can read these [two](https://medium.com/@kianpeymani/a-microservice-microframework-for-node-node-xyz-part-1-5b9a2d40716) [articles](https://medium.com/@kianpeymani/a-microservice-microframework-for-node-node-xyz-part-2-a1d430b761ee) on Medium.

## Monitoring with Trace

While it's just about...  **ok** to see a list of nodes deployed with xyz-cli, we can't ignore that it's a basic tool. If you want to deploy multiple nodes across multiple servers, xyz-cli will lack some functionalities. To fulfill this requirement, Trance is a perfect solution and can be integrated with xyz-cli with no hassle.

### Adding trance Configuration

In order to get started with trace, you can sign up for a 14 day [trial](https://trace.risingstack.com/app/). This will be just enough to get us started with this service. Next, you should read the [Getting Started](https://trace-docs.risingstack.com/docs) section. As mentioned, there are two ways to integrate a node process with Trace:
  - using environment variables
  - using a config file.

While both are possible, using the former solution is much easier. So we will choose that.

After signing up with Trace and creating an infrastructure (which I've named `node-xyz-test`), you should create services. For this tutorial, we will create 3 services, concomitant with the three services that we have:
  - `worker`
  - `client`
  - `front`

Per each service, you will receive a set of instructions to follow in order to integrate the process with Trace. Each service will get a unique `name` and an `apiKey`. The apiKey is common among all services in an infrastructure.

Next, we must include Trace module in all of our services. You must only add the following line at the beginning of each file, give that you have installed `@risingstack/trace`:

```javascript
const trace = require('@risingstack/trace')
```

Finally, you should add the service name and apiKey to each process at runtime. Hopefully, `xyz-cli` provides a handy way to do this. You can just add one key, named `env`, to each node in `xyz.js`:

```json
{
  "nodes": [
    {
      "path": "./front.js",
      "port": 4000,
      "stdio": "file",
      "env": "TRACE_API_KEY {YOUR_API_KEY} TRACE_SERVICE_NAME front"

    },
    {
      "path": "./client.js",
      "port": 5000,
      "stdio": "file",
      "env": "TRACE_API_KEY {YOUR_API_KEY} TRACE_SERVICE_NAME client"
    },
    {
      "path": "./worker.js",
      "port": 6000,
      "stdio": "file",
      "env": "TRACE_API_KEY {YOUR_API_KEY} TRACE_SERVICE_NAME worker"
    }
  ]
}
```

You must only replace `{YOUR_API_KEY}` inside the file.

> Reminder: If you want do deploy nodes across multiple servers, you **must** replace `selfConf.host` in each node with the remote address values

And there it is! Out sweet microservices appear inside Trace:

Services should appear in your panel:

![](https://github.com/node-xyz/xyz.example.risingstack.trace/blob/master/media/trace_setting.png?raw=true)

The Topology should also start to shape:

![](https://github.com/node-xyz/xyz.example.risingstack.trace/blob/master/media/trace_top_1.png?raw=true)

With message rates being added within a second:

![](https://github.com/node-xyz/xyz.example.risingstack.trace/blob/master/media/trace_top_2.png?raw=true)

Also, don't forget to see how the Metrics page to see some important information.

![](https://github.com/node-xyz/xyz.example.risingstack.trace/blob/master/media/met.png?raw=true)

Notes:
  - During this tutorial, I deployed all services in a single VPS and ran a benchmark test on them using [Apache Benchmark, aka. ab](https://httpd.apache.org/docs/2.4/programs/ab.html). That's why you see an external client sending messages to `Front`. The benchmark was similar to this:

  `ab -k -p post.data -c 10 -n 20000 HTTP://SERVER_IP:4001/service\?service_path\=task/cpu`

  `post.data` file is irrelevant since we are not using the post body but the query instead.

  Remember that `Front` node was listening for **external clients** on port 4001.
  - Aside from the thick lines between
    - Client -> Worker
    - External -> Front | Front -> Worker

  which were our job, what are the other thinner lines indicating small message rates (~10rmp)? what about the circulating lines from one node to itself? Those are because of the [Default Ping](https://node-xyz.github.io/documentations/advance/ping-mechanisms) mechanism in xyz. This mechanism basically keeps track of all nodes inside a system and what functions they are exposing, hence it need to send some messages under the hood every once in a while to check other nodes. This is why you can simply call `ms.call({service: ...})` and the message will be redirected automatically, even if the destination is in another host all the way across the globe.

  - During the peak of response time in the last image, I was taking heavy benchmarks from `?service_path\=task/io`, which is more intensive.

You can read the [full documentation of xyz](https://node-xyz.github.io/documentations) and [Trace](https://trace-docs.risingstack.com/) if you want to learn more!

The full code of this tutorial can be obtained from [here](https://github.com/node-xyz/xyz.example.risingstack.trace).

I hope that you have enjoyed this article. I will sone publish the second part of this article, in which we will scale out our worker service and use an internal load balancer to distribute the messages among them.

In the meantime, any comments or suggestions are welcomed.
