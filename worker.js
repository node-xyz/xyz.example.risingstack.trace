const trace = require('@risingstack/trace')
const XYZ = require('xyz-core')
const fs = require('fs')

// create a new microservice
let worker = new XYZ({
  selfConf: {
    name: 'worker.ms',

    // rename this if you want to deploy on a VPS
    host: '127.0.0.1',

    transport: [{type: 'HTTP', port: 6000}],

    // all nodes will connect to seed node which is Client service
    seed: ['127.0.0.1:5000'],

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

console.log(worker)
